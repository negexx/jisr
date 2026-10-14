import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { describe } from "vitest";

/**
 * Race and transaction specs need real, concurrent Postgres connections (row locks,
 * serialisation failures), which PGlite's single-connection socket cannot give. They run
 * against the Postgres named by TEST_POSTGRES_URL (a CI service container, or a local
 * `docker run`) and are skipped when it is unset. Each spec works in its own throwaway
 * DATABASE, not schema: drizzle-kit writes `"public"."table"` references and
 * `CREATE TYPE "public"."enum"`, which search_path cannot redirect, so only a separate
 * database keeps parallel files and reruns from colliding. See tests/db-race/README.md.
 */

export const RACE_SKIP_REASON =
  "TEST_POSTGRES_URL unset: race specs need a real Postgres (PGlite is single-connection)";

const MIGRATIONS_DIR = "drizzle";

export function raceDatabase(): { url: string } | null {
  const url = process.env.TEST_POSTGRES_URL;
  return url ? { url } : null;
}

export const describeRace = (name: string, factory: () => void): void => {
  if (raceDatabase()) {
    describe(name, factory);
  } else {
    // Vitest's skip carries no reason, so the title does.
    describe.skip(`${name} [${RACE_SKIP_REASON}]`, factory);
  }
};

export type RaceDatabase = {
  /** Name of the throwaway database, `race_<12 hex>`. */
  readonly name: string;
  readonly url: string;
  /** A pool on the throwaway database; ended by drop(). Idle-client errors fail drop(). */
  createPool: (max: number) => Pool;
  /** False only while drizzle/ does not exist yet (before todo 4): the tolerated empty path. */
  readonly migrated: boolean;
  /** Ends every pool, drops the database (forcibly), then throws if a pool reported an error. */
  drop: () => Promise<void>;
};

function quoteIdent(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function urlForDatabase(baseUrl: string, database: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

export async function createRaceDatabase(
  options: { repoRoot?: string; migrationsDir?: string } = {},
): Promise<RaceDatabase> {
  const server = raceDatabase();
  if (!server) throw new Error(RACE_SKIP_REASON);

  const name = `race_${randomBytes(6).toString("hex")}`;
  const url = urlForDatabase(server.url, name);
  const repoRoot = options.repoRoot ?? process.cwd();
  const migrationsDir = options.migrationsDir ?? resolve(repoRoot, MIGRATIONS_DIR);

  const pools: Pool[] = [];
  const poolErrors: Error[] = [];
  const createPool = (max: number): Pool => {
    const pool = new Pool({ connectionString: url, max });
    // An unhandled 'error' on an idle client would crash the worker; keep it and fail drop().
    pool.on("error", (error) => poolErrors.push(error));
    pools.push(pool);
    return pool;
  };

  const admin = new Pool({ connectionString: server.url, max: 1 });
  admin.on("error", (error) => poolErrors.push(error));
  await admin.query(`create database ${quoteIdent(name)}`);

  const drop = async (): Promise<void> => {
    await Promise.all(pools.splice(0).map((pool) => pool.end()));
    try {
      await admin.query(`drop database if exists ${quoteIdent(name)} with (force)`);
    } finally {
      await admin.end();
    }
    const [firstError] = poolErrors;
    if (firstError) throw new Error(`a race pool reported an error: ${firstError.message}`);
  };

  let migrated = false;
  if (existsSync(migrationsDir)) {
    // A migrations folder without a journal is broken, not "empty": fail, locally and in CI.
    if (!existsSync(resolve(migrationsDir, "meta", "_journal.json"))) {
      await drop();
      throw new Error(`${migrationsDir} exists but has no meta/_journal.json`);
    }
    const migrationPool = createPool(1);
    try {
      await migrate(drizzle(migrationPool), { migrationsFolder: migrationsDir });
      migrated = true;
    } catch (error) {
      await drop();
      throw error;
    }
  } else {
    console.log(
      `[db-race] no migrations found in ${migrationsDir}; tolerating the empty-migration path`,
    );
  }

  return { name, url, createPool, migrated, drop };
}
