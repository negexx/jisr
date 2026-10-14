import "server-only";

import { headers } from "next/headers";

import { accountsEnabled } from "@/lib/auth/accounts-enabled";
import { hasCurrentConsent } from "@/lib/auth/consent";
import { getAuth } from "@/lib/auth/server";

export type AccountReadiness =
  | { ok: false; error: "unauthenticated" | "consent_required" }
  | { ok: true; userId: string };

export type SessionUser = { id: string; consentVersion: string | null | undefined };

// The session is read from the database on every call (no cookie cache is configured), so a
// consent stamped a moment ago is seen at once. While accounts are off there is no session.
export async function readSessionUser(): Promise<SessionUser | null> {
  if (!accountsEnabled()) return null;
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (session === null) return null;
  return { id: session.user.id, consentVersion: session.user.consentVersion };
}

// The first call of every account action (todo 13 onwards): a signed-in user whose consent is not
// the current privacy-notice version is held at the finish-signup gate.
export async function requireAccountReady(): Promise<AccountReadiness> {
  const user = await readSessionUser();
  if (user === null) return { ok: false, error: "unauthenticated" };
  if (!hasCurrentConsent(user)) return { ok: false, error: "consent_required" };
  return { ok: true, userId: user.id };
}
