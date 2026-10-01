// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NavLinks } from "@/components/nav-links";

import { renderIntl, shellProps } from "./intl";

const navigation = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("@/i18n/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/i18n/navigation")>()),
  usePathname: () => navigation.pathname,
}));

afterEach(() => {
  cleanup();
  navigation.pathname = "/";
});

describe("NavLinks", () => {
  it("marks the current page and only the current page", () => {
    navigation.pathname = "/matches";
    renderIntl(<NavLinks {...shellProps("fr").nav} />, "fr");
    const matches = screen.getByRole("link", { name: "Mes résultats" });
    const profile = screen.getByRole("link", { name: "Mon profil" });
    expect(matches.getAttribute("aria-current")).toBe("page");
    expect(profile.getAttribute("aria-current")).toBeNull();
    expect(matches.getAttribute("href")).toBe("/fr/matches");
  });

  it("keeps a nested page marked as current", () => {
    navigation.pathname = "/profile/review";
    renderIntl(<NavLinks {...shellProps("en").nav} />, "en");
    expect(screen.getByRole("link", { name: "My profile" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("marks nothing on the home page", () => {
    renderIntl(<NavLinks {...shellProps("fr").nav} />, "fr");
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("aria-current")).toBeNull();
    }
  });

  it("renders Arabic labels under dir=rtl", () => {
    navigation.pathname = "/profile";
    renderIntl(<NavLinks {...shellProps("ar").nav} />, "ar");
    expect(screen.getByTestId("dir-root").getAttribute("dir")).toBe("rtl");
    expect(screen.getByRole("link", { name: "ملفي" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "نتائجي" }).getAttribute("href")).toBe("/ar/matches");
  });
});
