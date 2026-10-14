import { Pool } from "pg";
import { describe, expect, it } from "vitest";

import { createRaceDatabase, describeRace, type RaceDatabase } from "./pg";

const NO_MIGRATIONS = "tests/db-race/fixtures/does-not-exist";

function postgresError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

function adminShutdown(): Error {
  return postgresError("57P01", "terminating connection due to administrator command");
}

/** Emits `error` on the pool right after the real end() resolves: inside drop()'s window. */
function failAfterEnd(pool: Pool, error: Error): void {
  const end = pool.end.bind(pool);
  pool.end = async () => {
    await end();
    pool.emit("error", error);
  };
}

async function freshRace(): Promise<RaceDatabase> {
  return createRaceDatabase({ migrationsDir: NO_MIGRATIONS });
}

describeRace("race harness teardown", () => {
  it("drops a database whose pool still holds an idle connection", async () => {
    const race = await freshRace();
    const pool = race.createPool(2);
    await pool.query("select 1");

    await expect(race.drop()).resolves.toBeUndefined();
  });

  it("ignores the forced-drop disconnect that arrives while tearing down", async () => {
    const race = await freshRace();
    const pool = race.createPool(1);
    await pool.query("select 1");
    failAfterEnd(pool, adminShutdown());

    await expect(race.drop()).resolves.toBeUndefined();
  });

  it("still fails when a different error arrives while tearing down", async () => {
    const race = await freshRace();
    const pool = race.createPool(1);
    await pool.query("select 1");
    failAfterEnd(pool, postgresError("08006", "connection failure"));

    await expect(race.drop()).rejects.toThrow(/a race pool reported an error: connection failure/);
  });

  describe("errors recorded before teardown", () => {
    it("fail drop() when they are not an admin shutdown", async () => {
      const race = await freshRace();
      const pool = race.createPool(1);
      pool.emit("error", postgresError("08006", "connection failure"));

      await expect(race.drop()).rejects.toThrow(
        /a race pool reported an error: connection failure/,
      );
    });

    it("fail drop() even when they are an admin shutdown", async () => {
      const race = await freshRace();
      const pool = race.createPool(1);
      pool.emit("error", adminShutdown());

      await expect(race.drop()).rejects.toThrow(
        /a race pool reported an error: terminating connection/,
      );
    });
  });

  it("reports a backend terminated while the pool was idle, because it happened before teardown", async () => {
    const race = await freshRace();
    const pool = race.createPool(1);
    const { rows } = await pool.query<{ pid: number }>("select pg_backend_pid() as pid");
    const pid = rows[0]?.pid;
    if (pid === undefined) throw new Error("no backend pid");

    const serverUrl = new URL(race.url);
    serverUrl.pathname = "/postgres";
    const killer = new Pool({ connectionString: serverUrl.toString(), max: 1 });
    try {
      await killer.query("select pg_terminate_backend($1)", [pid]);
      await new Promise((settle) => setTimeout(settle, 200));
    } finally {
      await killer.end();
    }

    await expect(race.drop()).rejects.toThrow(/a race pool reported an error/);
  });
});
