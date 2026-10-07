// @vitest-environment jsdom
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NumbeoLink } from "@/components/numbeo-link";
import type { CostEstimate, CostLine } from "@/domain/types";
import { COST_CATEGORIES } from "@/lib/i18n/vocabulary";

import {
  catalogs,
  expectNoPhysicalDirection,
  LOCALES,
  renderWithMessages,
  watchConsole,
} from "./trust-helpers";

const ARABIC_INDIC_DIGIT = /[٠-٩۰-۹]/u;
const CITY = { country: "DE", citySlug: "aachen", cityName: "Aachen" };
const COUNTRY = { country: "DE", citySlug: "xx-unverified", cityName: "Somewhere" };
const CITY_HREF = "https://www.numbeo.com/cost-of-living/in/Aachen";

function costWithout(...missing: CostLine["category"][]): CostEstimate {
  return {
    programSlug: "xx-test-prog-ok",
    lines: COST_CATEGORIES.map(
      (category): CostLine =>
        missing.includes(category)
          ? { category, status: "missing", firstYear: null, per: null, scope: null, fact: null }
          : {
              category,
              status: "ok",
              firstYear: { min: 300_000, max: 500_000, currency: "EUR" },
              per: "month",
              scope: "city",
              fact: {
                record: "cost-profiles/xx-test",
                path: `lines.${category}`,
                source_url: "https://example.org/xx-test-costs",
                last_verified_at: "2026-09-01",
                info_kind: "estimate",
                class: "stable",
                freshness: "fresh",
              },
            },
    ),
    totals: [],
    complete: false,
    budgetFit: "unknown",
    academicYearMonths: 10,
  };
}

let consoleWatch: ReturnType<typeof watchConsole>;
beforeEach(() => {
  consoleWatch = watchConsole();
});
afterEach(() => {
  cleanup();
  consoleWatch.expectSilent();
  consoleWatch.restore();
});

function anchor(container: HTMLElement): HTMLAnchorElement | null {
  return container.querySelector<HTMLAnchorElement>('a[href*="numbeo.com"]');
}

describe("NumbeoLink", () => {
  it.each([
    ["housing"],
    ["food"],
    ["transport"],
  ] as const)("is shown when %s is missing, opening safely in a new tab", (category) => {
    const { container } = renderWithMessages(
      <NumbeoLink cost={costWithout(category)} place={CITY} />,
      "en",
    );
    const link = anchor(container);
    expect(link?.getAttribute("href")).toBe(CITY_HREF);
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("is absent when housing, food and transport are all present", () => {
    const { container } = renderWithMessages(
      <NumbeoLink cost={costWithout("insurance", "setup")} place={CITY} />,
      "en",
    );
    expect(container.querySelector('[data-testid="numbeo-link"]')).toBeNull();
  });

  it("is absent for a country it has no page for", () => {
    const { container } = renderWithMessages(
      <NumbeoLink
        cost={costWithout("housing")}
        place={{ country: "XX", citySlug: "x", cityName: "X" }}
      />,
      "en",
    );
    expect(container.querySelector('[data-testid="numbeo-link"]')).toBeNull();
  });

  it.each(LOCALES)("says the site is external, crowdsourced and not official (%s)", (locale) => {
    const { container } = renderWithMessages(
      <NumbeoLink cost={costWithout("housing")} place={CITY} />,
      locale,
    );
    const block = container.querySelector<HTMLElement>('[data-testid="numbeo-link"]');
    expect(block?.textContent).toContain("Numbeo");
    expect(block?.textContent).toContain(catalogs[locale].costBreakdown.numbeoNote);
    expect(block?.textContent).toContain("Aachen");
    expect(block?.textContent).not.toMatch(ARABIC_INDIC_DIGIT);
    expect(block?.querySelector('[data-slot="source-badge"]')).toBeNull();
    expectNoPhysicalDirection(container);
  });

  it("names the country for a country page", () => {
    const { container } = renderWithMessages(
      <NumbeoLink cost={costWithout("food")} place={COUNTRY} />,
      "fr",
    );
    const link = anchor(container);
    expect(link?.getAttribute("href")).toBe(
      "https://www.numbeo.com/cost-of-living/country_result.jsp?country=Germany",
    );
    expect(link?.textContent).toContain("Allemagne");
    expect(link?.textContent).not.toContain("Somewhere");
  });
});
