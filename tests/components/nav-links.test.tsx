// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NavLinks } from "@/components/nav-links";
import { SAVED_KEY } from "@/lib/saved/saved";

import { renderIntl, shellProps } from "./intl";

const navigation = vi.hoisted(() => ({ pathname: "/" }));

// The wrapped Link keeps the locale-prefixed href and exposes `prefetch={false}` in the DOM.
vi.mock("@/i18n/navigation", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/i18n/navigation")>();
  const { createElement } = await import("react");
  const OriginalLink = original.Link;
  const Link = (props: ComponentProps<typeof OriginalLink>) =>
    createElement(OriginalLink, {
      ...props,
      "data-prefetch": props.prefetch === false ? "false" : undefined,
    } as ComponentProps<typeof OriginalLink>);
  return { ...original, Link, usePathname: () => navigation.pathname };
});

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  navigation.pathname = "/";
});

function seedSaved(count: number) {
  const items = Array.from({ length: count }, (_, index) => ({
    slug: `xx-saved-${index}`,
    country: "FR",
    field: "engineering",
    snapshotVersion: "0123456789ab",
    savedAt: "2026-01-01",
  }));
  window.localStorage.setItem(SAVED_KEY, JSON.stringify({ schemaVersion: 1, items }));
}

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

  it("renders the Scholarships item and marks it current", () => {
    navigation.pathname = "/scholarships";
    renderIntl(<NavLinks {...shellProps("fr").nav} />, "fr");
    const link = screen.getByRole("link", { name: "Bourses" });
    expect(link.getAttribute("href")).toBe("/fr/scholarships");
    expect(link.getAttribute("aria-current")).toBe("page");
  });

  it("never prefetches the Scholarships page", () => {
    renderIntl(<NavLinks {...shellProps("fr").nav} />, "fr");
    expect(screen.getByRole("link", { name: "Bourses" }).getAttribute("data-prefetch")).toBe(
      "false",
    );
    cleanup();
    seedSaved(2);
    renderIntl(<NavLinks {...shellProps("fr").nav} />, "fr");
    expect(screen.getByRole("link", { name: "Bourses" }).getAttribute("data-prefetch")).toBe(
      "false",
    );
  });

  it("prefetches the plan only once a program is saved", () => {
    renderIntl(<NavLinks {...shellProps("en").nav} />, "en");
    expect(screen.getByRole("link", { name: "My plan" }).getAttribute("data-prefetch")).toBe(
      "false",
    );
    cleanup();
    seedSaved(2);
    renderIntl(<NavLinks {...shellProps("en").nav} />, "en");
    expect(
      screen.getByRole("link", { name: "My plan 2 saved" }).getAttribute("data-prefetch"),
    ).toBeNull();
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

  it("shows the number of saved programs on My plan, with a screen-reader sentence", () => {
    seedSaved(2);
    renderIntl(<NavLinks {...shellProps("en").nav} />, "en");
    const plan = screen.getByRole("link", { name: "My plan 2 saved" });
    expect(plan.getAttribute("href")).toBe("/en/plan");
    expect(plan.querySelector('[aria-hidden="true"]')?.textContent).toBe("2");
    expect(within(plan).getByText("2 saved").className).toContain("sr-only");
  });

  it("shows no badge when nothing is saved", () => {
    renderIntl(<NavLinks {...shellProps("fr").nav} />, "fr");
    const plan = screen.getByRole("link", { name: "Mon plan" });
    expect(plan.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(plan.textContent).toBe("Mon plan");
  });

  it("keeps Latin digits in the Arabic badge", () => {
    seedSaved(2);
    renderIntl(<NavLinks {...shellProps("ar").nav} />, "ar");
    const plan = screen.getByRole("link", { name: /خطتي/ });
    expect(plan.querySelector('[aria-hidden="true"]')?.textContent).toBe("2");
    expect(plan.textContent).not.toMatch(/[٠-٩۰-۹]/u);
  });
  it.each([
    "fr",
    "en",
    "ar",
  ] as const)("never wraps a label and keeps phone padding compact in %s, with the badge shown", (locale) => {
    seedSaved(2);
    renderIntl(<NavLinks {...shellProps(locale).nav} />, locale);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(4);
    for (const link of links) {
      expect(link.className).toContain("whitespace-nowrap");
      expect(link.className).toContain("min-h-12");
      // 8px on phone, 12px from md.
      expect(link.className).toContain("px-2");
      expect(link.className).toContain("md:px-3");
    }
    // Four French or English labels plus the badge do not fit one row in 343px (measured on the dev
    // server): the list wraps to a second row instead of scrolling the page sideways.
    const list = links[0]?.closest("ul");
    expect(list?.className).toContain("flex-wrap");
    // The list is pulled back by the phone padding so the first label lines up with the wordmark.
    expect(list?.className).toContain("-ms-2");
    const badge = links[3]?.querySelector('[aria-hidden="true"]');
    expect(badge?.className).toContain("ms-1.5");
    expect(badge?.className).toContain("px-1.5");
  });
});
