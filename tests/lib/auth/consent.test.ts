import { describe, expect, it } from "vitest";

import { CURRENT_CONSENT_VERSION, hasCurrentConsent } from "@/lib/auth/consent";

describe("CURRENT_CONSENT_VERSION", () => {
  it("is an ISO date string", () => {
    expect(CURRENT_CONSENT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("hasCurrentConsent", () => {
  it("is true only for the current version", () => {
    expect(hasCurrentConsent({ consentVersion: CURRENT_CONSENT_VERSION })).toBe(true);
  });

  it("gates the 2026-10-16 notice and accepts the 2026-10-21 notice", () => {
    expect(hasCurrentConsent({ consentVersion: "2026-10-16" })).toBe(false);
    expect(hasCurrentConsent({ consentVersion: "2026-10-21" })).toBe(true);
  });

  it.each<[string, string | null | undefined]>([
    ["no consent", null],
    ["an undefined consent", undefined],
    ["an older version", "2026-01-01"],
    ["an empty string", ""],
    ["a padded current version", ` ${CURRENT_CONSENT_VERSION} `],
  ])("is false for %s", (_label, consentVersion) => {
    expect(hasCurrentConsent({ consentVersion })).toBe(false);
  });
});
