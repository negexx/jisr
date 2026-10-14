import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";

import { createRaceDatabase, describeRace, type RaceDatabase } from "./pg";

const LOCK_WAIT_TIMEOUT_MS = 10_000;

async function waitUntilBlockedOnLock(observer: Pool, pid: number): Promise<void> {
  const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const { rows } = await observer.query<{ wait_event_type: string | null }>(
      "select wait_event_type from pg_stat_activity where pid = $1",
      [pid],
    );
    if (rows[0]?.wait_event_type === "Lock") return;
    await new Promise((settle) => setTimeout(settle, 25));
  }
  throw new Error(`backend ${pid} never started waiting on a lock`);
}

describeRace("race harness", () => {
  let race: RaceDatabase;
  let pool: Pool;
  let clientA: PoolClient;
  let clientB: PoolClient;

  beforeAll(async () => {
    race = await createRaceDatabase();
    pool = race.createPool(3);
    await pool.query("create table lock_probe (id integer primary key, value text not null)");
    await pool.query("insert into lock_probe (id, value) values (1, 'initial')");
    clientA = await pool.connect();
    clientB = await pool.connect();
  });

  afterAll(async () => {
    clientA?.release();
    clientB?.release();
    await race?.drop();
  });

  it("connects every client to the throwaway database", async () => {
    const { rows } = await clientA.query<{ name: string }>("select current_database() as name");
    expect(rows[0]?.name).toBe(race.name);
    expect(race.name).toMatch(/^race_[0-9a-f]{12}$/);
  });

  it("holds two distinct real connections", async () => {
    const a = await clientA.query<{ pid: number }>("select pg_backend_pid() as pid");
    const b = await clientB.query<{ pid: number }>("select pg_backend_pid() as pid");
    expect(a.rows[0]?.pid).toBeTypeOf("number");
    expect(b.rows[0]?.pid).toBeTypeOf("number");
    expect(a.rows[0]?.pid).not.toBe(b.rows[0]?.pid);
  });

  it("blocks select for update in one client until the other commits", async () => {
    const pidB = (await clientB.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]
      ?.pid;
    if (pidB === undefined) throw new Error("no backend pid for client B");

    await clientA.query("begin");
    await clientA.query("select * from lock_probe where id = 1 for update");
    await clientA.query("update lock_probe set value = 'locked-by-a' where id = 1");

    await clientB.query("begin");
    let bAcquired = false;
    const bAttempt = clientB
      .query<{ value: string }>("select value from lock_probe where id = 1 for update")
      .then((result) => {
        bAcquired = true;
        return result;
      });

    await waitUntilBlockedOnLock(pool, pidB);
    expect(bAcquired).toBe(false);

    await clientA.query("commit");
    const result = await bAttempt;
    await clientB.query("commit");

    expect(bAcquired).toBe(true);
    expect(result.rows[0]?.value).toBe("locked-by-a");
  });
});
