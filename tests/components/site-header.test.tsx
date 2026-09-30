// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ClearDataButton } from "@/components/clear-data-button";
import { HomeMatchesLink } from "@/components/home-matches-link";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { NavLinks } from "@/components/nav-links";

import { IntlWrapper, renderIntl } from "./intl";

const navigation = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("@/i18n/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/i18n/navigation")>()),
  usePathname: () => navigation.pathname,
}));

afterEach(() => {
  cleanup();
  navigation.pathname = "/";
});

const PHYSICAL_DIRECTION_CLASS = /\b(ml|mr|pl|pr|left|right)-/;

describe("NavLinks", () => {
  it("marks the current page and only the current page", () => {
    navigation.pathname = "/matches";
    renderIntl(<NavLinks />, "fr");
    const matches = screen.getByRole("link", { name: "Mes résultats" });
    const profile = screen.getByRole("link", { name: "Mon profil" });
    expect(matches.getAttribute("aria-current")).toBe("page");
    expect(profile.getAttribute("aria-current")).toBeNull();
    expect(matches.getAttribute("href")).toBe("/fr/matches");
  });

  it("keeps a nested page marked as current", () => {
    navigation.pathname = "/profile/review";
    renderIntl(<NavLinks />, "en");
    expect(screen.getByRole("link", { name: "My profile" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("marks nothing on the home page", () => {
    renderIntl(<NavLinks />, "fr");
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("aria-current")).toBeNull();
    }
  });

  it("renders Arabic labels under dir=rtl", () => {
    navigation.pathname = "/profile";
    renderIntl(<NavLinks />, "ar");
    expect(screen.getByTestId("dir-root").getAttribute("dir")).toBe("rtl");
    expect(screen.getByRole("link", { name: "ملفي" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "نتائجي" }).getAttribute("href")).toBe("/ar/matches");
  });
});

describe("shell components use logical direction utilities only", () => {
  const names = { fr: "Français", en: "English", ar: "العربية" };

  it.each(["fr", "ar"] as const)("has no physical-direction class in %s", (locale) => {
    const html = renderToStaticMarkup(
      <IntlWrapper locale={locale}>
        <NavLinks />
        <LocaleSwitcher current={locale} label="x" names={names} />
        <HomeMatchesLink label="x" />
        <ClearDataButton />
      </IntlWrapper>,
    );
    const classTokens = [...html.matchAll(/class="([^"]*)"/g)].flatMap(([, value]) =>
      (value ?? "").split(/\s+/),
    );
    expect(classTokens.length).toBeGreaterThan(0);
    expect(classTokens.filter((token) => PHYSICAL_DIRECTION_CLASS.test(token))).toEqual([]);
  });
});
