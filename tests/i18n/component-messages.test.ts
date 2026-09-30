import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { FORBIDDEN } from "./forbidden-wording";
import { LOCALES, namespaceMessages, placeholderNames } from "./trust-wording";

const NAMESPACES = ["costBreakdown", "reasonList", "matchCard"] as const;
const CATALOGS = { fr, en, ar };
const OFFICIAL_WORD = { en: /official/i, fr: /officiel/i, ar: /رسمي/u };
// "ar-EG" prints Arabic-Indic digits under every CLDR: it stands in for the worst browser.
const WORST_ARABIC_LOCALE = "ar-EG" as string as "ar";
const ARABIC_INDIC_DIGIT = /[٠-٩۰-۹]/u;

describe.each(LOCALES)("component messages (%s)", (locale) => {
  const messages = namespaceMessages(locale, NAMESPACES);

  it("has messages for all three component namespaces", () => {
    for (const namespace of NAMESPACES) {
      expect(
        [...messages.keys()].some((key) => key.startsWith(`${namespace}.`)),
        namespace,
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

  it("never words an estimate, a cost or a card label as official", () => {
    for (const [key, value] of messages) expect(value, key).not.toMatch(OFFICIAL_WORD[locale]);
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
      const params = Object.fromEntries(placeholderNames(value).map((name) => [name, "Sample 12"]));
      // `place` is the <bdi> tag of the institution and city line.
      const text = t.rich(key, { ...params, place: (chunks: string) => chunks });
      expect([text].flat().join(""), key).not.toMatch(ARABIC_INDIC_DIGIT);
    }
    expect(errors).toEqual([]);
  });

  it("uses the same placeholder names as fr", () => {
    const french = namespaceMessages("fr", NAMESPACES);
    for (const [key, value] of messages) {
      expect(placeholderNames(value).sort(), key).toEqual(
        placeholderNames(french.get(key) ?? "").sort(),
      );
    }
  });
});

describe("component messages: language rules", () => {
  it("puts a no-break space before : ? ! ; in French", () => {
    for (const [key, value] of namespaceMessages("fr", NAMESPACES)) {
      expect(value, key).not.toMatch(/[^ ][:?!;]/);
      expect(value, key).not.toMatch(/ [:?!;]/);
    }
  });

  it("uses الإجازة for the Bachelor's level, never بكالوريوس", () => {
    const messages = namespaceMessages("ar", NAMESPACES);
    expect(messages.get("matchCard.level.bachelor")).toBe("الإجازة");
    for (const [key, value] of messages) expect(value, key).not.toContain("بكالوريوس");
  });

  it("keeps the product term for values that are not published", () => {
    expect(namespaceMessages("en", NAMESPACES).get("matchCard.languagesUnknown")).toContain(
      "to be checked",
    );
    expect(namespaceMessages("fr", NAMESPACES).get("matchCard.languagesUnknown")).toContain(
      "à vérifier",
    );
    expect(namespaceMessages("ar", NAMESPACES).get("matchCard.languagesUnknown")).toContain(
      "يجب التحقق",
    );
  });
});
