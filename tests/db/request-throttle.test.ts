import { startTestDatabase, type TestDatabase } from "@scripts/db/harness";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
let authLimiterStorage: ThrottleModule["authLimiterStorage"];
let throttleKey: ThrottleModule["throttleKey"];
let requestThrottlesTable: typeof import("@/db/schema")["requestThrottles"];
let appDb: typeof import("@/db")["db"];
let closeAppPool: () => Promise<void>;

beforeAll(async () => {
  testDb = await startTestDatabase({ port: 0 });
  pool = new Pool({ connectionString: testDb.databaseUrl });
  process.env.DATABASE_URL = testDb.databaseUrl;
  process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-0123";
  ({
    consumeThrottle,
    purgeExpiredThrottles,
    THROTTLE_RETENTION_S,
    authLimiterStorage,
    throttleKey,
  } = await import("@/lib/server/request-throttle"));
  ({ claimAuthEmailSend } = await import("@/lib/server/email-cooldown"));
  ({ requestThrottles: requestThrottlesTable } = await import("@/db/schema"));
  const { db } = await import("@/db");
  appDb = db;
  closeAppPool = () => db.$client.end();
}, TIMEOUT_MS);

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it("refuses a rule that allows nothing, without touching the database", async () => {
    const insert = vi.spyOn(appDb, "insert");
    for (const max of [0, -1]) {
      expect(await consumeThrottle("k", { window: 60, max }, T0)).toEqual({
        allowed: false,
        retryAfter: 60,
      });
    }
    expect(insert).not.toHaveBeenCalled();
    expect(await counts()).toEqual([]);
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

describe("authLimiterStorage", () => {
  const ADDRESS = "203.0.113.7";
  const SOCIAL = `${ADDRESS}|/sign-in/social`;
  const SOCIAL_RULE = { window: 60, max: 5 };
  const FALLBACK = { window: 60, max: 100 };
  const PURGE_EVERY_MS = 10 * 60 * 1000;

  function storage(clock?: () => number) {
    return authLimiterStorage({
      ruledPaths: ["/sign-in/social", "/delete-user"],
      fallbackRule: FALLBACK,
      ...(clock ? { clock } : {}),
    });
  }

  async function keys(): Promise<string[]> {
    return (await counts()).map((row) => row.key);
  }

  it("keeps unruled paths of one address in a single row and a ruled path in its own", async () => {
    const limiter = storage();
    for (const path of ["/nope-1", "/nope-2", "/nope-3"]) {
      expect(await limiter.consume(`${ADDRESS}|${path}`, FALLBACK)).toMatchObject({
        allowed: true,
      });
    }
    expect(await counts()).toEqual([{ key: throttleKey("better-auth", `${ADDRESS}|*`), count: 3 }]);

    await limiter.consume(SOCIAL, SOCIAL_RULE);
    expect(await keys()).toHaveLength(2);
    expect(await keys()).toContain(throttleKey("better-auth", SOCIAL));
  });

  it("counts a path that contains the separator with the other unruled paths", async () => {
    const limiter = storage();
    await limiter.consume(`${ADDRESS}|/x|y`, FALLBACK);
    await limiter.consume(`${ADDRESS}|/x|z|w`, FALLBACK);
    expect(await counts()).toEqual([{ key: throttleKey("better-auth", `${ADDRESS}|*`), count: 2 }]);
  });

  it("keeps another address apart", async () => {
    const limiter = storage();
    await limiter.consume("203.0.113.7|/nope", FALLBACK);
    await limiter.consume("203.0.113.8|/nope", FALLBACK);
    expect(await keys()).toHaveLength(2);
  });

  it("applies the fallback rule to an unruled path, whatever rule the caller passes", async () => {
    const limiter = storage();
    for (let index = 0; index < 4; index += 1) {
      expect(await limiter.consume(`${ADDRESS}|/sign-in/email`, { window: 10, max: 3 })).toEqual({
        allowed: true,
        retryAfter: null,
      });
    }
  });

  it("applies the caller's rule to a ruled path", async () => {
    const limiter = storage();
    for (let index = 0; index < SOCIAL_RULE.max; index += 1) {
      await limiter.consume(SOCIAL, SOCIAL_RULE);
    }
    expect(await limiter.consume(SOCIAL, SOCIAL_RULE)).toMatchObject({ allowed: false });
  });

  it("stores no part of the address", async () => {
    await storage().consume(SOCIAL, SOCIAL_RULE);
    for (const key of await keys()) expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  describe("retention", () => {
    async function seedStale(): Promise<void> {
      await pool.query(
        "insert into request_throttles (key, window_start, count) values ('stale', now() - interval '2 days', 1)",
      );
    }

    function failPurgeWith(error: Error): void {
      const realDelete = appDb.delete.bind(appDb);
      vi.spyOn(appDb, "delete").mockImplementation(((table: Parameters<typeof realDelete>[0]) => {
        if (table === requestThrottlesTable) throw error;
        return realDelete(table);
      }) as typeof appDb.delete);
    }

    it("purges expired rows after a granted request, at most once per ten minutes", async () => {
      let now = 1_000_000;
      const limiter = storage(() => now);
      await seedStale();
      await limiter.consume(SOCIAL, SOCIAL_RULE);
      expect(await keys()).not.toContain("stale");

      await seedStale();
      now += PURGE_EVERY_MS - 1;
      await limiter.consume(SOCIAL, SOCIAL_RULE);
      expect(await keys()).toContain("stale");

      now += 1;
      await limiter.consume(SOCIAL, SOCIAL_RULE);
      expect(await keys()).not.toContain("stale");
    });

    it("does not purge on a refused request", async () => {
      let now = 1_000_000;
      const limiter = storage(() => now);
      const oneOnly = { window: 3600, max: 1 };
      await limiter.consume(SOCIAL, oneOnly);
      await seedStale();
      now += PURGE_EVERY_MS * 2;
      expect(await limiter.consume(SOCIAL, oneOnly)).toMatchObject({ allowed: false });
      expect(await keys()).toContain("stale");
    });

    it("lets a request through when the purge fails, logging only the SQLSTATE", async () => {
      failPurgeWith(
        Object.assign(new Error("Failed query: delete ... params: 203.0.113.7"), {
          cause: { code: "08006" },
        }),
      );
      const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

      expect(await storage().consume(SOCIAL, SOCIAL_RULE)).toEqual({
        allowed: true,
        retryAfter: null,
      });
      expect(JSON.stringify(logged.mock.calls)).not.toContain(ADDRESS);
      expect(logged).toHaveBeenCalledWith("[auth] purge of expired request throttles failed", {
        sqlState: "08006",
      });
    });

    it("still lets a granted auth email send return true when the throttle purge fails", async () => {
      failPurgeWith(new Error("boom"));
      vi.spyOn(console, "error").mockImplementation(() => undefined);

      expect(await claimAuthEmailSend("magic-link", "ana@example.com", { now: T0 })).toBe(true);
    });
  });
});
