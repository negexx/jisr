import { describe, expect, it } from "vitest";

import type { IsoDate } from "@/data-schema/dates";
import type { AppLocale } from "@/i18n/routing";
import {
  formatDate,
  formatGrade,
  formatMoney,
  formatMoneyRange,
  intlLocale,
  minorUnitDigits,
  parseLocaleDecimal,
} from "@/lib/format";

const LOCALES: readonly AppLocale[] = ["fr", "en", "ar"];

// Bidi marks and non-breaking spaces vary by ICU version; the visible text is what we pin.
function visible(text: string): string {
  return text.replace(/[‎‏؜]/g, "").replace(/\s/g, " ");
}

function expectAsciiDigitsOnly(text: string): void {
  expect(text).not.toMatch(/[٠-٩۰-۹]/);
}

describe("intlLocale", () => {
  it.each([
    ["fr", "fr-FR"],
    ["en", "en-GB"],
    ["ar", "ar-MA-u-nu-latn"],
  ] as const)("maps %s to %s", (locale, expected) => {
    expect(intlLocale(locale)).toBe(expected);
  });

  it.each(LOCALES)("is supported by this runtime's ICU for %s", (locale) => {
    expect(Intl.NumberFormat.supportedLocalesOf(intlLocale(locale))).toHaveLength(1);
  });

  it("resolves ar to Moroccan Arabic with Latin digits", () => {
    const resolved = new Intl.NumberFormat(intlLocale("ar")).resolvedOptions();
    expect(resolved.locale).toBe("ar-MA-u-nu-latn");
    expect(resolved.numberingSystem).toBe("latn");
  });
});

describe("formatDate", () => {
  it.each(LOCALES)("renders DD/MM/YYYY with zero padding in %s", (locale) => {
    expect(visible(formatDate("2026-01-05", locale))).toBe("05/01/2026");
    expect(visible(formatDate("2026-12-31", locale))).toBe("31/12/2026");
    expect(visible(formatDate("2024-02-29", locale))).toBe("29/02/2024");
    expect(visible(formatDate("0999-03-07", locale))).toBe("07/03/0999");
  });

  it("uses Latin digits in ar", () => {
    expectAsciiDigitsOnly(formatDate("2026-09-30", "ar"));
  });

  it.each([
    "",
    "2026-13-01",
    "2026-02-30",
    "2025-02-29",
    "30/09/2026",
    "2026-9-3",
    "not a date",
  ])("throws on invalid input %j", (value) => {
    expect(() => formatDate(value as IsoDate, "fr")).toThrow();
  });
});

describe("minorUnitDigits", () => {
  it.each([
    ["EUR", 2],
    ["MAD", 2],
    ["USD", 2],
    ["JPY", 0],
    // ISO 4217 "testing" code: ICU has no data for it and defaults to 2 digits.
    ["XTS", 2],
    // Well-formed but unknown: falls back to 2.
    ["ZZZ", 2],
  ])("%s has %i minor unit digits", (currency, digits) => {
    expect(minorUnitDigits(currency)).toBe(digits);
  });

  it.each(["", "EU", "EURO", "E1R", "€€€"])("throws on malformed code %j", (currency) => {
    expect(() => minorUnitDigits(currency)).toThrow();
  });
});

describe("formatMoney", () => {
  it.each([
    ["fr", "1 234,56 €"],
    ["en", "€1,234.56"],
    ["ar", "1.234,56 €"],
  ] as const)("formats 123456 EUR minor units in %s", (locale, expected) => {
    expect(visible(formatMoney(123456, "EUR", locale))).toBe(expected);
  });

  it.each([
    ["fr", "0,00 €"],
    ["en", "€0.00"],
    ["ar", "0,00 €"],
  ] as const)("formats zero in %s", (locale, expected) => {
    expect(visible(formatMoney(0, "EUR", locale))).toBe(expected);
  });

  it.each([
    ["fr", "1 500 JPY"],
    ["en", "JP¥1,500"],
    ["ar", "1.500 JP¥"],
  ] as const)("does not divide zero-digit currencies (JPY) in %s", (locale, expected) => {
    expect(visible(formatMoney(1500, "JPY", locale))).toBe(expected);
  });

  it.each([
    ["fr", "12,50 XTS"],
    ["en", "XTS 12.50"],
    ["ar", "12,50 XTS"],
  ] as const)("shows the testing code XTS as text in %s", (locale, expected) => {
    expect(visible(formatMoney(1250, "XTS", locale))).toBe(expected);
  });

  it.each(LOCALES)("keeps Latin digits in %s", (locale) => {
    expectAsciiDigitsOnly(formatMoney(987654321, "EUR", locale));
  });

  it.each([
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])("throws on non-integer or non-finite minor amount %s", (minor) => {
    expect(() => formatMoney(minor, "EUR", "en")).toThrow();
  });

  it("throws on a malformed currency code", () => {
    expect(() => formatMoney(100, "EU", "en")).toThrow();
  });
});

