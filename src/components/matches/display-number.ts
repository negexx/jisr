import type { AppLocale } from "@/i18n/routing";
import { formatNumber } from "@/lib/journey/reasons";

// Displayed numbers are always strings (Latin digits in every locale); a value that cannot be
// formatted is shown as plain digits, never as a placeholder.
export function displayNumber(value: number, locale: AppLocale): string {
  return formatNumber(value, locale) ?? String(value);
}
