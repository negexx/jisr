import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { FORBIDDEN } from "./forbidden-wording";

type Tree = { [key: string]: string | Tree };
type Locale = "fr" | "en" | "ar";

const LOCALES: readonly Locale[] = ["fr", "en", "ar"];
const catalogs: Record<Locale, Tree> = { fr, en, ar };
// Words-free patterns that read the same in every language.
const LANGUAGE_NEUTRAL = ["profile.fields.overall.outOf", "profile.errors.fieldInRow"];
const WORST_ARABIC_LOCALE = "ar-EG" as string as "ar";
const ARABIC_INDIC_DIGIT = /[٠-٩۰-۹]/u;

function flatten(tree: Tree, prefix: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = `${prefix}.${key}`;
    if (typeof value === "string") out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

function profileOf(locale: Locale): Map<string, string> {
  const tree = catalogs[locale].profile;
  if (tree === undefined || typeof tree === "string") throw new Error(`no profile in ${locale}`);
  return flatten(tree, "profile");
}

const profile: Record<Locale, Map<string, string>> = {
  fr: profileOf("fr"),
  en: profileOf("en"),
  ar: profileOf("ar"),
};

// Argument names, and the ones that select a branch (the `period` select).
function argumentsOf(message: string): { names: string[]; selectors: string[] } {
  const selectors = [...message.matchAll(/\{\s*(\w+)\s*,\s*select\s*,/g)].map((m) => m[1] ?? "");
  const names = [...message.matchAll(/\{\s*(\w+)\s*[,}]/g)].map((m) => m[1] ?? "");
  return { names: [...new Set(names)], selectors };
}

describe("profile messages: contract", () => {
  it.each(LOCALES)("%s has no `#` and no number-typed argument", (locale) => {
    for (const [key, value] of profile[locale]) {
      expect(value, key).not.toContain("#");
      expect(value, key).not.toMatch(/\{\s*\w+\s*,\s*(number|date|time)/);
    }
  });

  it.each(LOCALES)("%s has no em or en dashes and no quoted braces", (locale) => {
    for (const [key, value] of profile[locale]) {
      expect(value, key).not.toMatch(/[–—]/);
      expect(value, key).not.toMatch(/'[{}]/);
    }
  });

  it("uses the same argument names in every locale", () => {
    for (const [key, value] of profile.fr) {
      for (const locale of ["en", "ar"] as const) {
        expect(
          argumentsOf(profile[locale].get(key) ?? "").names.sort(),
          `${locale} ${key}`,
        ).toEqual(argumentsOf(value).names.sort());
      }
    }
  });

  it.each(LOCALES)("%s renders every message under ar-EG without Arabic-Indic digits", (locale) => {
    const errors: unknown[] = [];
    const t = createTranslator({
      locale: WORST_ARABIC_LOCALE,
      messages: catalogs[locale],
      onError: (error) => errors.push(error),
    }) as unknown as {
      rich: (key: string, values: Record<string, unknown>) => unknown;
    };
    for (const [key, value] of profile[locale]) {
      const { names, selectors } = argumentsOf(value);
      for (const branch of ["month", "year"]) {
        const values: Record<string, unknown> = { cert: (chunks: unknown) => chunks };
        for (const name of names) values[name] = selectors.includes(name) ? branch : "12";
        const rendered = [t.rich(key, values)].flat(2).join("");
        expect(rendered, key).not.toMatch(ARABIC_INDIC_DIGIT);
      }
    }
    expect(errors).toEqual([]);
  });
});

describe("profile messages: trust wording", () => {
  it.each(LOCALES)("%s never promises eligibility, admission or a guarantee", (locale) => {
    for (const [key, value] of profile[locale]) {
      for (const pattern of FORBIDDEN[locale])
        expect(value, `${key} ${pattern}`).not.toMatch(pattern);
    }
  });

  it("ar differs from fr unless it starts with TODO-translate", () => {
    const untranslated = [...profile.ar]
      .filter(
        ([key, value]) =>
          value === profile.fr.get(key) &&
          !value.startsWith("TODO-translate") &&
          // Words-free strings ("/ {max}") are the same in every language.
          !LANGUAGE_NEUTRAL.includes(key),
      )
      .map(([key]) => key);
    expect(untranslated).toEqual([]);
  });

  it("says العلامة for a grade", () => {
    expect(profile.ar.get("profile.errors.out_of_range.grade")).toContain("علامة");
    expect(profile.ar.get("profile.fields.subjects.grade")).toBe("العلامة");
  });

  it("never uses بكالوريوس for the Bachelor's level", () => {
    for (const [key, value] of profile.ar) expect(value, key).not.toContain("بكالوريوس");
  });
});

describe("profile messages: number entry guidance", () => {
  it.each(
    LOCALES,
  )("%s tells the student to use the digits 0 to 9 on the number errors", (locale) => {
    for (const key of [
      "profile.errors.not_a_number",
      "profile.errors.not_a_whole_number",
      "profile.fields.budget.amount.hint",
    ]) {
      const value = profile[locale].get(key) ?? "";
      expect(value, key).toContain("0");
      expect(value, key).toContain("9");
    }
    expect(profile[locale].get("profile.errors.digitsHint")).toContain("0");
  });

  it.each([
    ["fr", "sans séparateur de milliers"],
    ["en", "without thousands separators"],
    ["ar", "دون فاصل للآلاف"],
  ] as const)("%s explains the thousands-separator ambiguity", (locale, phrase) => {
    expect(profile[locale].get("profile.errors.ambiguous_number")).toContain(phrase);
  });

  it.each([
    ["fr", "d'au plus"],
    ["en", "at most"],
    ["ar", "لا يتجاوز"],
  ] as const)("%s has a distinct too-large message for a budget", (locale, phrase) => {
    expect(profile[locale].get("profile.errors.out_of_range.budget")).toContain(phrase);
    expect(profile[locale].get("profile.errors.out_of_range.grade")).not.toContain(phrase);
  });

  it.each([
    ["fr", "ne peut pas encore être comparé"],
    ["en", "cannot be compared with the costs in euros yet"],
    ["ar", "لا يمكن بعد مقارنة"],
  ] as const)("%s says a MAD budget cannot be compared yet", (locale, phrase) => {
    expect(profile[locale].get("profile.fields.budget.madNote")).toContain(phrase);
  });
});
