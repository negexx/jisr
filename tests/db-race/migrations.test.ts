import { resolve } from "node:path";

import { afterAll, beforeAll, expect, it } from "vitest";

import { createRaceDatabase, describeRace, type RaceDatabase } from "./pg";

const fixtureMigrations = resolve(__dirname, "fixtures", "migrations");

describeRace("race databases with drizzle-kit style migrations", () => {
  let first: RaceDatabase;
  let second: RaceDatabase;

  beforeAll(async () => {
    // Concurrent on purpose: schema-qualified FKs and enums collided here under schema isolation.
    [first, second] = await Promise.all([
      createRaceDatabase({ migrationsDir: fixtureMigrations }),
      createRaceDatabase({ migrationsDir: fixtureMigrations }),
    ]);
  });

  afterAll(async () => {
    await Promise.all([first?.drop(), second?.drop()]);
  });

  it("applies public-qualified foreign keys and enums in each separate database", async () => {
    expect(first.migrated).toBe(true);
    expect(second.migrated).toBe(true);
    expect(first.name).not.toBe(second.name);

    for (const race of [first, second]) {
      const pool = race.createPool(1);
      await pool.query("insert into fixture_user (id) values ('u1')");
      await pool.query("insert into fixture_session (id, user_id) values ('s1', 'u1')");
      await expect(
        pool.query("insert into fixture_session (id, user_id) values ('s2', 'missing')"),
      ).rejects.toMatchObject({ code: "23503" });
      const { rows } = await pool.query<{ role: string }>("select role from fixture_user");
      expect(rows[0]?.role).toBe("student");
    }
  });

  it("keeps each database independent", async () => {
    const { rows } = await second
      .createPool(1)
      .query<{ count: string }>("select count(*) as count from fixture_user");
    expect(rows[0]?.count).toBe("1");
  });
});
