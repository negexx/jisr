import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";

import { type Profile, ProfileSchema } from "@/data-schema/profile";
import * as schema from "@/db/schema";
import { type AccountDb, clearAccountDataFor, saveProfileFor } from "@/lib/server/account-store";

import { createRaceDatabase, describeRace, type RaceDatabase } from "./pg";

const USER_ID = "race-user";
const ROUNDS = 20;

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
const STALE: Profile = { ...PROFILE, destinations: ["IT"] };

// A Clear my data racing a first profile save from another device: whichever lands first, no
// profile row ever gets a revision handed out before, so a device still holding an old revision is
// refused instead of overwriting (the ABA the revision floor exists for).
describeRace("profile revisions under a concurrent clear", () => {
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

  afterAll(async () => {
    await race?.drop();
  });

  it(`never hands out a revision twice (${ROUNDS} rounds)`, async () => {
    let highest = 0;
    for (let round = 0; round < ROUNDS; round += 1) {
      // A profile exists and another device holds its revision.
      const { rows } = await admin.query<{ revision: number }>(
        "select revision from profiles where user_id = $1",
        [USER_ID],
      );
      let held = rows[0]?.revision;
      if (held === undefined) {
        const created = await saveProfileFor(phone, USER_ID, PROFILE, 0);
        if (!created.ok) throw new Error("could not create the profile");
        held = created.value.revision;
        expect(held).toBeGreaterThan(highest);
        highest = held;
      } else {
        // The row the previous round's save created.
        expect(held).toBe(highest);
      }

      const [, saved] = await Promise.all([
        clearAccountDataFor(phone, USER_ID),
        saveProfileFor(laptop, USER_ID, PROFILE, 0),
      ]);
      if (saved.ok) {
        expect(saved.value.revision).toBeGreaterThan(highest);
        highest = saved.value.revision;
      }
      const stale = await saveProfileFor(phone, USER_ID, STALE, held);
      expect(stale.ok).toBe(false);
    }
  });
});
