// @vitest-environment jsdom
import { cleanup, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CostBreakdown } from "@/components/cost-breakdown";
import type { CostEstimate, CostLine, FactRef } from "@/domain/types";
import type { AppLocale } from "@/i18n/routing";
import { COST_CATEGORIES } from "@/lib/i18n/vocabulary";

import {
  catalogs,
  expectNoPhysicalDirection,
  LOCALES,
  OFFICIAL_WORD,
  reachableText,
  renderWithMessages,
  watchConsole,
} from "./trust-helpers";

const ARABIC_INDIC_DIGIT = /[٠-٩۰-۹]/u;

function ref(overrides: Partial<FactRef> = {}): FactRef {
  return {
    record: "cost-profiles/xx-test",
    path: "lines.housing",
    source_url: "https://example.org/xx-test-costs",
    last_verified_at: "2026-09-01",
    info_kind: "estimate",
    class: "stable",
    freshness: "fresh",
    ...overrides,
  };
}

function okLine(category: CostLine["category"], overrides: Partial<CostLine> = {}): CostLine {
  return {
    category,
    status: "ok",
    firstYear: { min: 300_000, max: 500_000, currency: "EUR" },
    per: "month",
    scope: "city",
    fact: ref({ basis: "cost-profiles/xx-test#lines.housing.basis" }),
    ...overrides,
  };
}

function missingLine(category: CostLine["category"]): CostLine {
  return { category, status: "missing", firstYear: null, per: null, scope: null, fact: null };
}

const COMPLETE: CostEstimate = {
  programSlug: "xx-test-prog-ok",
  lines: COST_CATEGORIES.map((category) => okLine(category)),
  totals: [{ min: 2_100_000, max: 3_500_000, currency: "EUR" }],
  complete: true,
  budgetFit: "unknown",
  academicYearMonths: 10,
};

const PARTIAL: CostEstimate = {
  ...COMPLETE,
  lines: COST_CATEGORIES.map((category) =>
    category === "insurance" || category === "setup" ? missingLine(category) : okLine(category),
  ),
  totals: [{ min: 1_500_000, max: 2_500_000, currency: "EUR" }],
  complete: false,
};

const EMPTY: CostEstimate = {
  ...COMPLETE,
  lines: COST_CATEGORIES.map(missingLine),
  totals: [],
  complete: false,
};

const MULTI: CostEstimate = {
  ...COMPLETE,
  totals: [
    { min: 2_000_000, max: 3_000_000, currency: "EUR" },
    { min: 500_000, max: 900_000, currency: "CHF" },
  ],
};

let consoleWatch: ReturnType<typeof watchConsole>;
beforeEach(() => {
  consoleWatch = watchConsole();
});
afterEach(() => {
  cleanup();
  consoleWatch.expectSilent();
  consoleWatch.restore();
});

function renderCost(
  cost: CostEstimate,
  locale: AppLocale,
  props: Partial<Parameters<typeof CostBreakdown>[0]> = {},
) {
  return renderWithMessages(
    <CostBreakdown cost={cost} budgetProvided={false} monthsLabel="10" {...props} />,
    locale,
  );
}

function rows(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[data-testid="cost-row"]')];
}

