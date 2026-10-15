// Admission gate. Pure, framework-free and clock-injected so the outcome logic is unit
// testable without a database, an auth object or a request. The wiring lives in
// src/lib/auth/server.ts (`databaseHooks.user.create.before`), which resolves the evidence
// and defers every decision to `evaluateAdmission`.
//
// Evidence is scoped to the sign-in path, one source each, never combined:
//   /callback/:id        (Google redirect) -> the OAuth state only
//   /magic-link/confirm  (magic link)      -> the pending-signup row only (the GET verify is closed)
//   anything else, or no request context  -> no evidence, so the create is rejected
// A pending row is typed by whoever submitted the signup form, so it must never vouch for an
// account created through another path.
//
// Fixed outcomes (plan B1/B2):
//   age >= 16 confirmation missing  -> reject (throw; no user row)
//   age confirmed, consent missing  -> allow, consent fields NULL (features stay gated
//                                      by the first-login "finish signup" gate until the
//                                      student consents)
//   age confirmed, consent present  -> allow, stamp consent_version + consented_at now
//   consent not exactly the current -> treated as missing (allow, NULL), never stamped
//   version (padding included)
//
// `validateUserInfo` runs BEFORE `databaseHooks.user.create.before` and `input: false`
// keeps consent fields out of user input, so this gate only ever sees server-resolved
// evidence and stamps server-owned values.

/** The consent + age confirmation a sign-up path can prove; consent is null when absent. */
export type AdmissionConfirmation = {
  ageConfirmed: boolean;
  consentVersion: string | null;
};

/** A pending-signup row: the magic-link evidence, keyed by email. */
export type PendingSignup = {
  email: string;
  ageConfirmed: boolean;
  consentVersion: string | null;
};

export type AdmissionDecision =
  | { kind: "reject"; code: "age_not_confirmed" }
  | { kind: "allow"; consentVersion: string | null; consentedAt: Date | null };

export function evaluateAdmission(
  evidence: AdmissionConfirmation | null,
  now: Date,
  currentVersion: string,
): AdmissionDecision {
  if (evidence?.ageConfirmed !== true) return { kind: "reject", code: "age_not_confirmed" };
  if (evidence.consentVersion !== currentVersion) {
    return { kind: "allow", consentVersion: null, consentedAt: null };
  }
  return { kind: "allow", consentVersion: currentVersion, consentedAt: now };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads the Google sign-up confirmation out of the OAuth state. Its top-level keys come from
 * the client's `additionalData`, so they are self-declared: only a literal boolean `true`
 * confirms age, only a string can name a version, and nothing else (timestamps included) is read.
 */
export function confirmationFromOAuthState(state: unknown): AdmissionConfirmation {
  if (!isRecord(state)) return { ageConfirmed: false, consentVersion: null };
  return {
    ageConfirmed: state.ageConfirmed === true,
    consentVersion: typeof state.consentVersion === "string" ? state.consentVersion : null,
  };
}
