import "server-only";

import { and, eq, gt } from "drizzle-orm";

import { db } from "@/db";
import { pendingSignups } from "@/db/schema";

import type { PendingSignup } from "./admission";
import { CURRENT_CONSENT_VERSION } from "./consent";
import { normalizeEmail } from "./normalize-email";

// The magic link and the pending row it relies on expire together, so the row is never kept
// longer than the link that can use it (MAGIC_LINK_EXPIRY_S in server.ts).
export const PENDING_SIGNUP_TTL_S = 15 * 60;

// Written by the auth instance's before hook, after the send slot is claimed and before the
// verification row and the email: a refused request writes or refreshes nothing, and the evidence
// is in the database when the link is opened, on whichever device. The consent time is this
// server's clock, never the browser's.
export async function recordPendingSignup(email: string, now: Date = new Date()): Promise<void> {
  const fields = {
    consentVersion: CURRENT_CONSENT_VERSION,
    consentedAt: now,
    ageConfirmed: true,
    expiresAt: new Date(now.getTime() + PENDING_SIGNUP_TTL_S * 1000),
  };
  await db
    .insert(pendingSignups)
    .values({ email: normalizeEmail(email), ...fields })
    .onConflictDoUpdate({ target: pendingSignups.email, set: fields });
}

// An expired row is ignored here rather than swept (no worker, ADR 0003): lazy expiry.
// A missing row makes the admission gate fail closed (age unconfirmed -> reject).
export async function readPendingSignup(
  email: string,
  now: Date = new Date(),
): Promise<PendingSignup | null> {
  const [row] = await db
    .select({
      email: pendingSignups.email,
      ageConfirmed: pendingSignups.ageConfirmed,
      consentVersion: pendingSignups.consentVersion,
    })
    .from(pendingSignups)
    .where(and(eq(pendingSignups.email, normalizeEmail(email)), gt(pendingSignups.expiresAt, now)))
    .limit(1);
  return row ?? null;
}
