import { z } from "zod";

import { isValidIsoDate } from "./dates";

export const IsoDateSchema = z
  .string()
  .refine(isValidIsoDate, { message: "Expected a real date YYYY-MM-DD" });
export const SlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Expected a kebab-case slug");
export const SourceKeySchema = z.string().regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/);
export const CountryCodeSchema = z.string().regex(/^[A-Z]{2}$/, "ISO 3166-1 alpha-2");
export const LanguageCodeSchema = z.string().regex(/^[a-z]{2}$/, "ISO 639-1");
export const CurrencySchema = z.string().regex(/^[A-Z]{3}$/, "ISO 4217");
function isPlainHttpsUrl(v: string): boolean {
  if (!v.startsWith("https://") || /[\s\\]/.test(v) || !URL.canParse(v)) return false;
  const url = new URL(v);
  return (
    url.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    url.hostname.includes(".")
  );
}
export const HttpsUrlSchema = z.string().refine(isPlainHttpsUrl, {
  message: "Expected an https URL",
});
export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export const CefrSchema = z.enum(CEFR_LEVELS);
export const INFO_KINDS = ["official", "estimate", "guidance"] as const;
export const InfoKindSchema = z.enum(INFO_KINDS);
// Must equal src/i18n/routing.ts locales.
export const LOCALES = ["fr", "en", "ar"] as const;
export const LocaleSchema = z.enum(LOCALES);
export const MinorAmountSchema = z.number().int().nonnegative();
export const MoneyRangeSchema = z
  .strictObject({ min: MinorAmountSchema, max: MinorAmountSchema, currency: CurrencySchema })
  .refine((r) => r.min <= r.max, { message: "min must be <= max" });

export type Slug = string;
export type SourceKey = string;
export type CountryCode = string;
export type LanguageCode = string;
export type Currency = string;
export type Cefr = z.infer<typeof CefrSchema>;
export type InfoKind = z.infer<typeof InfoKindSchema>;
export type Locale = z.infer<typeof LocaleSchema>;
export type MoneyRange = z.infer<typeof MoneyRangeSchema>;
