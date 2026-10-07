import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { FORBIDDEN } from "./forbidden-wording";
import { LOCALES, namespaceMessages, placeholderNames } from "./trust-wording";

const CATALOGS = { fr, en, ar };
// "ar-EG" prints Arabic-Indic digits under every CLDR: it stands in for the worst browser.
const WORST_ARABIC_LOCALE = "ar-EG" as string as "ar";
const ARABIC_INDIC_DIGIT = /[٠-٩۰-۹]/u;

function distinct(message: string): string[] {
  return [...new Set(placeholderNames(message))].sort();
}

describe.each(LOCALES)("scholarships page messages (%s)", (locale) => {
  const messages = namespaceMessages(locale, ["scholarshipsPage"]);

  it("has the same keys and placeholders as fr", () => {
    const reference = namespaceMessages("fr", ["scholarshipsPage"]);
    expect([...messages.keys()].sort()).toEqual([...reference.keys()].sort());
    for (const [key, value] of messages) {
      expect(distinct(value), key).toEqual(distinct(reference.get(key) ?? ""));
    }
  });

  it("never promises eligibility, admission or a guarantee", () => {
    for (const [key, value] of messages) {
      for (const pattern of FORBIDDEN[locale])
        expect(value, `${key} ${pattern}`).not.toMatch(pattern);
    }
  });

  it("has no em or en dashes, no TODO marker and no ICU number formatting", () => {
    for (const [key, value] of messages) {
      expect(value, key).not.toMatch(/[–—]/);
      expect(value, key).not.toContain("TODO-translate");
      expect(value, key).not.toMatch(/(?<!')#/);
      expect(value, key).not.toMatch(/,\s*(number|date|time)\b/);
    }
  });

  it("renders every message without Arabic-Indic digits whatever the browser locale", () => {
    const t = createTranslator({
      locale: WORST_ARABIC_LOCALE,
      messages: CATALOGS[locale],
      namespace: "scholarshipsPage",
    }) as unknown as (key: string, params: Record<string, unknown>) => string;
    for (const [key, value] of messages) {
      const params = Object.fromEntries(placeholderNames(value).map((name) => [name, "12"]));
      expect(t(key.replace(/^scholarshipsPage\./, ""), params), key).not.toMatch(
        ARABIC_INDIC_DIGIT,
      );
    }
  });

  it("never marks a missing value as a figure: the unknown lines say it is to be checked", () => {
    for (const key of [
      "amount.unknown",
      "deadline.unknown",
      "requirements.none",
      "documents.none",
      "documents.missing",
      "howToApply.missing",
    ]) {
      expect(messages.get(`scholarshipsPage.${key}`), key).toBeTruthy();
    }
  });
});

describe("scholarships page messages: language rules", () => {
  it("puts a no-break space before : ? ! ; in French", () => {
    for (const [key, value] of namespaceMessages("fr", ["scholarshipsPage"])) {
      expect(value, key).not.toMatch(/[^ ][:?!;]/u);
      expect(value, key).not.toMatch(/ [:?!;]/u);
    }
  });

  it("does not use بكالوريوس for the Bachelor's level", () => {
    for (const [key, value] of namespaceMessages("ar", ["scholarshipsPage"])) {
      expect(value, key).not.toContain("بكالوريوس");
    }
  });

  it("adds the nav and home keys in the three locales", () => {
    for (const catalog of [fr, en, ar]) {
      expect(catalog.nav.scholarships).toBeTruthy();
      expect(catalog.home.scholarshipsCta).toBeTruthy();
    }
  });
});
