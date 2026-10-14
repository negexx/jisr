import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

/**
 * In-process test database: PGlite (a WASM build of Postgres) behind a local TCP
 * socket, so `pg`, drizzle-kit and the Next app can connect to an ordinary
 * Postgres connection string with no external service, no Neon and no secrets.
 *
 * PGlite 0.5.9 is PostgreSQL 18.6 and the Neon project's major is Postgres 18, so
 * migration SQL exercised here applies unchanged to Neon. See tests/db/README.md.
 */

export const TEST_DB_HOST = "127.0.0.1";
// A fixed default port (not 0) so a second boot fails loudly on the bind instead
// of silently taking another port; specs that need isolation pass port 0.
export const TEST_DB_DEFAULT_PORT = 54329;
export const TEST_DB_MAX_CONNECTIONS = 10;
export const TEST_DB_MIGRATIONS_DIR = "drizzle";

export class TestDatabasePortInUseError extends Error {
  readonly host: string;
  readonly port: number;

  constructor(host: string, port: number, cause: unknown) {
    super(
      `Test database port ${host}:${port} is already in use: another harness is running. Stop it or pass a different port.`,
      { cause },
    );
    this.name = "TestDatabasePortInUseError";
    this.host = host;
    this.port = port;
  }
}

export class TestDatabaseMigrationError extends Error {
  constructor(output: string) {
    super(`drizzle-kit migrate failed against the test database:\n${output.trim()}`);
    this.name = "TestDatabaseMigrationError";
  }
}

export type TestDatabaseStats = {
  activeConnections: number;
  queuedQueries: number;
  maxConnections: number;
};

export type MigrationResult = { applied: boolean };

export type TestDatabase = {
  readonly host: string;
  readonly port: number;
  /** Connection string to hand to `pg`, drizzle-kit and the app. SSL is disabled. */
  readonly databaseUrl: string;
  /** Apply `drizzle/` migrations; a no-op (applied: false) when the migrations directory is missing. */
  migrate: () => Promise<MigrationResult>;
  stats: () => TestDatabaseStats;
  stop: () => Promise<void>;
};

export type StartTestDatabaseOptions = {
  /** Port to bind; 0 lets the OS pick a free one. Defaults to TEST_DB_DEFAULT_PORT. */
  port?: number;
  host?: string;
  /** PGlite data directory; omitted means an in-memory database. */
  dataDir?: string;
  maxConnections?: number;
  /** Run migrations during start; defaults to true. */
  runMigrations?: boolean;
  /** Repo root used to locate the migrations directory; defaults to process.cwd(). */
  repoRoot?: string;
  /** Migrations directory holding meta/_journal.json; defaults to <repoRoot>/drizzle. */
  migrationsDir?: string;
};

function isAddrInUse(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "EADDRINUSE"
  );
}

function portFromServerConn(serverConn: string, fallback: number): number {
  const separator = serverConn.lastIndexOf(":");
  if (separator === -1) return fallback;
  const parsed = Number.parseInt(serverConn.slice(separator + 1), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function runDrizzleKitMigrate(
  repoRoot: string,
  databaseUrl: string,
): Promise<{ code: number; output: string }> {
  return new Promise((resolveRun) => {
    const child = spawn("pnpm", ["exec", "drizzle-kit", "migrate"], {
      cwd: repoRoot,
      // drizzle-kit's connection-backed subcommands read the direct (unpooled) URL;
      // both point at the same harness socket here.
      env: { ...process.env, DATABASE_URL: databaseUrl, DATABASE_URL_UNPOOLED: databaseUrl },
      shell: process.platform === "win32",
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("error", (error) => resolveRun({ code: 1, output: `${output}\n${String(error)}` }));
    child.on("close", (code) => resolveRun({ code: code ?? 1, output }));
  });
}

export async function startTestDatabase(
  options: StartTestDatabaseOptions = {},
): Promise<TestDatabase> {
  const host = options.host ?? TEST_DB_HOST;
  const requestedPort = options.port ?? TEST_DB_DEFAULT_PORT;
  const repoRoot = options.repoRoot ?? process.cwd();
  const migrationsDir = options.migrationsDir ?? resolve(repoRoot, TEST_DB_MIGRATIONS_DIR);

  const db = await PGlite.create(options.dataDir ? { dataDir: options.dataDir } : undefined);
  const server = new PGLiteSocketServer({
    db,
    host,
    port: requestedPort,
    maxConnections: options.maxConnections ?? TEST_DB_MAX_CONNECTIONS,
  });

  try {
    await server.start();
  } catch (error) {
    await db.close().catch(() => undefined);
    if (isAddrInUse(error)) throw new TestDatabasePortInUseError(host, requestedPort, error);
    throw error;
  }

  const port = portFromServerConn(server.getServerConn(), requestedPort);
  const databaseUrl = `postgres://postgres@${host}:${port}/postgres?sslmode=disable`;

  const migrate = async (): Promise<MigrationResult> => {
    const journal = resolve(migrationsDir, "meta", "_journal.json");
    if (!existsSync(journal)) {
      // drizzle-kit exits 1 with no message on a missing migrations directory, so a
      // directory with no journal is the tolerated no-op.
      console.log(
        `[test-db] no migrations found in ${migrationsDir}; tolerating the empty-migration path`,
      );
      return { applied: false };
    }
    const result = await runDrizzleKitMigrate(repoRoot, databaseUrl);
    if (result.code !== 0) throw new TestDatabaseMigrationError(result.output);
    return { applied: true };
  };

  const stop = async (): Promise<void> => {
    await server.stop();
    await db.close();
  };

  if (options.runMigrations !== false) {
    try {
      await migrate();
    } catch (error) {
      await stop();
      throw error;
    }
  }

  return {
    host,
    port,
    databaseUrl,
    migrate,
    stats: () => server.getStats(),
    stop,
  };
}
