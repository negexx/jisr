import { createTranslator } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { LOCALES } from "./trust-wording";

const CATALOGS = { fr, en, ar };
const KEYS = ["numbeoCity", "numbeoCountry", "numbeoNote"] as const;
const NOT_OFFICIAL = { en: /not an official/i, fr: /non officiel/i, ar: /غير رسمي/u };
// French puts a no-break space (U+00A0 or U+202F) before : ? ! ; so anything else before one is wrong.
const FRENCH_PUNCTUATION_WITHOUT_NO_BREAK_SPACE = /[^\u00A0\u202F][:?!;]/;

describe.each(LOCALES)("Numbeo link messages (%s)", (locale) => {
  const messages = CATALOGS[locale].costBreakdown as Record<string, string>;

  it("has the three keys", () => {
    for (const key of KEYS) expect(messages[key], key).toBeTypeOf("string");
  });

  it("names Numbeo and says the site is external, in the link text", () => {
    expect(messages.numbeoCity).toContain("Numbeo");
    expect(messages.numbeoCountry).toContain("Numbeo");
  });

  it("keeps the trust note: Numbeo is not official", () => {
    expect(messages.numbeoNote).toContain("Numbeo");
    expect(messages.numbeoNote).toMatch(NOT_OFFICIAL[locale]);
  });

  it("renders with the same arguments in every locale and no Arabic-Indic digits", () => {
    const t = createTranslator({ locale: "ar-EG" as string as "ar", messages: CATALOGS[locale] });
    const place = (chunks: ReactNode) => chunks;
    const city = [t.rich("costBreakdown.numbeoCity", { city: "Aachen 12", place })].flat().join("");
    const country = [t.rich("costBreakdown.numbeoCountry", { country: "Germany 12", place })]
      .flat()
      .join("");
    expect(city).toContain("Aachen 12");
    expect(country).toContain("Germany 12");
    expect(`${city}${country}${t("costBreakdown.numbeoNote")}`).not.toMatch(/[٠-٩۰-۹]/u);
  });
});

describe("Numbeo link messages: language rules", () => {
  it("has no em or en dashes and a no-break space before : ? ! ; in French", () => {
    for (const locale of LOCALES) {
      for (const key of KEYS) {
        const value = (CATALOGS[locale].costBreakdown as Record<string, string>)[key] ?? "";
        expect(value, `${locale} ${key}`).not.toMatch(/[–—]/);
      }
    }
    for (const key of KEYS) {
      const value = (fr.costBreakdown as Record<string, string>)[key] ?? "";
      expect(value, key).not.toMatch(FRENCH_PUNCTUATION_WITHOUT_NO_BREAK_SPACE);
    }
  });

  it("accepts a no-break space before French punctuation and rejects an ordinary one", () => {
    const wrong = FRENCH_PUNCTUATION_WITHOUT_NO_BREAK_SPACE;
    expect(wrong.test("Attention\u00A0: oui")).toBe(false);
    expect(wrong.test("Attention\u202F; oui")).toBe(false);
    expect(wrong.test("Attention : oui")).toBe(true);
    expect(wrong.test("Attention: oui")).toBe(true);
  });

  it("calls Numbeo user-contributed, not collaborative, in Arabic", () => {
    expect(ar.costBreakdown.numbeoNote).toContain("قائم على مساهمات المستخدمين");
    expect(ar.costBreakdown.numbeoNote).not.toContain("تعاوني");
  });
});
