import { describe, expect, it } from "vitest";

import {
  type AdmissionConfirmation,
  confirmationFromOAuthState,
  evaluateAdmission,
  normalizeConsentVersion,
  type PendingSignup,
} from "@/lib/auth/admission";

// Fixed outcomes (plan B1/B2): age missing -> reject; consent missing -> created (allowed)
// so the first-login "finish signup" gate blocks features until consent is captured.
// Consent naming any version but the current one counts as missing: it is never stamped.
const NOW = new Date("2026-10-14T10:00:00.000Z");
const CURRENT = "2026-10-14";
const STALE = "2026-10-05";

const NO_CONFIRMATION: AdmissionConfirmation = { ageConfirmed: false, consentVersion: null };
const AGE_ONLY: AdmissionConfirmation = { ageConfirmed: true, consentVersion: null };
const AGE_AND_CONSENT: AdmissionConfirmation = { ageConfirmed: true, consentVersion: CURRENT };

const NULL_CONSENT = { kind: "allow", consentVersion: null, consentedAt: null } as const;
const STAMPED = { kind: "allow", consentVersion: CURRENT, consentedAt: NOW } as const;

function pendingSignup(overrides: Partial<PendingSignup> = {}): PendingSignup {
  return {
    email: "student@example.com",
    ageConfirmed: true,
    consentVersion: CURRENT,
    ...overrides,
  };
}

describe("evaluateAdmission", () => {
  it.each([
    ["no confirmation at all", NO_CONFIRMATION, null],
    [
      "a pending row exists but does not confirm age",
      NO_CONFIRMATION,
      pendingSignup({ ageConfirmed: false }),
    ],
    [
      "neither source confirms age, even with current consent",
      { ageConfirmed: false, consentVersion: CURRENT },
      pendingSignup({ ageConfirmed: false }),
    ],
  ])("rejects when %s", (_label, confirmation, pending) => {
    expect(evaluateAdmission(confirmation, pending, NOW, CURRENT)).toEqual({
      kind: "reject",
      code: "age_not_confirmed",
    });
  });

  it("allows when the pending row confirms age even though the confirmation carries none", () => {
    // The magic-link verify request never carries the age confirmation: the pending-signup
    // row written at the signup action is the server-validated evidence the gate reads.
    expect(evaluateAdmission(NO_CONFIRMATION, pendingSignup(), NOW, CURRENT)).toEqual(STAMPED);
  });

  it("stamps the current version from the confirmation, with the clock it is given", () => {
    expect(evaluateAdmission(AGE_AND_CONSENT, null, NOW, CURRENT)).toEqual(STAMPED);
  });

  it("stamps the current version read from the pending-signup row", () => {
    expect(evaluateAdmission(AGE_ONLY, pendingSignup(), NOW, CURRENT)).toEqual(STAMPED);
  });

  it("stamps the current version when only the pending row names it", () => {
    const decision = evaluateAdmission(
      { ageConfirmed: true, consentVersion: STALE },
      pendingSignup({ consentVersion: CURRENT }),
      NOW,
      CURRENT,
    );
    expect(decision).toEqual(STAMPED);
  });

  it.each<[string, AdmissionConfirmation, PendingSignup | null]>([
    ["a stale version in the confirmation", { ageConfirmed: true, consentVersion: STALE }, null],
    ["a stale version in the pending row", AGE_ONLY, pendingSignup({ consentVersion: STALE })],
    [
      "stale versions in both sources",
      { ageConfirmed: true, consentVersion: STALE },
      pendingSignup({ consentVersion: STALE }),
    ],
    ["an unknown future version", { ageConfirmed: true, consentVersion: "2099-01-01" }, null],
    [
      "a version that only resembles the current one",
      AGE_ONLY,
      pendingSignup({ consentVersion: `${CURRENT}x` }),
    ],
  ])("allows with NULL consent fields (never stamped) for %s", (_label, confirmation, pending) => {
    expect(evaluateAdmission(confirmation, pending, NOW, CURRENT)).toEqual(NULL_CONSENT);
  });

  it("allows with NULL consent fields when age is confirmed but consent is absent", () => {
    expect(evaluateAdmission(AGE_ONLY, null, NOW, CURRENT)).toEqual(NULL_CONSENT);
  });

  it("allows with NULL consent fields when the only pending row carries no consent", () => {
    expect(
      evaluateAdmission(AGE_ONLY, pendingSignup({ consentVersion: null }), NOW, CURRENT),
    ).toEqual(NULL_CONSENT);
  });
});

describe("confirmationFromOAuthState", () => {
  it("reads a well-formed age confirmation and consent version", () => {
    expect(confirmationFromOAuthState({ ageConfirmed: true, consentVersion: CURRENT })).toEqual({
      ageConfirmed: true,
      consentVersion: CURRENT,
    });
  });

  it.each<[string, unknown]>([
    ["no state", null],
    ["undefined state", undefined],
    ["a string state", "ageConfirmed"],
    ["an array state", [true]],
    ["a missing ageConfirmed", { consentVersion: CURRENT }],
    ["ageConfirmed false", { ageConfirmed: false, consentVersion: CURRENT }],
    ['ageConfirmed as the string "true"', { ageConfirmed: "true", consentVersion: CURRENT }],
    ["ageConfirmed as 1", { ageConfirmed: 1, consentVersion: CURRENT }],
  ])("does not confirm age for %s", (_label, state) => {
    expect(confirmationFromOAuthState(state).ageConfirmed).toBe(false);
  });

  it.each<[string, unknown]>([
    ["a missing consentVersion", { ageConfirmed: true }],
    ["a numeric consentVersion", { ageConfirmed: true, consentVersion: 20261014 }],
    ["an object consentVersion", { ageConfirmed: true, consentVersion: { v: CURRENT } }],
  ])("carries no consent for %s", (_label, state) => {
    expect(confirmationFromOAuthState(state).consentVersion).toBeNull();
  });

  it("ignores any client-supplied timestamp", () => {
    const confirmation = confirmationFromOAuthState({
      ageConfirmed: true,
      consentVersion: CURRENT,
      consentedAt: "2020-01-01T00:00:00.000Z",
    });
    expect(confirmation).toEqual({ ageConfirmed: true, consentVersion: CURRENT });
  });
});

describe("normalizeConsentVersion", () => {
  it.each<[string, unknown, string | null]>([
    ["a plain version", "2026-10-05", "2026-10-05"],
    ["a padded version", "  2026-10-05  ", "2026-10-05"],
    ["a blank string", "   ", null],
    ["an empty string", "", null],
    ["null", null, null],
    ["undefined", undefined, null],
    ["a number", 42, null],
    ["an object", { version: CURRENT }, null],
  ])("normalizes %s", (_label, input, expected) => {
    expect(normalizeConsentVersion(input)).toBe(expected);
  });
});
