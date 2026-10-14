import { describe, expect, it } from "vitest";

import {
  type AdmissionConfirmation,
  evaluateAdmission,
  normalizeConsentVersion,
  type PendingSignup,
} from "@/lib/auth/admission";

// Fixed outcomes (plan B1/B2): age missing -> reject; consent missing -> created (allowed)
// so the first-login "finish signup" gate blocks features until consent is captured.
const NOW = new Date("2026-10-14T10:00:00.000Z");
const CONSENT = "2026-10-05";

const NO_CONFIRMATION: AdmissionConfirmation = { ageConfirmed: false, consentVersion: null };
const AGE_ONLY: AdmissionConfirmation = { ageConfirmed: true, consentVersion: null };
const AGE_AND_CONSENT: AdmissionConfirmation = { ageConfirmed: true, consentVersion: CONSENT };

function pendingSignup(overrides: Partial<PendingSignup> = {}): PendingSignup {
  return {
    email: "student@example.com",
    ageConfirmed: true,
    consentVersion: CONSENT,
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
      "neither source confirms age",
      { ageConfirmed: false, consentVersion: CONSENT },
      pendingSignup({ ageConfirmed: false }),
    ],
  ])("rejects when %s", (_label, confirmation, pending) => {
    expect(evaluateAdmission(confirmation, pending, NOW)).toEqual({
      kind: "reject",
      code: "age_not_confirmed",
    });
  });

  it("allows when the pending row confirms age even though the confirmation carries none", () => {
    // The magic-link verify request never carries the age confirmation: the pending-signup
    // row written at the signup action is the server-validated evidence the gate reads.
    expect(evaluateAdmission(NO_CONFIRMATION, pendingSignup(), NOW)).toEqual({
      kind: "allow",
      consentVersion: CONSENT,
      consentedAt: NOW,
    });
  });

  it("allows and stamps consent when the confirmation carries age and consent", () => {
    expect(evaluateAdmission(AGE_AND_CONSENT, null, NOW)).toEqual({
      kind: "allow",
      consentVersion: CONSENT,
      consentedAt: NOW,
    });
  });

  it("allows and stamps consent read from the pending-signup row", () => {
    expect(
      evaluateAdmission(AGE_ONLY, pendingSignup({ consentVersion: "2026-07-01" }), NOW),
    ).toEqual({
      kind: "allow",
      consentVersion: "2026-07-01",
      consentedAt: NOW,
    });
  });

  it("prefers the confirmation's consent over the pending row's", () => {
    const decision = evaluateAdmission(
      { ageConfirmed: true, consentVersion: "confirmation" },
      pendingSignup({ consentVersion: "pending" }),
      NOW,
    );
    expect(decision).toEqual({
      kind: "allow",
      consentVersion: "confirmation",
      consentedAt: NOW,
    });
  });

  it("allows with NULL consent fields when age is confirmed but consent is absent", () => {
    expect(evaluateAdmission(AGE_ONLY, null, NOW)).toEqual({
      kind: "allow",
      consentVersion: null,
      consentedAt: null,
    });
  });

  it("allows with NULL consent fields when the only pending row is for another concern", () => {
    expect(evaluateAdmission(AGE_ONLY, pendingSignup({ consentVersion: null }), NOW)).toEqual({
      kind: "allow",
      consentVersion: null,
      consentedAt: null,
    });
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
    ["an object", { version: CONSENT }, null],
  ])("normalizes %s", (_label, input, expected) => {
    expect(normalizeConsentVersion(input)).toBe(expected);
  });
});
