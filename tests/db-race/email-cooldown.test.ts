import { afterAll, beforeAll, expect, it } from "vitest";

import { createRaceDatabase, describeRace, type RaceDatabase } from "./pg";

const T0 = new Date("2026-10-14T09:00:00.000Z");

describeRace("claimEmailSendSlot under real concurrency", () => {
  let race: RaceDatabase;
  let claimEmailSendSlot: typeof import("@/lib/server/email-cooldown").claimEmailSendSlot;

  beforeAll(async () => {
    race = await createRaceDatabase();
    process.env.DATABASE_URL = race.url;
    ({ claimEmailSendSlot } = await import("@/lib/server/email-cooldown"));
    const { db } = await import("@/db");
    // The app pool has no 'error' listener of its own; the harness ends it before the forced drop and
    // absorbs the admin_shutdown a still-closing backend reports (CI saw it as an unhandled error).
    race.adoptPool(db.$client);
  });

  afterAll(async () => {
    await race?.drop();
  });

  it("grants exactly one of many simultaneous claims for one address and kind", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => claimEmailSendSlot("magic-link", "race@example.com", T0)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("grants exactly one of many simultaneous claims once the window has passed", async () => {
    const later = new Date(T0.getTime() + 61_000);
    const results = await Promise.all(
      Array.from({ length: 20 }, () => claimEmailSendSlot("magic-link", "race@example.com", later)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});
