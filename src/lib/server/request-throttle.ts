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

// Throttle rows are keyed by an HMAC, never by the address: the secret keeps the key from being
// guessed for a known address, and the UTC day in the message makes the same address a different
// key tomorrow, so rows cannot be linked across days. The raw key stays in process memory.
export function throttleKey(bucket: string, rawKey: string, now: Date = new Date()): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (secret === undefined || secret.trim() === "") throw new ThrottleMisconfiguredError();
  const utcDay = now.toISOString().slice(0, 10);
  return createHmac("sha256", secret).update(`${utcDay}|${bucket}|${rawKey}`).digest("base64url");
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
  // succeeds, so one second is the honest answer.
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
