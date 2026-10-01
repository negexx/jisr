import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { FORBIDDEN } from "./forbidden-wording";
import { LOCALES, namespaceMessages, placeholderNames } from "./trust-wording";

const NAMESPACES = ["matches"] as const;
const CATALOGS = { fr, en, ar };
// "ar-EG" prints Arabic-Indic digits under every CLDR: it stands in for the worst browser.
const WORST_ARABIC_LOCALE = "ar-EG" as string as "ar";
const ARABIC_INDIC_DIGIT = /[٠-٩۰-۹]/u;
// A plural repeats {count} in every branch, so compare the names, not their occurrences.
function distinct(message: string): string[] {
  return [...new Set(placeholderNames(message))].sort();
}

const NBSP = " ";

describe.each(LOCALES)("matches messages (%s)", (locale) => {
  const messages = namespaceMessages(locale, NAMESPACES);

  it("has the same keys as fr", () => {
    expect([...messages.keys()].sort()).toEqual(
      [...namespaceMessages("fr", NAMESPACES).keys()].sort(),
    );
  });

  it("never promises eligibility, admission or a guarantee", () => {
    for (const [key, value] of messages) {
      for (const pattern of FORBIDDEN[locale]) {
        expect(value, `${key} ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("has no em or en dashes and no unresolved TODO marker", () => {
    for (const [key, value] of messages) {
      expect(value, key).not.toMatch(/[–—]/);
      expect(value, key).not.toContain("TODO-translate");
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
      const params = Object.fromEntries(placeholderNames(value).map((name) => [name, "Sample 12"]));
      for (const n of [1, 2, 3, 11, 100]) {
        // `money` is the <bdi> tag of the budget chip.
        const text = t.rich(key, { ...params, n, money: (chunks: string) => chunks });
        expect([text].flat().join(""), `${key} ${n}`).not.toMatch(ARABIC_INDIC_DIGIT);
      }
    }
    expect(errors).toEqual([]);
  });

  it("uses the same displayed placeholders as fr", () => {
    const french = namespaceMessages("fr", NAMESPACES);
    for (const [key, value] of messages) {
      expect(distinct(value), key).toEqual(distinct(french.get(key) ?? ""));
    }
  });

  it("states a foundation year, requirements not met and the unknown state without a verdict", () => {
    const text = [...messages.values()].join("\n");
    expect(text).not.toMatch(/\b(rejected|refused|impossible|refusé|rejeté|مرفوض|مستحيل)\b/iu);
  });
});

describe("matches messages: language rules", () => {
  it("puts a no-break space before : ? ! ; in French", () => {
    for (const [key, value] of namespaceMessages("fr", NAMESPACES)) {
      expect(value, key).not.toMatch(/[^ ][:?!;]/);
      expect(value, key).not.toMatch(/ [:?!;]/);
    }
  });

  it("uses a no-break space in the French reason and count line", () => {
    expect(namespaceMessages("fr", NAMESPACES).get("matches.hidden.reasonCount")).toBe(
      `{reason}${NBSP}: {count}`,
    );
  });

  it("does not use بكالوريوس for the Bachelor's level", () => {
    for (const [key, value] of namespaceMessages("ar", NAMESPACES)) {
      expect(value, key).not.toContain("بكالوريوس");
    }
  });

  it("gives the Arabic counts every plural form that has its own wording", () => {
    const ar = namespaceMessages("ar", NAMESPACES);
    for (const key of ["ok", "check", "foundation", "failed"]) {
      const value = ar.get(`matches.counts.${key}`) ?? "";
      for (const form of ["one", "two", "few", "many", "other"]) {
        expect(value, `${key} ${form}`).toContain(`${form} {`);
      }
    }
  });
});
