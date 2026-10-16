import { createTranslator } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SiteHeader } from "@/components/site-header";
import { routing } from "@/i18n/routing";

import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

const catalogues = { fr, en, ar } as const;

vi.mock("next-intl/server", () => ({
  getTranslations: async ({
    locale,
    namespace,
  }: {
    locale: keyof typeof catalogues;
    namespace: string;
  }) => createTranslator({ locale, messages: catalogues[locale], namespace } as never),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/components/nav-links", () => ({ NavLinks: () => <nav data-stub="nav" /> }));
vi.mock("@/components/locale-switcher", () => ({
  LocaleSwitcher: () => <nav data-stub="locales" />,
}));
// Rendering is synchronous here; the entry has its own test.
vi.mock("@/components/auth/account-entry", () => ({
  AccountEntry: () => <div data-stub="account" />,
}));

describe.each(routing.locales)("site header (%s)", (locale) => {
  it("places the account entry between the navigation and the locale switcher", async () => {
    const markup = renderToStaticMarkup(await SiteHeader({ locale }));
    const nav = markup.indexOf('data-stub="nav"');
    const account = markup.indexOf('data-stub="account"');
    const locales = markup.indexOf('data-stub="locales"');
    expect(nav).toBeGreaterThan(-1);
    expect(nav).toBeLessThan(account);
    expect(account).toBeLessThan(locales);
  });

  it("links home through the logo mark, keeping the accessible name", async () => {
    const markup = renderToStaticMarkup(await SiteHeader({ locale }));
    // Pinned because a next/image runtime or missing dimensions would change the header's JS and CLS.
    expect(markup).toContain('src="/logo-mark.png"');
    expect(markup).toContain('width="160" height="108"');
    expect(markup).toContain('alt=""');
    expect(markup).toContain(catalogues[locale].shell.homeLink);
    expect(markup).not.toContain(catalogues[locale].shell.siteNameArabic);
  });
});