describe("CostBreakdown rows", () => {
  it.each([
    ["complete", COMPLETE],
    ["partial", PARTIAL],
    ["empty", EMPTY],
    ["multi-currency", MULTI],
  ] as const)("always renders the 7 rows in the fixed order (%s)", (_name, cost) => {
    for (const variant of ["full", "compact"] as const) {
      const { container } = renderCost(cost, "en", { variant });
      expect(rows(container).map((row) => row.dataset.category)).toEqual([...COST_CATEGORIES]);
      cleanup();
    }
  });

  it.each(LOCALES)("labels each row with its category in %s", (locale) => {
    const { container } = renderCost(COMPLETE, locale);
    const labels = catalogs[locale].domain.cost.category;
    rows(container).forEach((row, index) => {
      const category = COST_CATEGORIES[index];
      if (category === undefined) throw new Error("missing category");
      expect(row.textContent).toContain(labels[category]);
    });
  });

  it.each(LOCALES)("shows a missing line as text with no amount and no badge (%s)", (locale) => {
    const { container } = renderCost(PARTIAL, locale);
    const missing = rows(container).filter((row) => row.dataset.status === "missing");
    expect(missing.map((row) => row.dataset.category)).toEqual(["insurance", "setup"]);
    for (const row of missing) {
      expect(row.textContent).toContain(catalogs[locale].domain.cost.missingLine);
      expect(row.querySelector('[data-testid="cost-amount"]')).toBeNull();
      expect(row.querySelector('[data-slot="source-badge"]')).toBeNull();
      expect(row.querySelector("svg")).not.toBeNull();
      expect(row.textContent).not.toMatch(/[€$]|EUR/);
    }
  });

  it("keeps all seven rows as to-check lines when nothing is published", () => {
    const { container } = renderCost(EMPTY, "fr");
    expect(container.querySelectorAll('[data-testid="cost-missing"]')).toHaveLength(7);
    expect(container.querySelector('[data-testid="cost-total"]')).toBeNull();
    expect(container.querySelector('[data-slot="source-badge"]')).toBeNull();
  });

  it("treats an ok line without an amount as missing", () => {
    const broken: CostEstimate = {
      ...COMPLETE,
      lines: COMPLETE.lines.map((line) =>
        line.category === "food" ? { ...line, firstYear: null } : line,
      ),
    };
    const { container } = renderCost(broken, "en");
    const food = rows(container)[2];
    expect(food?.dataset.status).toBe("missing");
  });

  it.each(LOCALES)("shows each amount as a range with its own source badge (%s)", (locale) => {
    const { container } = renderCost(COMPLETE, locale);
    for (const row of rows(container)) {
      const amount = row.querySelector('[data-testid="cost-amount"]');
      expect(amount?.querySelectorAll("bdi")).toHaveLength(1);
      expect(amount?.textContent?.match(/\d[\d\s,.  ]*\d/g)).toHaveLength(2);
      expect(row.querySelector('[data-slot="source-badge"] [data-kind="estimate"]')).not.toBeNull();
    }
  });

  it.each(LOCALES)("keeps per and scope out of the amount element (%s)", (locale) => {
    const { container } = renderCost(COMPLETE, locale);
    const per = catalogs[locale].domain.cost.per.month;
    const scope = catalogs[locale].domain.cost.scope.city;
    for (const row of rows(container)) {
      const amount = row.querySelector('[data-testid="cost-amount"]');
      expect(amount?.textContent).not.toContain(per);
      expect(amount?.textContent).not.toMatch(/month|mois|شهر/);
      expect(amount?.textContent).not.toContain(scope);
      expect(row.textContent).toContain(per);
      expect(row.textContent).toContain(scope);
    }
  });

  it("shows no per label for one-time or unset lines and no scope when unset", () => {
    const cost: CostEstimate = {
      ...COMPLETE,
      lines: COMPLETE.lines.map((line) =>
        line.category === "setup" ? { ...line, per: "once", scope: null } : line,
      ),
    };
    const { container } = renderCost(cost, "en");
    const setup = rows(container).find((row) => row.dataset.category === "setup");
    expect(setup?.querySelectorAll("small")).toHaveLength(0);
  });

  it("marks housing and food, and only those, with the see-note marker tied to the note", () => {
    const { container } = renderCost(COMPLETE, "en");
    const note = container.querySelector("p[id$='-months-note']");
    expect(note).not.toBeNull();
    const marked = rows(container).filter(
      (row) => row.querySelector(`[aria-describedby="${note?.id}"]`) !== null,
    );
    expect(marked.map((row) => row.dataset.category)).toEqual(["housing", "food"]);
  });
});

describe("CostBreakdown money direction", () => {
  it.each(
    LOCALES,
  )("keeps the ends of every range in ascending order without bidi marks (%s)", (locale) => {
    const { container } = renderCost(COMPLETE, locale);
    const ranges = [
      ...container.querySelectorAll(
        '[data-testid="cost-amount"] bdi, [data-testid="cost-total"] bdi',
      ),
    ].filter((bdi) => /[0-9]/.test(bdi.textContent ?? ""));
    expect(ranges.length).toBeGreaterThan(0);
    for (const range of ranges) {
      const text = range.textContent ?? "";
      expect(range.getAttribute("dir")).toBe("ltr");
      expect(text).not.toMatch(/[\u200e\u200f\u061c]/u);
      const [low, high] = text.split("\u2013").map((end) => Number(end.replace(/[^0-9]/g, "")));
      expect(low, text).toBeLessThan(high ?? 0);
    }
  });
});

