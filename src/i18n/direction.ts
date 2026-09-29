import type { AppLocale } from "./routing";

export function localeDirection(locale: AppLocale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}
