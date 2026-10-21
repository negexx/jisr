import { describe, expect, it } from "vitest";

import { CURRENT_CONSENT_VERSION } from "@/lib/auth/consent";

import {
  auditDeviceClaims,
  CATALOGS,
  DEVICE_CLAIMS,
  GUEST_GOLDEN,
  GUEST_ONLY_CLAIMS,
  LOCALES,
  readSource,
} from "./copy-audit";
import { FORBIDDEN } from "./forbidden-wording";

const real = {
  catalogs: CATALOGS,
  claims: DEVICE_CLAIMS,
  guestOnly: GUEST_ONLY_CLAIMS,
  source: readSource,
};

// The notice's "last updated" date must follow the notice, so it is the one key allowed to move;
// it is pinned to the consent version instead (a notice change bumps both, ADR 0013 decision 2).
const NOTICE_DATE_KEY = "legal.updated";

describe.each(
  LOCALES,
)("guest copy is byte-identical to the pre-accounts catalogue (%s)", (locale) => {
  it("keeps every pre-existing key's value", () => {
    const changed = Object.entries(GUEST_GOLDEN[locale]).filter(
      ([key, value]) => key !== NOTICE_DATE_KEY && CATALOGS[locale][key] !== value,
    );
    expect(changed.map(([key]) => key)).toEqual([]);
  });

  it("dates the notice with the current consent version", () => {
    const [year, month, day] = CURRENT_CONSENT_VERSION.split("-");
    expect(CATALOGS[locale][NOTICE_DATE_KEY]).toContain(`${day}/${month}/${year}`);
  });
});

function sharedPrefixLength(a: string, b: string): number {
  let length = 0;
  while (length < a.length && a[length] === b[length]) length += 1;
  return length;
}

describe("signed-in variants", () => {
  it("exist in fr, en and ar and differ from the guest wording", () => {
    for (const [key, claim] of Object.entries(DEVICE_CLAIMS)) {
      for (const locale of LOCALES) {
        const variant = CATALOGS[locale][claim.variant];
        expect(variant, `${claim.variant} (${locale})`).toBeTruthy();
        expect(variant, `${key} (${locale})`).not.toBe(CATALOGS[locale][key]);
      }
    }
  });

  it("are new keys, apart from the clear-data copy that already existed", () => {
    for (const locale of LOCALES) {
      for (const claim of Object.values(DEVICE_CLAIMS)) {
        if (claim.variant === "clearDataAccount.description") continue;
        expect(GUEST_GOLDEN[locale][claim.variant], claim.variant).toBeUndefined();
      }
    }
  });

  it("keep the rules of the rest of the copy", () => {
    for (const locale of LOCALES) {
      for (const [key, claim] of Object.entries(DEVICE_CLAIMS)) {
        const value = CATALOGS[locale][claim.variant] ?? "";
        // A variant may reuse the opening of its guest sentence; only the new wording is checked.
        const reused = sharedPrefixLength(value, CATALOGS[locale][key] ?? "");
        for (const pattern of FORBIDDEN[locale]) {
          expect(value.slice(reused), `${claim.variant} ${pattern}`).not.toMatch(pattern);
        }
        expect(value, claim.variant).not.toMatch(/[–—]/);
        expect(value, claim.variant).not.toMatch(/[٠-٩۰-۹]/u);
        expect(value, claim.variant).not.toContain("TODO-translate");
      }
    }
  });

  it("makes the footer say tracking cookies, not no cookies", () => {
    expect(CATALOGS.en["footer.privacySignedIn"]).toContain("no tracking cookies");
    expect(CATALOGS.fr["footer.privacySignedIn"]).toContain("aucun cookie de suivi");
    expect(CATALOGS.ar["footer.privacySignedIn"]).toContain("للتتبع");
  });

  it("leaves the destination channel facts alone", () => {
    for (const key of [
      "matchCard.channel.account.notRequired",
      "plan.steps.accountNotRequired",
      "compare.application.account.notRequired",
    ]) {
      expect(Object.keys(DEVICE_CLAIMS)).not.toContain(key);
      for (const locale of LOCALES) expect(CATALOGS[locale][key]).toBe(GUEST_GOLDEN[locale][key]);
    }
  });
});

describe("the device-claim audit", () => {
  it("passes on the real catalogues and sources", () => {
    expect(auditDeviceClaims(real)).toEqual([]);
  });

  it("names a device claim that is rendered with no signed-in variant", () => {
    const { "plan.lead": _removed, ...claims } = DEVICE_CLAIMS;
    const problems = auditDeviceClaims({ ...real, claims });
    expect(problems).toEqual(["plan.lead: device-local claim with no signed-in variant"]);
  });

  it("names a new unconditional 'nothing is sent to a server' string", () => {
    const catalogs = {
      ...CATALOGS,
      en: { ...CATALOGS.en, "plan.future.note": "Nothing is sent to a server." },
    };
    expect(auditDeviceClaims({ ...real, catalogs })).toEqual([
      "plan.future.note: device-local claim with no signed-in variant",
    ]);
  });

  it("names a claim whose variant is missing in one locale", () => {
    const { "home.ctaNoteSignedIn": _gone, ...ar } = CATALOGS.ar;
    const problems = auditDeviceClaims({ ...real, catalogs: { ...CATALOGS, ar } });
    expect(problems).toEqual(["home.ctaNote: variant home.ctaNoteSignedIn missing in ar"]);
  });

  it("names a claim whose surface never renders its variant", () => {
    const problems = auditDeviceClaims({ ...real, source: () => "" });
    expect(problems.some((line) => line.startsWith("footer.privacy:"))).toBe(true);
    expect(problems).toHaveLength(Object.keys(DEVICE_CLAIMS).length);
  });

  it("names a variant that repeats the guest promise", () => {
    const en = { ...CATALOGS.en, "plan.leadSignedIn": "Your progress stays on this device." };
    expect(auditDeviceClaims({ ...real, catalogs: { ...CATALOGS, en } })).toEqual([
      "plan.lead: variant plan.leadSignedIn repeats a guest promise in en",
    ]);
  });
});
