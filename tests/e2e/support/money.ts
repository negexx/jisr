import { intlLocale } from "@/lib/format";

import type { E2eLocale } from "./locales";

// What the app puts between the two ends of a money range in this locale, taken from the same Intl
// formatter it uses (the text between the two amounts, e.g. " – " in French).
export function rangeSeparator(locale: E2eLocale, currency: string): string {
  const parts = new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency,
  }).formatRangeToParts(1, 2);
  const start = parts.findIndex((part) => part.source === "startRange");
  const end = parts.findLastIndex((part) => part.source === "endRange");
  const between = parts
    .slice(start, end + 1)
    .filter((part) => part.source === "shared" && part.type === "literal");
  // The shared literals inside the range are the separator; marks around the amounts are not.
  const separator = between.map((part) => part.value).join("");
  if (separator.trim() === "") throw new Error(`no range separator for ${locale} ${currency}`);
  return separator;
}