describe("CostBreakdown estimate wording", () => {
  it.each(LOCALES)("never words an estimate line as official (%s)", (locale) => {
    for (const variant of ["full", "compact"] as const) {
      const { container } = renderCost(PARTIAL, locale, {
        variant,
        textOf: () => ({ text: "Nos hypothèses de calcul", note: "none" }),
        budgetProvided: true,
      });
      expect(reachableText(container)).not.toMatch(OFFICIAL_WORD[locale]);
      cleanup();
    }
  });

  it("passes the basis text to the badge in the full variant only", () => {
    const textOf = (key: string) =>
      key === "cost-profiles/xx-test#lines.housing.basis"
        ? { text: "Median rents from the city page", note: "none" as const }
        : undefined;
    const full = renderCost(COMPLETE, "en", { variant: "full", textOf });
    expect(full.container.textContent).toContain("Median rents from the city page");
    expect(full.container.querySelectorAll("details summary").length).toBeGreaterThan(0);
    cleanup();
    const compact = renderCost(COMPLETE, "en", { variant: "compact", textOf });
    expect(compact.container.textContent).not.toContain("Median rents from the city page");
    cleanup();
    const noText = renderCost(COMPLETE, "en", { variant: "full" });
    expect(noText.container.textContent).not.toContain("How we estimated");
  });

  it("shows an official line with the official kind, not the estimate one", () => {
    const cost: CostEstimate = {
      ...COMPLETE,
      lines: COMPLETE.lines.map((line) =>
        line.category === "tuition"
          ? okLine("tuition", {
              fact: ref({ info_kind: "official" }),
              per: "year",
              scope: "program",
            })
          : line,
      ),
    };
    const { container } = renderCost(cost, "en");
    const tuition = rows(container)[0];
    expect(tuition?.querySelector('[data-kind="official"]')).not.toBeNull();
    expect(tuition?.querySelector('[data-kind="estimate"]')).toBeNull();
  });
});

describe("CostBreakdown total", () => {
  it.each(LOCALES)("shows the total as a range labelled as an estimate (%s)", (locale) => {
    const { container } = renderCost(COMPLETE, locale);
    const total = container.querySelector('[data-testid="cost-total"]');
    expect(total?.textContent).toContain(catalogs[locale].costBreakdown.total);
    expect(total?.textContent).toContain(catalogs[locale].domain.cost.estimateTag);
    expect(total?.textContent?.match(/\d[\d\s,.  ]*\d/g)).toHaveLength(2);
    expect(container.querySelector('[data-testid="cost-partial"]')).toBeNull();
  });

  it("shows one amount when the range has equal ends", () => {
    const cost: CostEstimate = {
      ...COMPLETE,
      totals: [{ min: 2_500_000, max: 2_500_000, currency: "EUR" }],
    };
    const { container } = renderCost(cost, "en");
    const total = container.querySelector('[data-testid="cost-total"]');
    expect(total?.textContent?.match(/25,000/g)).toHaveLength(1);
  });

  it.each(LOCALES)("says the total is partial when a line is missing (%s)", (locale) => {
    for (const variant of ["full", "compact"] as const) {
      const { container } = renderCost(PARTIAL, locale, { variant });
      expect(container.querySelector('[data-testid="cost-partial"]')?.textContent).toContain(
        catalogs[locale].domain.cost.partialTotal,
      );
      expect(container.querySelector('[data-testid="cost-total"]')).not.toBeNull();
      cleanup();
    }
  });

  it.each(
    LOCALES,
  )("shows only the missing wording, no total, when nothing is published (%s)", (locale) => {
    const full = renderCost(EMPTY, locale);
    expect(full.container.querySelector('[data-testid="cost-total"]')).toBeNull();
    expect(full.container.querySelector('[data-testid="cost-partial"]')).toBeNull();
    cleanup();
    const compact = renderCost(EMPTY, locale, { variant: "compact" });
    expect(compact.container.querySelector('[data-testid="cost-none"]')?.textContent).toContain(
      catalogs[locale].domain.cost.missingLine,
    );
    expect(compact.container.querySelector('[data-testid="cost-total"]')).toBeNull();
  });

  it("shows one total per currency, each labelled with its code in bdi", () => {
    const { container } = renderCost(MULTI, "en");
    const totals = [...container.querySelectorAll<HTMLElement>('[data-testid="cost-total"]')];
    expect(totals.map((total) => total.dataset.currency)).toEqual(["EUR", "CHF"]);
    for (const total of totals) {
      const code = [...total.querySelectorAll("bdi")].find(
        (bdi) => bdi.textContent === total.dataset.currency,
      );
      expect(code).toBeDefined();
    }
  });

  it("shows no currency code label for a single currency", () => {
    const { container } = renderCost(COMPLETE, "en");
    const total = container.querySelector<HTMLElement>('[data-testid="cost-total"]');
    expect(
      [...(total?.querySelectorAll("bdi") ?? [])].some((bdi) => bdi.textContent === "EUR"),
    ).toBe(false);
  });
});

