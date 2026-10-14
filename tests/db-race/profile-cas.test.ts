import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

import { type Profile, ProfileSchema } from "@/data-schema/profile";
import * as schema from "@/db/schema";
import { type AccountDb, saveProfileFor } from "@/lib/server/account-store";

import { createRaceDatabase, describeRace, type RaceDatabase } from "./pg";

const USER_ID = "race-user";
const ROUNDS = 10;

const PROFILE: Profile = ProfileSchema.parse({
  schemaVersion: 1,
  nationality: "MA",
  credential: {
    country: "MA",
    type: "bac",
    track: "sciences-maths-a",
    status: "expected",
    overall: null,
    subjects: [],
  },
  priorHigherEducationYears: 0,
  languages: [],
  fields: ["computer-science"],
  studyLanguages: ["fr"],
  destinations: ["FR"],
  budget: null,
  institutionType: "any",
});
const FROM_PHONE: Profile = { ...PROFILE, destinations: ["DE"] };
const FROM_LAPTOP: Profile = { ...PROFILE, destinations: ["NL"] };

describeRace("saveProfile compare-and-set under real concurrency", () => {
  let race: RaceDatabase;
  let admin: Pool;
  let phone: AccountDb;
  let laptop: AccountDb;

  beforeAll(async () => {
    race = await createRaceDatabase();
    admin = race.createPool(1);
    phone = drizzle({ client: race.createPool(1), schema });
    laptop = drizzle({ client: race.createPool(1), schema });
    await admin.query(
      `insert into "user" (id, name, email) values ($1, 'Racer', 'racer@example.com')`,
      [USER_ID],
    );
  });

  beforeEach(async () => {
    await admin.query("delete from profiles");
  });

  afterAll(async () => {
    await race?.drop();
  });

  async function stored(): Promise<{ data: Profile; revision: number } | undefined> {
    const { rows } = await admin.query<{ data: Profile; revision: number }>(
      "select data, revision from profiles where user_id = $1",
      [USER_ID],
    );
    return rows[0];
  }

  it(`lets exactly one of two simultaneous saves at revision 3 win (${ROUNDS} rounds)`, async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      await admin.query("delete from profiles");
      await admin.query("insert into profiles (user_id, data, revision) values ($1, $2, 3)", [
        USER_ID,
        PROFILE,
      ]);
      const [fromPhone, fromLaptop] = await Promise.all([
        saveProfileFor(phone, USER_ID, FROM_PHONE, 3),
        saveProfileFor(laptop, USER_ID, FROM_LAPTOP, 3),
      ]);
      const winnerProfile = fromPhone.ok ? FROM_PHONE : FROM_LAPTOP;
      const loser = fromPhone.ok ? fromLaptop : fromPhone;
      expect(fromPhone.ok !== fromLaptop.ok).toBe(true);
      expect(fromPhone.ok ? fromPhone : fromLaptop).toEqual({
        ok: true,
        value: { revision: 4 },
      });
      expect(loser).toEqual({
        ok: false,
        error: "conflict",
        current: { profile: winnerProfile, revision: 4 },
      });
      expect(await stored()).toEqual({ data: winnerProfile, revision: 4 });
    }
  });

  it(`lets exactly one of two simultaneous first saves create the row (${ROUNDS} rounds)`, async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      await admin.query("delete from profiles");
      const results = await Promise.all([
        saveProfileFor(phone, USER_ID, FROM_PHONE, 0),
        saveProfileFor(laptop, USER_ID, FROM_LAPTOP, 0),
      ]);
      expect(results.filter((result) => result.ok)).toEqual([{ ok: true, value: { revision: 1 } }]);
      expect(results.filter((result) => !result.ok && result.error === "conflict")).toHaveLength(1);
      expect((await stored())?.revision).toBe(1);
    }
  });
});
