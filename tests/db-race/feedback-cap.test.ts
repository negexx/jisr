import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

import * as schema from "@/db/schema";
import {
  type AccountDb,
  createFeedbackReportFor,
  FEEDBACK_REPORTS_PER_DAY,
} from "@/lib/server/account-store";

import { createRaceDatabase, describeRace, type RaceDatabase } from "./pg";

const USER_ID = "race-user";
const ROUNDS = 10;
const REPORT = {
  record: "programs/xx-test-prog",
  path: "tuition",
  sourceUrl: "https://example.org/fees",
  snapshotVersion: "0123456789ab",
};

describeRace("createFeedbackReport daily cap under real concurrency", () => {
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
    await admin.query("delete from feedback_reports");
  });

  afterAll(async () => {
    await race?.drop();
  });

  it(`lets exactly one of two simultaneous reports at ${FEEDBACK_REPORTS_PER_DAY - 1} win (${ROUNDS} rounds)`, async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      await admin.query("delete from feedback_reports");
      await admin.query(
        `insert into feedback_reports (user_id, record, path, source_url, snapshot_version)
         select $1, 'programs/xx-test-prog', 'tuition', 'https://example.org/fees', '0123456789ab'
         from generate_series(1, $2::int)`,
        [USER_ID, FEEDBACK_REPORTS_PER_DAY - 1],
      );
      const results = await Promise.all([
        createFeedbackReportFor(phone, USER_ID, REPORT),
        createFeedbackReportFor(laptop, USER_ID, REPORT),
      ]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.filter((result) => !result.ok)).toEqual([
        { ok: false, error: "rate_limited" },
      ]);
      const { rows } = await admin.query<{ count: string }>(
        "select count(*) as count from feedback_reports",
      );
      expect(Number(rows[0]?.count)).toBe(FEEDBACK_REPORTS_PER_DAY);
    }
  });
});
