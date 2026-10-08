import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["fr", "en", "ar"],
  defaultLocale: "fr",
  // Project rule: no cookies (ADR 0004). Locale lives in the URL prefix.
  localeCookie: false,
  // hreflang comes from page metadata and the sitemap (src/lib/seo.ts). The proxy no longer runs on
  // locale-prefixed paths, so its Link header would only appear on some responses.
  alternateLinks: false,
});

export type AppLocale = (typeof routing.locales)[number];
