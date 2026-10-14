import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { type AuthEmailKind, emailCooldowns } from "@/db/schema";
import { normalizeEmail } from "@/lib/auth/normalize-email";

// One auth email of each kind per address per minute, for both magic links and deletion
// confirmations. Better Auth's own limiter is IP-keyed and we record no IPs, so this is the
// only throttle on mail volume.
export const EMAIL_COOLDOWN_S = 60;

// A single INSERT ... ON CONFLICT statement is the whole check-and-claim, so two concurrent
// requests for one address cannot both win: the loser's DO UPDATE is filtered out by the
// WHERE and no row is returned for it. Without `now` the window runs on the database clock, one
// clock for every serverless instance; tests inject `now` to step through the window.
export async function claimEmailSendSlot(
  kind: AuthEmailKind,
  email: string,
  now?: Date,
): Promise<boolean> {
  const claimed = await db
    .insert(emailCooldowns)
    .values({ email: normalizeEmail(email), kind, lastSentAt: now ?? sql`now()` })
    .onConflictDoUpdate({
      target: [emailCooldowns.email, emailCooldowns.kind],
      set: { lastSentAt: sql`excluded.last_sent_at` },
      setWhere: sql`${emailCooldowns.lastSentAt} <= excluded.last_sent_at - make_interval(secs => ${EMAIL_COOLDOWN_S})`,
    })
    .returning({ email: emailCooldowns.email });
  return claimed.length > 0;
}
