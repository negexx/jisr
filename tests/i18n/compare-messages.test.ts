import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import { COMPARE_MESSAGE_NAMESPACES } from "@/components/compare/namespaces";
import { pickMessages } from "@/lib/i18n/client-messages";
import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { FORBIDDEN } from "./forbidden-wording";
import { LOCALES, namespaceMessages, placeholderNames } from "./trust-wording";

const CATALOGS = { fr, en, ar };
// "ar-EG" prints Arabic-Indic digits under every CLDR: it stands in for the worst browser.
const WORST_ARABIC_LOCALE = "ar-EG" as string as "ar";
const ARABIC_INDIC_DIGIT = /[٠-٩۰-۹]/u;
const NBSP = "\u00a0";

function distinct(message: string): string[] {
  return [...new Set(placeholderNames(message))].sort();
}

describe.each(LOCALES)("compare messages (%s)", (locale) => {
  const messages = namespaceMessages(locale, ["compare"]);

  it("has the same keys and placeholders as fr", () => {
    const reference = namespaceMessages("fr", ["compare"]);
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

  it("ranks nothing: no best, cheapest or recommended wording", () => {
    const text = [...messages.values()].join("\n");
    expect(text).not.toMatch(
      /\b(best|cheapest|recommended|winner|better|meilleur|moins cher|recommandé|gagnant)\b|الأفضل|الأرخص|موصى/iu,
    );
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
      namespace: "compare",
    }) as unknown as { (key: string, params: Record<string, unknown>): string };
    for (const [key, value] of messages) {
      const params = Object.fromEntries(placeholderNames(value).map((name) => [name, "12"]));
      expect(t(key.replace(/^compare\./, ""), params), key).not.toMatch(ARABIC_INDIC_DIGIT);
    }
  });

  it("can be picked, with every namespace the island reads", () => {
    expect(() => pickMessages(CATALOGS[locale], COMPARE_MESSAGE_NAMESPACES)).not.toThrow();
  });
});

describe("compare messages: language rules", () => {
  it("puts a no-break space before : ? ! ; in French", () => {
    for (const [key, value] of namespaceMessages("fr", ["compare"])) {
      expect(value, key).not.toMatch(/[^\u00a0][:?!;]/u);
      expect(value, key).not.toMatch(/ [:?!;]/u);
    }
    expect(namespaceMessages("fr", ["compare"]).get("compare.application.account.unknown")).toBe(
      `Compte${NBSP}: non précisé`,
    );
  });

  it("does not use بكالوريوس for the Bachelor's level", () => {
    for (const [key, value] of namespaceMessages("ar", ["compare"])) {
      expect(value, key).not.toContain("بكالوريوس");
    }
  });
});
