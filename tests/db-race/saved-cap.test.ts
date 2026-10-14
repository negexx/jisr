import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { MAX_SAVED_PROGRAMS } from "@/lib/constants";
import type { SavedProgram } from "@/lib/saved/saved";
import { type AccountDb, saveProgramFor } from "@/lib/server/account-store";

import { createRaceDatabase, describeRace, type RaceDatabase } from "./pg";

const USER_ID = "race-user";
const ROUNDS = 10;

function program(slug: string): SavedProgram {
  return {
    slug,
    country: "FR",
    field: "computer-science",
    snapshotVersion: "0123456789ab",
    savedAt: "2026-10-14",
  };
}

describeRace("saveProgram cap under real concurrency", () => {
  let race: RaceDatabase;
  let admin: Pool;
  let phone: AccountDb;
  let laptop: AccountDb;

  beforeAll(async () => {
    race = await createRaceDatabase();
    admin = race.createPool(1);
    // One pool per device: each action runs on its own connection, so the two transactions
    // genuinely overlap in Postgres.
    phone = drizzle({ client: race.createPool(1), schema });
    laptop = drizzle({ client: race.createPool(1), schema });
    await admin.query(
      `insert into "user" (id, name, email) values ($1, 'Racer', 'racer@example.com')`,
      [USER_ID],
    );
  });

  beforeEach(async () => {
    await admin.query("delete from saved_programs");
    for (let index = 0; index < MAX_SAVED_PROGRAMS - 1; index += 1) {
      await admin.query(
        `insert into saved_programs (user_id, slug, country, field, snapshot_version, saved_at)
         values ($1, $2, 'FR', 'computer-science', '0123456789ab', '2026-10-01')`,
        [USER_ID, `xx-prog-${index}`],
      );
    }
  });

  afterAll(async () => {
    await race?.drop();
  });

  async function savedCount(): Promise<number> {
    const { rows } = await admin.query<{ count: string }>(
      "select count(*) as count from saved_programs where user_id = $1",
      [USER_ID],
    );
    return Number(rows[0]?.count);
  }

  it(`lets exactly one of two simultaneous saves at ${MAX_SAVED_PROGRAMS - 1} items win (${ROUNDS} rounds)`, async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      await admin.query(
        "delete from saved_programs where slug in ('xx-prog-phone', 'xx-prog-laptop')",
      );
      const results = await Promise.all([
        saveProgramFor(phone, USER_ID, program("xx-prog-phone")),
        saveProgramFor(laptop, USER_ID, program("xx-prog-laptop")),
      ]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, error: "saved_limit" }]);
      expect(await savedCount()).toBe(MAX_SAVED_PROGRAMS);
    }
  });

  it("lets two simultaneous saves of the same new programme both succeed with one row", async () => {
    const results = await Promise.all([
      saveProgramFor(phone, USER_ID, program("xx-prog-same")),
      saveProgramFor(laptop, USER_ID, program("xx-prog-same")),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(await savedCount()).toBe(MAX_SAVED_PROGRAMS);
  });
});
