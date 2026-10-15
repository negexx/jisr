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

describe.each(LOCALES)("signup messages (%s)", (locale) => {
  const messages = namespaceMessages(locale, ["signup"]);

  it("has the same keys and placeholders as fr", () => {
    const reference = namespaceMessages("fr", ["signup"]);
    expect([...messages.keys()].sort()).toEqual([...reference.keys()].sort());
    for (const [key, value] of messages) {
      expect(distinct(value), key).toEqual(distinct(reference.get(key) ?? ""));
    }
  });

  it("never promises eligibility, admission or a guarantee", () => {
    for (const [key, value] of messages) {
      for (const pattern of FORBIDDEN[locale]) {
        expect(value, `${key} ${pattern}`).not.toMatch(pattern);
      }
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

  it("states the age threshold as 16 in Latin digits", () => {
    expect(messages.get("signup.age.label")).toContain("16");
    expect(messages.get("signup.errors.ageRequired")).toContain("16");
  });

  it("renders every message without Arabic-Indic digits whatever the browser locale", () => {
    const t = createTranslator({
      locale: WORST_ARABIC_LOCALE,
      messages: CATALOGS[locale],
      namespace: "signup",
    }) as unknown as (key: string, params: Record<string, unknown>) => string;
    for (const [key, value] of messages) {
      const params = Object.fromEntries(placeholderNames(value).map((name) => [name, "12"]));
      expect(t(key.replace(/^signup\./, ""), params), key).not.toMatch(ARABIC_INDIC_DIGIT);
    }
  });
});

describe("signup messages: the shared send refusal", () => {
  // EMAIL_COOLDOWN answers both the one-a-minute mailbox cooldown and the daily ceiling, which can
  // last until midnight; one wording for both, so it promises no time and names no limit.
  it.each([
    ["fr", /plus tard/, /minute/i],
    ["en", /later/i, /minute/i],
    ["ar", /لاحقًا/, /دقيقة/],
  ] as const)("says 'try again later' without promising a minute in %s", (locale, later, minute) => {
    const message = CATALOGS[locale].signup.errors.cooldown;
    expect(message).toMatch(later);
    expect(message).not.toMatch(minute);
  });
});

describe("signup messages: language rules", () => {
  it("puts a no-break space before : ? ! ; in French", () => {
    for (const [key, value] of namespaceMessages("fr", ["signup"])) {
      expect(value, key).not.toMatch(/[^ ][:?!;]/u);
      expect(value, key).not.toMatch(/ [:?!;]/u);
    }
  });
});
