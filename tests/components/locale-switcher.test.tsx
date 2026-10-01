// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LocaleSwitcher } from "@/components/locale-switcher";
import type { AppLocale } from "@/i18n/routing";

import { renderIntl } from "./intl";

const navigation = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("@/i18n/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/i18n/navigation")>()),
  usePathname: () => navigation.pathname,
}));

const NAMES: Record<AppLocale, string> = { fr: "Français", en: "English", ar: "العربية" };

afterEach(() => {
  cleanup();
  navigation.pathname = "/";
});

describe("LocaleSwitcher", () => {
  it("keeps the current path under each locale prefix and never adds a query string", () => {
    navigation.pathname = "/matches";
    renderIntl(<LocaleSwitcher current="fr" label="Langue" names={NAMES} />, "fr");
    expect(screen.getByRole("link", { name: "Français" }).getAttribute("href")).toBe("/fr/matches");
    expect(screen.getByRole("link", { name: "English" }).getAttribute("href")).toBe("/en/matches");
    expect(screen.getByRole("link", { name: "العربية" }).getAttribute("href")).toBe("/ar/matches");
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).not.toMatch(/[?#]/);
    }
  });

  it("switches from the home page to the locale roots", () => {
    navigation.pathname = "/";
    renderIntl(<LocaleSwitcher current="en" label="Language" names={NAMES} />, "en");
    expect(screen.getByRole("link", { name: "English" }).getAttribute("href")).toBe("/en");
    expect(screen.getByRole("link", { name: "Français" }).getAttribute("href")).toBe("/fr");
  });

  it("shows native names, lang and hrefLang, and marks only the current language", () => {
    renderIntl(<LocaleSwitcher current="ar" label="اللغة" names={NAMES} />, "ar");
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Français", "English", "العربية"]);
    expect(links.map((link) => link.getAttribute("lang"))).toEqual(["fr", "en", "ar"]);
    expect(links.map((link) => link.getAttribute("hreflang"))).toEqual(["fr", "en", "ar"]);
    expect(links.map((link) => link.getAttribute("aria-current"))).toEqual([null, null, "true"]);
    expect(screen.getByRole("navigation", { name: "اللغة" })).toBeTruthy();
  });
});
