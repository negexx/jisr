import { afterAll, beforeAll, expect, it } from "vitest";

import { createRaceDatabase, describeRace, type RaceDatabase } from "./pg";

const T0 = new Date("2026-10-14T09:00:00.000Z");
const LIMIT = 5;

describeRace("claimDailyEmailSlot under real concurrency", () => {
  let race: RaceDatabase;
  let claimDailyEmailSlot: typeof import("@/lib/server/email-cooldown").claimDailyEmailSlot;

  beforeAll(async () => {
    race = await createRaceDatabase();
    process.env.DATABASE_URL = race.url;
    ({ claimDailyEmailSlot } = await import("@/lib/server/email-cooldown"));
    const { db } = await import("@/db");
    // Same as email-cooldown.test.ts: the harness ends the app pool before the forced drop.
    race.adoptPool(db.$client);
  });

  afterAll(async () => {
    await race?.drop();
  });

  it("grants exactly one of two simultaneous claims at one below the ceiling", async () => {
    for (let index = 0; index < LIMIT - 1; index += 1) {
      expect(await claimDailyEmailSlot(T0, LIMIT)).toBe(true);
    }
    const results = await Promise.all([
      claimDailyEmailSlot(T0, LIMIT),
      claimDailyEmailSlot(T0, LIMIT),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("never grants more than the ceiling under many simultaneous claims on a fresh day", async () => {
    const nextDay = new Date(T0.getTime() + 86_400_000);
    const results = await Promise.all(
      Array.from({ length: 20 }, () => claimDailyEmailSlot(nextDay, LIMIT)),
    );
    expect(results.filter(Boolean)).toHaveLength(LIMIT);
  });
});