describe("CostBreakdown note and budget", () => {
  it.each(LOCALES)("states the 10-month assumption with the given months string (%s)", (locale) => {
    for (const variant of ["full", "compact"] as const) {
      const { container } = renderCost(COMPLETE, locale, { variant, monthsLabel: "10" });
      const note = container.querySelector("p[id$='-months-note']");
      expect(note?.textContent).toBe(
        catalogs[locale].domain.cost.tenMonthNote.replace("{months}", "10"),
      );
      expect(container.textContent).not.toMatch(ARABIC_INDIC_DIGIT);
      cleanup();
    }
  });

  it("puts the note directly under the rows and totals in the full variant", () => {
    const { container } = renderCost(COMPLETE, "en");
    const section = container.querySelector("section");
    const children = [...(section?.children ?? [])].map((child) => child.tagName);
    expect(children).toEqual(["UL", "DIV", "P"]);
  });

  it.each(LOCALES)("shows the budget fit only when a budget was provided (%s)", (locale) => {
    const fits = catalogs[locale].domain.budgetFit;
    const without = renderCost({ ...COMPLETE, budgetFit: "above" }, locale);
    expect(without.container.textContent).not.toContain(fits.above);
    cleanup();
    for (const fit of ["within", "straddles", "above", "unknown"] as const) {
      const { container } = renderCost({ ...COMPLETE, budgetFit: fit }, locale, {
        budgetProvided: true,
      });
      expect(container.textContent).toContain(fits[fit]);
      cleanup();
    }
  });
});

describe("CostBreakdown variants", () => {
  it("full: the rows are visible, not inside a details element", () => {
    const { container } = renderCost(COMPLETE, "en", { variant: "full" });
    expect(rows(container)).toHaveLength(7);
    expect(rows(container).every((row) => row.closest("details") === null)).toBe(true);
  });

  it.each(
    LOCALES,
  )("compact: total and note first, the 7 lines inside a native details (%s)", (locale) => {
    const { container } = renderCost(COMPLETE, locale, { variant: "compact" });
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details?.hasAttribute("open")).toBe(false);
    expect(
      within(details as HTMLElement).getByText(catalogs[locale].costBreakdown.seeLines),
    ).toBeTruthy();
    expect(rows(container).every((row) => row.closest("details") === details)).toBe(true);
    expect(container.querySelector('[data-testid="cost-total"]')?.closest("details")).toBeNull();
    expect(container.querySelector("p[id$='-months-note']")?.closest("details")).toBeNull();
  });

  it.each(
    LOCALES,
  )("has no physical-direction classes and no Arabic-Indic digits (%s)", (locale) => {
    const { container } = renderCost(PARTIAL, locale, { budgetProvided: true, caption: "x" });
    expectNoPhysicalDirection(container);
    expect(container.textContent).not.toMatch(ARABIC_INDIC_DIGIT);
  });
});
