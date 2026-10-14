import { resolve } from "node:path";

import { Client } from "pg";
import { afterEach, describe, expect, it } from "vitest";

import {
  type StartTestDatabaseOptions,
  startTestDatabase,
  type TestDatabase,
  TestDatabasePortInUseError,
} from "./harness";

const TIMEOUT_MS = 30_000;
const running: TestDatabase[] = [];

async function start(options: StartTestDatabaseOptions): Promise<TestDatabase> {
  const db = await startTestDatabase(options);
  running.push(db);
  return db;
}

afterEach(async () => {
  for (const db of running.splice(0)) {
    await db.stop().catch(() => undefined);
  }
});

describe("test database harness", () => {
  it(
    "connects over the harness URL, applies the committed migrations and runs select 1",
    async () => {
      const db = await start({ port: 0, runMigrations: false });

      expect(await db.migrate()).toEqual({ applied: true });

      const client = new Client({ connectionString: db.databaseUrl });
      await client.connect();
      try {
        const result = await client.query("select 1 as one");
        expect(result.rows).toEqual([{ one: 1 }]);
      } finally {
        await client.end();
      }
    },
    TIMEOUT_MS,
  );

  it(
    "tolerates a missing migrations directory as an empty-migration no-op",
    async () => {
      const db = await start({
        port: 0,
        runMigrations: false,
        migrationsDir: resolve(process.cwd(), "tests", "db", "no-such-migrations"),
      });
      expect(await db.migrate()).toEqual({ applied: false });
    },
    TIMEOUT_MS,
  );

  it(
    "frees the listening port on teardown so the same port can be re-bound",
    async () => {
      const first = await startTestDatabase({ port: 0, runMigrations: false });
      const assignedPort = first.port;
      await first.stop();

      const second = await start({ port: assignedPort, runMigrations: false });
      expect(second.port).toBe(assignedPort);
    },
    TIMEOUT_MS,
  );

  it(
    "fails cleanly with a named error when a second boot binds an in-use port",
    async () => {
      const first = await start({ port: 0, runMigrations: false });

      const attempt = startTestDatabase({ port: first.port, runMigrations: false });
      await expect(attempt).rejects.toBeInstanceOf(TestDatabasePortInUseError);
      await expect(attempt).rejects.toMatchObject({
        name: "TestDatabasePortInUseError",
        port: first.port,
      });

      // No silent second instance: the running harness still owns its socket.
      expect(first.stats().activeConnections).toBe(0);
    },
    TIMEOUT_MS,
  );
});
