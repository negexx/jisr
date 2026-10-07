import { type IsoDate, isValidIsoDate } from "@/data-schema/dates";
import type { MonthDay } from "@/data-schema/records/program";
import type { AppLocale } from "@/i18n/routing";

// ar-MA with Latin digits: Modern Standard Arabic UI, Moroccan usage, product owner's choice of digits.
const INTL_LOCALES: Record<AppLocale, string> = {
  fr: "fr-FR",
  en: "en-GB",
  ar: "ar-MA-u-nu-latn",
};

export function intlLocale(locale: AppLocale): string {
  return INTL_LOCALES[locale];
}

// DD/MM, like the DD/MM/YYYY rule for full dates; Latin digits in every locale.
export function formatMonthDay({ month, day }: MonthDay): string {
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
}

export function formatDate(iso: IsoDate, _locale: AppLocale): string {
  if (!isValidIsoDate(iso)) throw new RangeError(`Invalid ISO date: ${JSON.stringify(iso)}`);
  const [year, month, day] = iso.split("-");
  // Built from the ISO string, not Intl: the machine timezone must never shift a calendar date.
  // Same DD/MM/YYYY in every locale; `_locale` is kept so callers do not change if that ever differs.
  return `${day}/${month}/${year}`;
}

// Stored money scale for the currencies the data uses, fixed here because Intl's answer depends on the
// ICU/CLDR build: Node 24 and Chrome 152 give HUF 0 digits, ISO 4217 and older CLDR give 2, so a
// different browser would show forint amounts 100x wrong. HUF is stored as whole forints (no fillér).
const KNOWN_MINOR_UNIT_DIGITS: Readonly<Record<string, number>> = {
  EUR: 2,
  MAD: 2,
  USD: 2,
  HUF: 0,
};

// Currencies outside the table fall back to Intl, which throws a RangeError for malformed codes and
// defaults to 2 digits for unknown well-formed ones.
export function minorUnitDigits(currency: string): number {
  const known = KNOWN_MINOR_UNIT_DIGITS[currency];
  if (known !== undefined) return known;
  // Safe: with style "currency", resolvedOptions always reports maximumFractionDigits; only the TS lib types it optional.
  return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
    .maximumFractionDigits as number;
}

// ICU prefixes Arabic output with RLM (U+200F), which reverses range ends next to other text.
// Callers control direction with <bdi dir="ltr">, so no direction marks are returned.
const DIRECTION_MARKS = /[\u200E\u200F\u061C]/g;

function withoutDirectionMarks(text: string): string {
  return text.replace(DIRECTION_MARKS, "");
}

function assertMinorAmount(minor: number): void {
  if (!Number.isInteger(minor)) {
    throw new RangeError(`Money must be an integer number of minor units, got ${minor}`);
  }
}

function currencyFormat(currency: string, locale: AppLocale): Intl.NumberFormat {
  const digits = minorUnitDigits(currency);
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatMoney(minor: number, currency: string, locale: AppLocale): string {
  assertMinorAmount(minor);
  return withoutDirectionMarks(
    currencyFormat(currency, locale).format(minor / 10 ** minorUnitDigits(currency)),
  );
}

export function formatMoneyRange(
  minMinor: number,
  maxMinor: number,
  currency: string,
  locale: AppLocale,
): string {
  assertMinorAmount(minMinor);
  assertMinorAmount(maxMinor);
  if (minMinor > maxMinor) {
    throw new RangeError(`Range minimum ${minMinor} is greater than maximum ${maxMinor}`);
  }
  // ICU collapses equal ends to "~€10.00"; a plain amount reads better than an approximation sign.
  if (minMinor === maxMinor) return formatMoney(minMinor, currency, locale);
  const divisor = 10 ** minorUnitDigits(currency);
  return withoutDirectionMarks(
    currencyFormat(currency, locale).formatRange(minMinor / divisor, maxMinor / divisor),
  );
}

export function formatGrade(
  grade: number,
  scale: { min: number; max: number },
  locale: AppLocale,
): string {
  const numbers = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 2 });
  return withoutDirectionMarks(`${numbers.format(grade)} / ${numbers.format(scale.max)}`);
}

// Only ASCII digits with at most one "." or ",": the profile form shows a hint for anything else
// (Arabic-Indic digits, thousands separators) instead of guessing what the student meant.
const PLAIN_DECIMAL = /^(?:[0-9]+[.,]?[0-9]*|[.,][0-9]+)$/;
// "10.000" or "1,000" could be ten thousand or ten: 1000x apart, so it is ambiguous, not a decimal.
const AMBIGUOUS_THOUSANDS = /^[0-9]{1,3}[.,][0-9]{3}$/;

// For decimal grades typed by a student. Money input should be whole-number digits only, because a
// separator followed by three digits is rejected as ambiguous.
export function parseLocaleDecimal(input: string): number | null {
  const trimmed = input.trim();
  if (!PLAIN_DECIMAL.test(trimmed) || AMBIGUOUS_THOUSANDS.test(trimmed)) return null;
  const value = Number(trimmed.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}
