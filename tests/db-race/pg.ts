import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { describe } from "vitest";

import { TEST_DB_MIGRATIONS_DIR } from "../db/harness";

/**
 * Race and transaction specs need real, concurrent Postgres connections (row locks,
 * serialisation failures), which PGlite's single-connection socket cannot give. They run
 * against the Postgres named by TEST_POSTGRES_URL (a CI service container, or a local
 * `docker run`) and are skipped when it is unset. Each spec works in its own throwaway
 * schema, so parallel files and reruns never collide. See tests/db-race/README.md.
 */

export const RACE_SKIP_REASON =
  "TEST_POSTGRES_URL unset: race specs need a real Postgres (PGlite is single-connection)";

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

export type RaceSchema = {
  readonly schema: string;
  /** A pool whose every connection has search_path set to the throwaway schema. */
  createPool: (max: number) => Pool;
  /** False until the first migration exists (todo 4): the tolerated empty path. */
  readonly migrated: boolean;
  /** Ends every pool created here and drops the schema. */
  drop: () => Promise<void>;
};

function quoteIdent(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export async function createRaceSchema(
  options: { repoRoot?: string; migrationsDir?: string } = {},
): Promise<RaceSchema> {
  const database = raceDatabase();
  if (!database) throw new Error(RACE_SKIP_REASON);

  const schema = `race_${randomBytes(6).toString("hex")}`;
  const repoRoot = options.repoRoot ?? process.cwd();
  const migrationsDir = options.migrationsDir ?? resolve(repoRoot, TEST_DB_MIGRATIONS_DIR);

  const pools: Pool[] = [];
  const createPool = (max: number): Pool => {
    const pool = new Pool({
      connectionString: database.url,
      max,
      options: `-c search_path=${schema}`,
    });
    pools.push(pool);
    return pool;
  };

  const admin = new Pool({ connectionString: database.url, max: 1 });
  await admin.query(`create schema ${quoteIdent(schema)}`);

  const dropSchema = async (): Promise<void> => {
    await Promise.all(pools.splice(0).map((pool) => pool.end()));
    try {
      await admin.query(`drop schema if exists ${quoteIdent(schema)} cascade`);
    } finally {
      await admin.end();
    }
  };

  let migrated = false;
  if (existsSync(resolve(migrationsDir, "meta", "_journal.json"))) {
    const migrationPool = createPool(1);
    try {
      // The bookkeeping table lives in the same schema, not the shared "drizzle" one.
      await migrate(drizzle(migrationPool), {
        migrationsFolder: migrationsDir,
        migrationsSchema: schema,
      });
      migrated = true;
    } catch (error) {
      await dropSchema();
      throw error;
    }
  } else {
    console.log(
      `[db-race] no migrations found in ${migrationsDir}; tolerating the empty-migration path`,
    );
  }

  return { schema, createPool, migrated, drop: dropSchema };
}
