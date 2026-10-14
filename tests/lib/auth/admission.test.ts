import { describe, expect, it } from "vitest";

import {
  type AdmissionConfirmation,
  confirmationFromOAuthState,
  evaluateAdmission,
  type PendingSignup,
} from "@/lib/auth/admission";

// Fixed outcomes (plan B1/B2): age missing -> reject; consent missing -> created (allowed)
// so the first-login "finish signup" gate blocks features until consent is captured.
// Consent naming anything but exactly the current version counts as missing: never stamped.
// Each sign-in path supplies ONE evidence source (OAuth state or pending row), never both.
const NOW = new Date("2026-10-14T10:00:00.000Z");
const CURRENT = "2026-10-14";
const STALE = "2026-10-05";

const NULL_CONSENT = { kind: "allow", consentVersion: null, consentedAt: null } as const;
const STAMPED = { kind: "allow", consentVersion: CURRENT, consentedAt: NOW } as const;
const REJECT = { kind: "reject", code: "age_not_confirmed" } as const;

function pendingSignup(overrides: Partial<PendingSignup> = {}): PendingSignup {
  return {
    email: "student@example.com",
    ageConfirmed: true,
    consentVersion: CURRENT,
    ...overrides,
  };
}

function confirmation(overrides: Partial<AdmissionConfirmation> = {}): AdmissionConfirmation {
  return { ageConfirmed: true, consentVersion: CURRENT, ...overrides };
}

describe("evaluateAdmission", () => {
  it.each<[string, AdmissionConfirmation | null]>([
    ["there is no evidence", null],
    ["the OAuth confirmation does not confirm age", confirmation({ ageConfirmed: false })],
    ["the pending row does not confirm age", pendingSignup({ ageConfirmed: false })],
    [
      "age is unconfirmed even with no consent either",
      confirmation({ ageConfirmed: false, consentVersion: null }),
    ],
  ])("rejects when %s", (_label, evidence) => {
    expect(evaluateAdmission(evidence, NOW, CURRENT)).toEqual(REJECT);
  });

  it.each<[string, AdmissionConfirmation]>([
    ["an OAuth confirmation", confirmation()],
    ["a pending-signup row", pendingSignup()],
  ])("stamps the current version from %s with the clock it is given", (_label, evidence) => {
    expect(evaluateAdmission(evidence, NOW, CURRENT)).toEqual(STAMPED);
  });

  it.each<[string, string | null]>([
    ["no consent", null],
    ["a stale version", STALE],
    ["an unknown future version", "2099-01-01"],
    ["a version that only resembles the current one", `${CURRENT}x`],
    ["a padded current version", ` ${CURRENT} `],
    [
      "a current version with a trailing newline",
      `${CURRENT}
`,
    ],
    ["an empty string", ""],
  ])("allows with NULL consent fields (never stamped) for %s", (_label, consentVersion) => {
    expect(evaluateAdmission(confirmation({ consentVersion }), NOW, CURRENT)).toEqual(NULL_CONSENT);
    expect(evaluateAdmission(pendingSignup({ consentVersion }), NOW, CURRENT)).toEqual(
      NULL_CONSENT,
    );
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
