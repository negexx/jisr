import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { type AuthEmailKind, authEmailDays, emailCooldowns } from "@/db/schema";
import { cooldownKey } from "@/lib/auth/normalize-email";
import { AUTH_EMAILS_PER_DAY } from "@/lib/constants";

// One auth email of each kind per mailbox per minute, for both magic links and deletion
// confirmations. Better Auth's own limiter is IP-keyed and we record no IPs, so this and the daily
// ceiling below are the only throttles on mail volume.
export const EMAIL_COOLDOWN_S = 60;

// A single INSERT ... ON CONFLICT statement is the whole check-and-claim, so two concurrent
// requests for one address cannot both win: the loser's DO UPDATE is filtered out by the
// WHERE and no row is returned for it. Without `now` the window runs on the database clock, one
// clock for every serverless instance; tests inject `now` to step through the window. The row is
// keyed by the mailbox (cooldownKey), so +tag and Gmail-dot variants share one slot.
export async function claimEmailSendSlot(
  kind: AuthEmailKind,
  email: string,
  now?: Date,
): Promise<boolean> {
  const claimed = await db
    .insert(emailCooldowns)
    .values({ email: cooldownKey(email), kind, lastSentAt: now ?? sql`now()` })
    .onConflictDoUpdate({
      target: [emailCooldowns.email, emailCooldowns.kind],
      set: { lastSentAt: sql`excluded.last_sent_at` },
      setWhere: sql`${emailCooldowns.lastSentAt} <= excluded.last_sent_at - make_interval(secs => ${EMAIL_COOLDOWN_S})`,
    })
    .returning({ email: emailCooldowns.email });
  return claimed.length > 0;
}

function utcDay(now: Date | undefined) {
  return now ? sql`${now.toISOString().slice(0, 10)}::date` : sql`(now() at time zone 'utc')::date`;
}

// The global ceiling, one counter row per UTC day. Same single-statement shape as the cooldown:
// under concurrency Postgres re-checks the WHERE against the row the winner committed, so the count
// never passes `limit` and exactly `limit` claims of a day succeed.
export async function claimDailyEmailSlot(
  now?: Date,
  limit: number = AUTH_EMAILS_PER_DAY,
): Promise<boolean> {
  if (limit < 1) return false;
  const claimed = await db
    .insert(authEmailDays)
    .values({ day: utcDay(now), sent: 1 })
    .onConflictDoUpdate({
      target: authEmailDays.day,
      set: { sent: sql`${authEmailDays.sent} + 1` },
      setWhere: sql`${authEmailDays.sent} < ${limit}`,
    })
    .returning({ sent: authEmailDays.sent });
  return claimed.length > 0;
}

export type AuthEmailClaimOptions = { now?: Date; dailyLimit?: number };

// The one claim every auth email takes. The mailbox cooldown goes first, so a request it refuses
// never spends the day's budget (a refused flood at one address cannot use up everyone's sends).
// A claim the ceiling then refuses leaves the mailbox slot taken, which only delays a retry that
// the ceiling would refuse anyway.
export async function claimAuthEmailSend(
  kind: AuthEmailKind,
  email: string,
  options: AuthEmailClaimOptions = {},
): Promise<boolean> {
  if (!(await claimEmailSendSlot(kind, email, options.now))) return false;
  return claimDailyEmailSlot(options.now, options.dailyLimit);
}
