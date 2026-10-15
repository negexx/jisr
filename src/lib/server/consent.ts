"use server";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/schema";
import { accountsEnabled } from "@/lib/auth/accounts-enabled";
import { CURRENT_CONSENT_VERSION } from "@/lib/auth/consent";

import { guarded } from "./account-guard";
import { readSessionUser } from "./session";

export type AcceptConsentResult =
  | { ok: true }
  | { ok: false; error: "accounts_disabled" | "unauthenticated" };

// consentVersion and consentedAt are `input: false` fields, which Better Auth's updateUser refuses
// to set (parseInputData throws FIELD_NOT_ALLOWED for them), so the stamp is a direct update of the
// session's own user row. The version is the constant, verbatim; the time is this server's clock.
// Both queries run inside guarded(): the session lookup's error would carry the token.
export async function acceptCurrentConsent(): Promise<AcceptConsentResult> {
  if (!accountsEnabled()) return { ok: false, error: "accounts_disabled" };
  return guarded("acceptCurrentConsent", async () => {
    const sessionUser = await readSessionUser();
    if (sessionUser === null) return { ok: false, error: "unauthenticated" };
    await db
      .update(user)
      .set({ consentVersion: CURRENT_CONSENT_VERSION, consentedAt: new Date() })
      .where(eq(user.id, sessionUser.id));
    return { ok: true };
  });
}
