import { startTestDatabase, type TestDatabase } from "@scripts/db/harness";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const TIMEOUT_MS = 60_000;
const T0 = new Date("2026-10-14T09:00:00.000Z");
const RULE = { window: 60, max: 3 };

function after(seconds: number): Date {
  return new Date(T0.getTime() + seconds * 1000);
}

type ThrottleModule = typeof import("@/lib/server/request-throttle");

let testDb: TestDatabase;
let pool: Pool;
let consumeThrottle: ThrottleModule["consumeThrottle"];
let purgeExpiredThrottles: ThrottleModule["purgeExpiredThrottles"];
let THROTTLE_RETENTION_S: ThrottleModule["THROTTLE_RETENTION_S"];
let claimAuthEmailSend: typeof import("@/lib/server/email-cooldown").claimAuthEmailSend;
let closeAppPool: () => Promise<void>;

beforeAll(async () => {
  testDb = await startTestDatabase({ port: 0 });
  pool = new Pool({ connectionString: testDb.databaseUrl });
  process.env.DATABASE_URL = testDb.databaseUrl;
  ({ consumeThrottle, purgeExpiredThrottles, THROTTLE_RETENTION_S } = await import(
    "@/lib/server/request-throttle"
  ));
  ({ claimAuthEmailSend } = await import("@/lib/server/email-cooldown"));
  const { db } = await import("@/db");
  closeAppPool = () => db.$client.end();
}, TIMEOUT_MS);

beforeEach(async () => {
  await pool.query("delete from request_throttles");
  await pool.query("delete from email_cooldowns");
  await pool.query("delete from auth_email_days");
});

afterAll(async () => {
  await closeAppPool?.();
  await pool?.end();
  await testDb?.stop();
}, TIMEOUT_MS);

async function counts(): Promise<{ key: string; count: number }[]> {
  const { rows } = await pool.query<{ key: string; count: number }>(
    "select key, count from request_throttles order by key",
  );
  return rows;
}

describe("consumeThrottle", () => {
  it("allows max requests in a window, then refuses with the seconds left", async () => {
    for (let index = 0; index < RULE.max; index += 1) {
      expect(await consumeThrottle("k", RULE, after(index))).toEqual({
        allowed: true,
        retryAfter: null,
      });
    }
    expect(await consumeThrottle("k", RULE, after(10))).toEqual({
      allowed: false,
      retryAfter: 50,
    });
  });

  it("does not count or move the window on a refusal", async () => {
    for (let index = 0; index < RULE.max; index += 1) await consumeThrottle("k", RULE, T0);
    await consumeThrottle("k", RULE, after(30));
    await consumeThrottle("k", RULE, after(31));
    expect(await counts()).toEqual([{ key: "k", count: RULE.max }]);
    expect(await consumeThrottle("k", RULE, after(60))).toMatchObject({ allowed: true });
  });

  it("refuses with a retryAfter of at least one second", async () => {
    for (let index = 0; index < RULE.max; index += 1) await consumeThrottle("k", RULE, T0);
    expect(await consumeThrottle("k", RULE, new Date(T0.getTime() + 59_500))).toEqual({
      allowed: false,
      retryAfter: 1,
    });
  });

  it("opens a new window exactly `window` seconds after window_start, with count 1", async () => {
    for (let index = 0; index < RULE.max; index += 1) await consumeThrottle("k", RULE, T0);
    expect(await consumeThrottle("k", RULE, after(59))).toMatchObject({ allowed: false });
    expect(await consumeThrottle("k", RULE, after(60))).toEqual({
      allowed: true,
      retryAfter: null,
    });
    expect(await counts()).toEqual([{ key: "k", count: 1 }]);
    const { rows } = await pool.query<{ window_start: Date }>(
      "select window_start from request_throttles",
    );
    expect(rows[0]?.window_start.toISOString()).toBe(after(60).toISOString());
  });

  it("restarts the count in the new window: max more allowed, then a refusal", async () => {
    for (let index = 0; index < RULE.max; index += 1) await consumeThrottle("k", RULE, T0);
    for (let index = 0; index < RULE.max; index += 1) {
      expect(await consumeThrottle("k", RULE, after(60 + index))).toMatchObject({ allowed: true });
    }
    expect(await consumeThrottle("k", RULE, after(63))).toMatchObject({ allowed: false });
  });

  it("keeps keys independent and applies each call's own rule", async () => {
    for (let index = 0; index < RULE.max; index += 1) await consumeThrottle("a", RULE, T0);
    expect(await consumeThrottle("a", RULE, after(1))).toMatchObject({ allowed: false });
    expect(await consumeThrottle("b", RULE, after(1))).toMatchObject({ allowed: true });
    expect(await consumeThrottle("a", { window: 60, max: 4 }, after(2))).toMatchObject({
      allowed: true,
    });
  });

  it("uses the database clock when no time is injected", async () => {
    expect(await consumeThrottle("clock", { window: 3600, max: 1 })).toMatchObject({
      allowed: true,
    });
    const refused = await consumeThrottle("clock", { window: 3600, max: 1 });
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfter).toBeGreaterThan(3590);
    expect(refused.retryAfter).toBeLessThanOrEqual(3600);
    const { rows } = await pool.query<{ near: boolean }>(
      "select abs(extract(epoch from (now() - window_start))) < 30 as near from request_throttles",
    );
    expect(rows).toEqual([{ near: true }]);
  });

  it("grants exactly max of several simultaneous requests", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => consumeThrottle("race", RULE, T0)),
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(RULE.max);
  });
});

describe("purgeExpiredThrottles", () => {
  it("keeps rows for 24 hours", () => {
    expect(THROTTLE_RETENTION_S).toBe(24 * 60 * 60);
  });

  it("deletes rows whose window started more than 24 hours ago and keeps the rest", async () => {
    await consumeThrottle("old", RULE, T0);
    await consumeThrottle("recent", RULE, after(3600));
    await purgeExpiredThrottles(after(THROTTLE_RETENTION_S + 1));
    expect((await counts()).map((row) => row.key)).toEqual(["recent"]);
  });

  it("is run by a granted auth email send", async () => {
    await consumeThrottle("old", RULE, after(-(THROTTLE_RETENTION_S + 1)));
    await consumeThrottle("recent", RULE, after(-3600));
    expect(await claimAuthEmailSend("magic-link", "ana@example.com", { now: T0 })).toBe(true);
    expect((await counts()).map((row) => row.key)).toEqual(["recent"]);
  });
});
