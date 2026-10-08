// @vitest-environment jsdom
import { NextIntlClientProvider } from "next-intl";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { AppLocale } from "@/i18n/routing";

import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

const catalogs = { fr, en, ar } as const;
const request = vi.hoisted(() => ({ locale: "fr" }));

// next-intl's server API needs the RSC request scope; the test stands in for it with the real catalogues.
vi.mock("next-intl/server", async () => {
  const { createTranslator: translator } = await import("next-intl");
  const messages = {
    fr: (await import("../../messages/fr.json")).default,
    en: (await import("../../messages/en.json")).default,
    ar: (await import("../../messages/ar.json")).default,
  };
  return {
    setRequestLocale: (locale: string) => {
      request.locale = locale;
    },
    getTranslations: async (arg: string | { locale: AppLocale; namespace: string }) => {
      const locale = (typeof arg === "string" ? request.locale : arg.locale) as AppLocale;
      const namespace = typeof arg === "string" ? arg : arg.namespace;
      return translator({ locale, messages: messages[locale], namespace: namespace as never });
    },
  };
});

const { default: HomePage } = await import("@/app/[locale]/page");

async function renderHome(locale: AppLocale) {
  const element = await HomePage({ params: Promise.resolve({ locale }) });
  const parsed = document.implementation.createHTMLDocument("");
  parsed.body.innerHTML = renderToString(
    <NextIntlClientProvider locale={locale} messages={catalogs[locale]} timeZone="UTC">
      {element}
    </NextIntlClientProvider>,
  );
  return parsed;
}

describe("home page", () => {
  it("links to the scholarships page with the French label", async () => {
    const page = await renderHome("fr");
    const link = page.querySelector('a[href="/fr/scholarships"]');
    expect(link?.textContent?.trim()).toBe("Voir les bourses");
  });

  it.each(["en", "ar"] as const)("links to the scholarships page in %s", async (locale) => {
    const page = await renderHome(locale);
    const link = page.querySelector(`a[href="/${locale}/scholarships"]`);
    expect(link?.textContent?.trim()).toBe(catalogs[locale].home.scholarshipsCta);
  });
});
