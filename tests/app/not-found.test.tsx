// @vitest-environment jsdom
import { NextIntlClientProvider } from "next-intl";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import NotFound from "@/app/[locale]/not-found";
import type { AppLocale } from "@/i18n/routing";

import { catalogs } from "../components/program/program-fixture";

function render(locale: AppLocale) {
  const parsed = document.implementation.createHTMLDocument("");
  parsed.body.innerHTML = renderToString(
    <NextIntlClientProvider locale={locale} messages={catalogs[locale]} timeZone="UTC">
      <NotFound />
    </NextIntlClientProvider>,
  );
  return parsed;
}

describe.each(["fr", "en", "ar"] as const)("localized not-found page (%s)", (locale) => {
  const messages = catalogs[locale].notFound as Record<string, string>;

  it("has one translated h1, a plain message and links home and to the profile", () => {
    const page = render(locale);
    expect(page.querySelectorAll("h1")).toHaveLength(1);
    expect(page.querySelector("h1")?.textContent).toBe(messages.title);
    expect(page.body.textContent).toContain(messages.description);
    const hrefs = [...page.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([`/${locale}`, `/${locale}/profile`]);
  });
});
