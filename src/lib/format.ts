import { type IsoDate, isValidIsoDate } from "@/data-schema/dates";
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

export function formatDate(iso: IsoDate, _locale: AppLocale): string {
  if (!isValidIsoDate(iso)) throw new RangeError(`Invalid ISO date: ${JSON.stringify(iso)}`);
  const [year, month, day] = iso.split("-");
  // Built from the ISO string, not Intl: the machine timezone must never shift a calendar date.
  // Same DD/MM/YYYY in every locale; `_locale` is kept so callers do not change if that ever differs.
  return `${day}/${month}/${year}`;
}

// Intl throws a RangeError for malformed codes and defaults to 2 digits for unknown well-formed ones.
export function minorUnitDigits(currency: string): number {
  // Safe: with style "currency", resolvedOptions always reports maximumFractionDigits; only the TS lib types it optional.
  return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
    .maximumFractionDigits as number;
}

function assertMinorAmount(minor: number): void {
  if (!Number.isInteger(minor)) {
    throw new RangeError(`Money must be an integer number of minor units, got ${minor}`);
  }
}

function currencyFormat(currency: string, locale: AppLocale): Intl.NumberFormat {
  return new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency });
}

export function formatMoney(minor: number, currency: string, locale: AppLocale): string {
  assertMinorAmount(minor);
  return currencyFormat(currency, locale).format(minor / 10 ** minorUnitDigits(currency));
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
  return currencyFormat(currency, locale).formatRange(minMinor / divisor, maxMinor / divisor);
}

export function formatGrade(
  grade: number,
  scale: { min: number; max: number },
  locale: AppLocale,
): string {
  const numbers = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 2 });
  return `${numbers.format(grade)} / ${numbers.format(scale.max)}`;
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
