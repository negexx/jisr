import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { routing } from "./routing";

// next/root-params (the newer form) needs experimental.rootParams on Next 16, so requestLocale is used.
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return {
    locale,
    // Date-only values are rendered, so UTC cannot shift a calendar day.
    timeZone: "UTC",
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
