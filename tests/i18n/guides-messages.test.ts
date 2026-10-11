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

describe.each(LOCALES)("guides messages (%s)", (locale) => {
  const messages = namespaceMessages(locale, ["guides"]);

  it("has the same keys and placeholders as fr", () => {
    const reference = namespaceMessages("fr", ["guides"]);
    expect([...messages.keys()].sort()).toEqual([...reference.keys()].sort());
    for (const [key, value] of messages) {
      expect(distinct(value), key).toEqual(distinct(reference.get(key) ?? ""));
    }
  });

  it("has no empty string", () => {
    const empty = [...messages].filter(([, value]) => value.trim() === "").map(([key]) => key);
    expect(empty).toEqual([]);
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
      namespace: "guides",
    }) as unknown as (key: string, params: Record<string, unknown>) => string;
    for (const [key, value] of messages) {
      const params = Object.fromEntries(placeholderNames(value).map((name) => [name, "12"]));
      expect(t(key.replace(/^guides\./, ""), params), key).not.toMatch(ARABIC_INDIC_DIGIT);
    }
  });
});

describe("guides messages: language rules", () => {
  it("puts a no-break space before : ? ! ; in French", () => {
    for (const [key, value] of namespaceMessages("fr", ["guides"])) {
      expect(value, key).not.toMatch(/[^\u00a0][:?!;]/u);
      expect(value, key).not.toMatch(/ [:?!;]/u);
    }
  });

  it("adds the footer guides link key in the three locales", () => {
    for (const catalog of [fr, en, ar]) {
      expect(catalog.footer.guidesLink).toBeTruthy();
    }
  });

  it("translates the guides namespace into Arabic rather than copying French", () => {
    const frMessages = namespaceMessages("fr", ["guides"]);
    const arMessages = namespaceMessages("ar", ["guides"]);
    for (const key of ["guides.meta.description", "guides.index.title"]) {
      expect(arMessages.get(key), key).not.toBe(frMessages.get(key));
    }
  });
});
