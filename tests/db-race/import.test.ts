import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";

import { type Profile, ProfileSchema } from "@/data-schema/profile";
import * as schema from "@/db/schema";
import type { SavedProgram } from "@/lib/saved/saved";
import type { AccountDb } from "@/lib/server/account-store";
import { type GuestImportPayload, importGuestDataFor } from "@/lib/server/import-store";

import { createRaceDatabase, describeRace, type RaceDatabase } from "./pg";

const USER_ID = "race-user";
const ROUNDS = 10;
const USER_DATA_TABLES = ["saved_programs", "checklist_progress", "profiles", "user_data_state"];

function program(slug: string): SavedProgram {
  return {
    slug,
    country: "FR",
    field: "computer-science",
    snapshotVersion: "0123456789ab",
    savedAt: "2026-10-14",
  };
}

function profile(destination: "FR" | "NL"): Profile {
  return ProfileSchema.parse({
    schemaVersion: 2,
    nationality: "MA",
    credential: {
      country: "MA",
      type: "bac",
      track: "sciences-maths-a",
      status: "expected",
      overall: { scale: "ma-20", value: 14 },
      subjects: [],
    },
    priorHigherEducationYears: destination === "FR" ? 1 : 2,
    languages: [{ language: "fr", level: "B2", certificate: null }],
  });
}

// Two devices of one account, each with its own guest data. The saves overlap on purpose: a
// duplicate row would show as a count above the winner's list.
const PHONE: GuestImportPayload = {
  profile: profile("FR"),
  saved: [program("xx-prog-shared"), program("xx-prog-phone")],
  plan: { "xx-prog-shared": ["visa"] },
};
const LAPTOP: GuestImportPayload = {
  profile: profile("NL"),
  saved: [program("xx-prog-shared"), program("xx-prog-laptop"), program("xx-prog-laptop-2")],
  plan: { "xx-prog-shared": ["documents", "visa"] },
};

describeRace("importGuestData under real concurrency", () => {
  let race: RaceDatabase;
  let admin: Pool;
  let phone: AccountDb;
  let laptop: AccountDb;

  beforeAll(async () => {
    race = await createRaceDatabase();
    admin = race.createPool(1);
    // One pool per device: each import runs on its own connection, so the two transactions
    // genuinely overlap in Postgres.
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

  async function rows(table: string): Promise<number> {
    const { rows: found } = await admin.query<{ count: string }>(
      `select count(*) as count from ${table} where user_id = $1`,
      [USER_ID],
    );
    return Number(found[0]?.count);
  }

  async function savedSlugs(): Promise<string[]> {
    const { rows: found } = await admin.query<{ slug: string }>(
      "select slug from saved_programs where user_id = $1 order by slug",
      [USER_ID],
    );
    return found.map((row) => row.slug);
  }

  it(`lets exactly one of two simultaneous "auto" imports win, with no duplicate rows (${ROUNDS} rounds)`, async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      for (const table of USER_DATA_TABLES) await admin.query(`delete from ${table}`);
      const [fromPhone, fromLaptop] = await Promise.all([
        importGuestDataFor(phone, USER_ID, PHONE, "auto"),
        importGuestDataFor(laptop, USER_ID, LAPTOP, "auto"),
      ]);
      const results = [fromPhone, fromLaptop];
      expect(results.filter((result) => result.ok)).toEqual([{ ok: true, value: undefined }]);
      expect(results.filter((result) => !result.ok)).toEqual([
        { ok: false, error: "has_server_data" },
      ]);

      const winner = fromPhone.ok ? PHONE : LAPTOP;
      expect(await savedSlugs()).toEqual(winner.saved.map((item) => item.slug).sort());
      expect(await rows("saved_programs")).toBe(winner.saved.length);
      expect(await rows("checklist_progress")).toBe(winner.plan["xx-prog-shared"]?.length);
      expect(await rows("profiles")).toBe(1);
      const { rows: stored } = await admin.query<{ data: Profile; revision: number }>(
        "select data, revision from profiles where user_id = $1",
        [USER_ID],
      );
      expect(stored).toEqual([{ data: winner.profile, revision: 1 }]);
      expect(await rows("user_data_state")).toBe(1);
    }
  });
  // Without a profile there is no unique row to collide on first: only the user-row lock keeps the
  // loser from inserting its saves next to the winner's.
  it(`lets one of two simultaneous saves-only imports win, through the user-row lock (${ROUNDS} rounds)`, async () => {
    const phoneSaves = { ...PHONE, profile: null };
    const laptopSaves = { ...LAPTOP, profile: null };
    for (let round = 0; round < ROUNDS; round += 1) {
      for (const table of USER_DATA_TABLES) await admin.query(`delete from ${table}`);
      const [fromPhone, fromLaptop] = await Promise.all([
        importGuestDataFor(phone, USER_ID, phoneSaves, "auto"),
        importGuestDataFor(laptop, USER_ID, laptopSaves, "auto"),
      ]);
      expect([fromPhone, fromLaptop].filter((result) => result.ok)).toHaveLength(1);
      expect([fromPhone, fromLaptop].filter((result) => !result.ok)).toEqual([
        { ok: false, error: "has_server_data" },
      ]);
      const winner = fromPhone.ok ? phoneSaves : laptopSaves;
      expect(await savedSlugs()).toEqual(winner.saved.map((item) => item.slug).sort());
      expect(await rows("profiles")).toBe(0);
    }
  });
});
