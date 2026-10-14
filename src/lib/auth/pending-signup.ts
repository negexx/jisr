import "server-only";

import { and, eq, gt } from "drizzle-orm";

import { db } from "@/db";
import { pendingSignups } from "@/db/schema";

import type { PendingSignup } from "./admission";
import { normalizeEmail } from "./normalize-email";

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
