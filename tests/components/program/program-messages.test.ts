import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import { FORBIDDEN } from "../../i18n/forbidden-wording";
import { LOCALES, namespaceMessages, placeholderNames } from "../../i18n/trust-wording";

const CATALOGS = { fr, en, ar };
// The program page and the localized not-found page it falls back to.
const PAGE_NAMESPACES = ["program", "notFound"];
const OFFICIAL_WORD = { en: /official/i, fr: /officiel/i, ar: /رسمي/u };
// Only these name official pages or links; every other program string (banner, costs, estimates, personal box) must not say "official".
const MAY_SAY_OFFICIAL = new Set(["program.sections.links", "program.requirements.none"]);
// Identical in every language on purpose (a name and the site name).
const SAME_IN_EVERY_LOCALE = new Set(["program.meta.titleWithoutInstitution"]);
const WORST_ARABIC_LOCALE = "ar-EG" as string as "ar";
const ARABIC_INDIC_DIGIT = /[٠-٩۰-۹]/u;

describe.each(LOCALES)("program messages (%s)", (locale) => {
  const messages = namespaceMessages(locale, PAGE_NAMESPACES);

  it("has the page namespaces", () => {
    for (const group of ["sections", "banner", "personal", "scholarships", "documents"]) {
      expect(
        [...messages.keys()].some((key) => key.startsWith(`program.${group}.`)),
        group,
      ).toBe(true);
    }
  });

  it("never promises eligibility, admission or a guarantee", () => {
    for (const [key, value] of messages) {
      for (const pattern of FORBIDDEN[locale]) {
        expect(value, `${key} ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("has no em or en dashes", () => {
    for (const [key, value] of messages) expect(value, key).not.toMatch(/[–—]/);
  });

  it("says official only where it names an official page", () => {
    for (const [key, value] of messages) {
      if (!MAY_SAY_OFFICIAL.has(key)) expect(value, key).not.toMatch(OFFICIAL_WORD[locale]);
    }
    for (const key of MAY_SAY_OFFICIAL)
      expect(messages.get(key), key).toMatch(OFFICIAL_WORD[locale]);
  });

  it("keeps the page banner neutral (no official page, one sentence per state)", () => {
    for (const key of ["program.banner.aging", "program.banner.stale", "program.banner.check"]) {
      expect(messages.get(key), key).not.toMatch(OFFICIAL_WORD[locale]);
    }
  });

  it("has no ICU number formatting (#, number, date, time)", () => {
    for (const [key, value] of messages) {
      expect(value, key).not.toMatch(/(?<!')#/);
      expect(value, key).not.toMatch(/,\s*(number|date|time)\b/);
    }
  });

  it("renders without Arabic-Indic digits whatever the browser locale", () => {
    const errors: unknown[] = [];
    const t = createTranslator({
      locale: WORST_ARABIC_LOCALE,
      messages: CATALOGS[locale],
      onError: (error) => errors.push(error),
    }) as unknown as {
      rich: (key: string, params: Record<string, unknown>) => string | string[];
    };
    for (const [key, value] of messages) {
      const params: Record<string, unknown> = Object.fromEntries(
        placeholderNames(value).map((name) => [name, "Sample 12"]),
      );
      for (const years of [1, 2, 3, 11]) {
        const text = t.rich(key, {
          ...params,
          years,
          place: (chunks: string) => chunks,
          money: (chunks: string) => chunks,
        });
        expect([text].flat().join(""), key).not.toMatch(ARABIC_INDIC_DIGIT);
      }
    }
    expect(errors).toEqual([]);
  });

  it("uses the same placeholder names as fr", () => {
    const french = namespaceMessages("fr", PAGE_NAMESPACES);
    for (const [key, value] of messages) {
      expect(placeholderNames(value).sort(), key).toEqual(
        placeholderNames(french.get(key) ?? "").sort(),
      );
    }
  });
});

describe("program messages: language rules", () => {
  it("puts a no-break space before : ? ! ; in French", () => {
    for (const [key, value] of namespaceMessages("fr", PAGE_NAMESPACES)) {
      expect(value, key).not.toMatch(/ [:?!;]/);
    }
  });

  it("uses الإجازة for the Bachelor's level and Latin digits in Arabic", () => {
    const messages = namespaceMessages("ar", PAGE_NAMESPACES);
    expect(messages.get("program.header.level.bachelor")).toBe("الإجازة");
    for (const [key, value] of messages) {
      expect(value, key).not.toContain("بكالوريوس");
      expect(value, key).not.toMatch(ARABIC_INDIC_DIGIT);
    }
  });

  it("translates Arabic (no French left unless marked TODO-translate)", () => {
    const french = namespaceMessages("fr", PAGE_NAMESPACES);
    for (const [key, value] of namespaceMessages("ar", PAGE_NAMESPACES)) {
      if (SAME_IN_EVERY_LOCALE.has(key) || value.startsWith("TODO-translate")) continue;
      expect(value, key).not.toBe(french.get(key));
    }
  });

  it("keeps the product term for values that are not published", () => {
    const keys = [
      "program.header.durationUnknown",
      "program.deadline.deadlineUnknown",
      "program.documents.translation.unknown",
    ];
    const term = { en: "to be checked", fr: "à vérifier", ar: "يجب التحقق" } as const;
    for (const locale of LOCALES) {
      const messages = namespaceMessages(locale, ["program"]);
      for (const key of keys) expect(messages.get(key), `${locale} ${key}`).toContain(term[locale]);
    }
  });

  it("states a scholarship's nationality rule without implying anyone can get it", () => {
    const expected = {
      en: "Open to all nationalities",
      fr: "Ouverte à toutes les nationalités",
      ar: "مفتوحة لجميع الجنسيات",
    } as const;
    for (const locale of LOCALES) {
      expect(
        namespaceMessages(locale, ["program"]).get("program.scholarships.openToEveryone"),
      ).toBe(expected[locale]);
    }
  });

  it("uses a short possessive for the Bac in Arabic", () => {
    expect(namespaceMessages("ar", ["program"]).get("program.personal.route")).toBe(
      "بكالوريتك في هذا البلد",
    );
  });
});
