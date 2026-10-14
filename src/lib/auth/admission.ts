// Admission gate. Pure, framework-free and clock-injected so the outcome logic is unit
// testable without a database, an auth object or a request. The wiring lives in
// src/lib/auth/server.ts (`databaseHooks.user.create.before`), which resolves the evidence
// and defers every decision to `evaluateAdmission`.
//
// Fixed outcomes (plan B1/B2):
//   age >= 16 confirmation missing  -> reject (throw; no user row)
//   age confirmed, consent missing  -> allow, consent fields NULL (features stay gated
//                                      by the first-login "finish signup" gate until the
//                                      student consents)
//   age confirmed, consent present  -> allow, stamp consent_version + consented_at now
//
// `validateUserInfo` runs BEFORE `databaseHooks.user.create.before` and `input: false`
// keeps consent fields out of user input, so this gate only ever sees server-resolved
// evidence and stamps server-owned values.

/** The consent + age confirmation a sign-up path can prove; consent is null when absent. */
export type AdmissionConfirmation = {
  ageConfirmed: boolean;
  consentVersion: string | null;
};

/** A pending-signup row (magic link, keyed by email) or validated OAuth state (Google). */
export type PendingSignup = {
  email: string;
  ageConfirmed: boolean;
  consentVersion: string | null;
};

export type AdmissionDecision =
  | { kind: "reject"; code: "age_not_confirmed" }
  | { kind: "allow"; consentVersion: string | null; consentedAt: Date | null };

/** A consent version is present only as a non-empty, trimmed string; anything else is absent. */
export function normalizeConsentVersion(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function evaluateAdmission(
  confirmation: AdmissionConfirmation,
  pendingSignup: PendingSignup | null,
  now: Date,
): AdmissionDecision {
  const ageConfirmed = confirmation.ageConfirmed || pendingSignup?.ageConfirmed === true;
  if (!ageConfirmed) return { kind: "reject", code: "age_not_confirmed" };

  const consentVersion =
    normalizeConsentVersion(confirmation.consentVersion) ??
    normalizeConsentVersion(pendingSignup?.consentVersion ?? null);
  if (consentVersion === null) return { kind: "allow", consentVersion: null, consentedAt: null };

  return { kind: "allow", consentVersion, consentedAt: now };
}
