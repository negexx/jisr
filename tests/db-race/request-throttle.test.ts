import { afterAll, beforeAll, expect, it } from "vitest";

import { createRaceDatabase, describeRace, type RaceDatabase } from "./pg";

const T0 = new Date("2026-10-14T09:00:00.000Z");
const RULE = { window: 60, max: 3 };

function after(seconds: number): Date {
  return new Date(T0.getTime() + seconds * 1000);
}

describeRace("consumeThrottle under real concurrency", () => {
  let race: RaceDatabase;
  let consumeThrottle: typeof import("@/lib/server/request-throttle").consumeThrottle;
  let purgeExpiredThrottles: typeof import("@/lib/server/request-throttle").purgeExpiredThrottles;

  beforeAll(async () => {
    race = await createRaceDatabase();
    process.env.DATABASE_URL = race.url;
    ({ consumeThrottle, purgeExpiredThrottles } = await import("@/lib/server/request-throttle"));
    const { db } = await import("@/db");
    // Same as email-cooldown.test.ts: the harness ends the app pool before the forced drop.
    race.adoptPool(db.$client);
  });

  afterAll(async () => {
    await race?.drop();
  });

  it("allows exactly max of many simultaneous requests in one window", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => consumeThrottle("race-key", RULE, T0)),
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(RULE.max);
    for (const result of results.filter((entry) => !entry.allowed)) {
      expect(result.retryAfter).toBe(60);
    }
  });

  it("refuses with the seconds left, then opens a new window exactly `window` seconds on", async () => {
    expect(await consumeThrottle("race-key", RULE, after(59))).toEqual({
      allowed: false,
      retryAfter: 1,
    });

    const reopened = await Promise.all(
      Array.from({ length: 20 }, () => consumeThrottle("race-key", RULE, after(60))),
    );
    expect(reopened.filter((result) => result.allowed)).toHaveLength(RULE.max);
    expect(await consumeThrottle("race-key", RULE, after(61))).toMatchObject({ allowed: false });
  });

  it("removes a row older than 24 hours and keeps a newer one", async () => {
    const pool = race.createPool(1);
    await pool.query("delete from request_throttles");
    await consumeThrottle("old-key", RULE, T0);
    await consumeThrottle("new-key", RULE, after(3600));
    await purgeExpiredThrottles(after(24 * 3600 + 1));

    const { rows } = await pool.query<{ window_start: Date }>(
      "select window_start from request_throttles order by window_start",
    );
    expect(rows.map((row) => row.window_start.toISOString())).toEqual([after(3600).toISOString()]);
  });
});