describe("formatMoneyRange", () => {
  it.each([
    ["fr", "10,00–20,00 €"],
    ["en", "€10.00 – €20.00"],
    ["ar", "10,00–20,00 €"],
  ] as const)("formats a range of EUR minor units in %s", (locale, expected) => {
    expect(visible(formatMoneyRange(1000, 2000, "EUR", locale))).toBe(expected);
  });

  it.each([
    ["fr", "1 000–1 500 JPY"],
    ["en", "JP¥1,000–1,500"],
    ["ar", "1.000–1.500 JP¥"],
  ] as const)("does not divide zero-digit currencies (JPY) in %s", (locale, expected) => {
    expect(visible(formatMoneyRange(1000, 1500, "JPY", locale))).toBe(expected);
  });

  it.each(
    LOCALES,
  )("returns the plain amount, not a collapsed ~ form, when ends are equal in %s", (locale) => {
    const equal = formatMoneyRange(1000, 1000, "EUR", locale);
    expect(equal).toBe(formatMoney(1000, "EUR", locale));
    expect(equal).not.toMatch(/[~≃]/);
  });

  it.each(LOCALES)("keeps Latin digits in %s", (locale) => {
    expectAsciiDigitsOnly(formatMoneyRange(123456, 987654, "EUR", locale));
  });

  it("throws when min is greater than max", () => {
    expect(() => formatMoneyRange(2000, 1000, "EUR", "en")).toThrow();
  });

  it.each([
    [1.5, 2000],
    [1000, Number.NaN],
  ])("throws on non-integer or non-finite ends (%s, %s)", (min, max) => {
    expect(() => formatMoneyRange(min, max, "EUR", "en")).toThrow();
  });
});

describe("formatGrade", () => {
  const scale = { min: 0, max: 20 };

  it.each([
    ["fr", 14.5, "14,5 / 20"],
    ["en", 14.5, "14.5 / 20"],
    ["ar", 14.5, "14,5 / 20"],
    ["fr", 14, "14 / 20"],
    ["en", 14, "14 / 20"],
    ["ar", 14, "14 / 20"],
    ["fr", 14.567, "14,57 / 20"],
    ["en", 14.567, "14.57 / 20"],
    ["ar", 14.567, "14,57 / 20"],
    ["en", 0, "0 / 20"],
  ] as const)("renders %s grade %d as %s", (locale, grade, expected) => {
    expect(visible(formatGrade(grade, scale, locale))).toBe(expected);
  });

  it("shows the scale as its max only", () => {
    expect(formatGrade(70, { min: 0, max: 100 }, "en")).toBe("70 / 100");
  });

  it("does not add trailing zeros", () => {
    expect(formatGrade(14.1, scale, "en")).toBe("14.1 / 20");
  });
});

describe("parseLocaleDecimal", () => {
  it.each([
    ["14,5", 14.5],
    ["14.5", 14.5],
    [" 14 ", 14],
    ["0,5", 0.5],
    [".5", 0.5],
    [",5", 0.5],
    ["12.", 12],
    ["12,", 12],
    ["0", 0],
    ["007", 7],
    ["20", 20],
    ["1,000", 1],
  ])("parses %j as %d", (input, expected) => {
    expect(parseLocaleDecimal(input)).toBe(expected);
  });

  it.each([
    "",
    "   ",
    ".",
    ",",
    "1,000.5",
    "1.000,5",
    "1,000,5",
    "1..5",
    "--3",
    "-3",
    "+3",
    "1e3",
    "Infinity",
    "NaN",
    "0x10",
    "1 4",
    "١٤",
    "١٤,٥",
    "۱۴",
    "abc",
    "14a",
    "14,5 pts",
  ])("rejects %j", (input) => {
    expect(parseLocaleDecimal(input)).toBeNull();
  });
});
