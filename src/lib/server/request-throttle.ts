import "server-only";

import { createHmac } from "node:crypto";

import { lt, sql } from "drizzle-orm";

import { db } from "@/db";
import { requestThrottles } from "@/db/schema";

import { sqlState } from "./account-store";

export class ThrottleMisconfiguredError extends Error {
  constructor() {
    super("Request throttling needs BETTER_AUTH_SECRET, which is missing");
    this.name = "ThrottleMisconfiguredError";
  }
}

const KEY_DOMAIN = "jisr:request-throttle:v1";

// Throttle rows are keyed by an HMAC, never by the address: the secret keeps the key from being
// guessed for a known address, and the UTC day in the message makes the same address a different
// key tomorrow, so rows cannot be linked across days. The raw key stays in process memory. The
// HMAC key is a subkey derived from the auth secret for this purpose alone, so the secret itself
// never keys anything else we compute with it.
//
// Accepted consequence of the day rotation: every window resets at 00:00 UTC, so a one-day rule
// is per calendar day, not a rolling 24 hours. The alternative is a key that can be followed from
// one day to the next.
export function throttleKey(bucket: string, rawKey: string, now: Date = new Date()): string {
  if (bucket.includes("|")) throw new Error("A throttle bucket name cannot contain '|'");
  const secret = process.env.BETTER_AUTH_SECRET;
  if (secret === undefined || secret.trim() === "") throw new ThrottleMisconfiguredError();
  const subkey = createHmac("sha256", secret).update(KEY_DOMAIN).digest();
  const utcDay = now.toISOString().slice(0, 10);
  return createHmac("sha256", subkey).update(`${utcDay}|${bucket}|${rawKey}`).digest("base64url");
}

export type ThrottleRule = {
  // Seconds.
  window: number;
  max: number;
};

export type ThrottleResult = { allowed: boolean; retryAfter: number | null };

// Fixed window, one INSERT ... ON CONFLICT statement as the whole check-and-increment (same shape as
// claimEmailSendSlot): the first request of a window creates the row, a later one increments it
// while it is below `max`, and one at or after window_start + window restarts the count at 1. A
// request the WHERE refuses returns no row and changes nothing, so a refused flood neither extends
// the window nor counts. Without `now` the window runs on the database clock; tests inject it.
export async function consumeThrottle(
  key: string,
  rule: ThrottleRule,
  now?: Date,
): Promise<ThrottleResult> {
  // A rule that allows nothing needs no row, and the statement below would grant its first request.
  if (rule.max < 1) return { allowed: false, retryAfter: rule.window };
  // Cast: a bare parameter beside an interval would be inferred as an interval, not a time.
  const at = now ? sql`${now.toISOString()}::timestamptz` : sql`now()`;
  const expired = sql`${requestThrottles.windowStart} <= excluded.window_start - make_interval(secs => ${rule.window})`;
  const granted = await db
    .insert(requestThrottles)
    .values({ key, windowStart: at, count: 1 })
    .onConflictDoUpdate({
      target: requestThrottles.key,
      set: {
        count: sql`case when ${expired} then 1 else ${requestThrottles.count} + 1 end`,
        windowStart: sql`case when ${expired} then excluded.window_start else ${requestThrottles.windowStart} end`,
      },
      setWhere: sql`${expired} or ${requestThrottles.count} < ${rule.max}`,
    })
    .returning({ key: requestThrottles.key });
  if (granted.length > 0) return { allowed: true, retryAfter: null };

  // The row can only be missing if the purge removed it between the two statements; a retry then
  // succeeds, so one second is the honest answer. A concurrent window reset between the two
  // statements can make the figure overstate the wait; that is harmless.
  const left = await db
    .select({
      seconds: sql<number>`greatest(1, ceil(extract(epoch from ${requestThrottles.windowStart} + make_interval(secs => ${rule.window}) - ${at})))::int`,
    })
    .from(requestThrottles)
    .where(sql`${requestThrottles.key} = ${key}`);
  return { allowed: false, retryAfter: left[0]?.seconds ?? 1 };
}

// The longest window is one day, so a row older than that no longer limits anything.
export const THROTTLE_RETENTION_S = 24 * 60 * 60;

// Retention without a worker (ADR 0003): called from the auth email purge. Best effort and logged
// by SQLSTATE only (Drizzle's message carries the statement's parameters, which include the key).
export async function purgeExpiredThrottles(now?: Date): Promise<void> {
  const at = now ? sql`${now.toISOString()}::timestamptz` : sql`now()`;
  try {
    await db
      .delete(requestThrottles)
      .where(
        lt(
          requestThrottles.windowStart,
          sql`${at} - make_interval(secs => ${THROTTLE_RETENTION_S})`,
        ),
      );
  } catch (error) {
    console.error("[auth] purge of expired request throttles failed", {
      sqlState: sqlState(error),
    });
  }
}

export const THROTTLE_PURGE_INTERVAL_MS = 10 * 60 * 1000;

const ANY_OTHER_PATH = "*";
const LIMITER_BUCKET = "better-auth";

export type AuthLimiterStorageOptions = {
  // Paths that have their own rule (AUTH_RATE_LIMIT_RULES), matched by equality; every other path
  // shares one counter per resolved rule.
  ruledPaths: readonly string[];
  // Milliseconds; injectable for the purge cadence test.
  clock?: () => number;
};

// Better Auth's `customStorage` for its request limiter. Its key is `<address>|<path>` and the
// path is whatever the caller sent, so keying rows by the path would let one address create a row
// per made-up path. A request for a path without a rule of ours is therefore counted per address
// and per resolved rule (`<address>|*<window>/<max>`): the rule is Better Auth's own for the path
// (its stricter built-in ones for /sign-in/*, /change-password and so on, or our default), and the
// set of rules is finite, so rows per address stay bounded. The address is split at the FIRST
// separator: it never contains one (an IP or `no-trusted-ip`), while a path may.
//
// Better Auth runs the limiter outside its error handling, so a failing store would reach Next with
// the driver's message, which carries the statement and its parameters (the key). It is therefore
// caught here, logged as the bucket and SQLSTATE only, and replaced by a fresh error with a fixed
// message and no cause.
//
// Retention without a worker (ADR 0003): after a granted request, expired rows are purged at most
// once per interval and per instance, so rows are bounded even when no auth email is ever sent.
export function authLimiterStorage(options: AuthLimiterStorageOptions) {
  const ruled = new Set(options.ruledPaths);
  const clock = options.clock ?? Date.now;
  let lastPurgeAt = Number.NEGATIVE_INFINITY;

  async function purgeWhenDue(): Promise<void> {
    const at = clock();
    if (at - lastPurgeAt < THROTTLE_PURGE_INTERVAL_MS) return;
    lastPurgeAt = at;
    await purgeExpiredThrottles();
  }

  return {
    async consume(key: string, rule: ThrottleRule): Promise<ThrottleResult> {
      const separator = key.indexOf("|");
      const address = separator === -1 ? key : key.slice(0, separator);
      const path = separator === -1 ? "" : key.slice(separator + 1);
      const rawKey = ruled.has(path)
        ? key
        : `${address}|${ANY_OTHER_PATH}${rule.window}/${rule.max}`;
      let result: ThrottleResult;
      try {
        result = await consumeThrottle(throttleKey(LIMITER_BUCKET, rawKey), rule);
      } catch (error) {
        console.error("[auth] request throttle failed", {
          bucket: LIMITER_BUCKET,
          sqlState: sqlState(error),
        });
        throw new Error("The request throttle is unavailable");
      }
      if (result.allowed) await purgeWhenDue();
      return result;
    },
  };
}
