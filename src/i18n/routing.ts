import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["fr", "en", "ar"],
  defaultLocale: "fr",
  // Project rule: no cookies (ADR 0004). Locale lives in the URL prefix.
  localeCookie: false,
});

export type AppLocale = (typeof routing.locales)[number];
