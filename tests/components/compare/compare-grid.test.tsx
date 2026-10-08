// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { CompareGrid, DifferencesSwitch } from "@/components/compare/compare-grid";
import type { AppLocale } from "@/i18n/routing";
import { formatTuition } from "@/lib/format";
import { COMPARE_ROWS, type CompareProgram, type CompareView } from "@/lib/journey/compare-view";
import { expectNoPhysicalDirection, LOCALES } from "../trust-helpers";
import { CompareProviders, catalogs, compareView, REFS, withFixtureClient } from "./helpers";

const fixture = withFixtureClient();

afterEach(cleanup);

function t(locale: AppLocale, namespace: string, key: string): string {
  const translate = createTranslator({
    locale,
    messages: catalogs[locale],
    namespace: namespace as never,
  }) as unknown as (key: string) => string;
  return translate(key);
}

const SAVED = [REFS.ok, REFS.stale, REFS.fail, REFS.foundation];
const SLUGS = SAVED.map((ref) => ref.slug);

const views = {} as Record<AppLocale, CompareView>;
// Two programs that agree on language, deadline and scholarships.
const pairs = {} as Record<AppLocale, CompareView>;
beforeAll(async () => {
  for (const locale of LOCALES) {
    views[locale] = await compareView(fixture.client(), locale, SAVED, SLUGS);
    pairs[locale] = await compareView(fixture.client(), locale, SAVED, [
      REFS.ok.slug,
      REFS.fail.slug,
    ]);
  }
});

function program(view: CompareView, slug: string): CompareProgram {
  const found = view.programs.find((p) => p.slug === slug);
  if (found === undefined) throw new Error(`the fixture view has no ${slug}`);
  return found;
}

function renderGrid(
  locale: AppLocale,
  view: CompareView,
  onlyDifferences = false,
  budgetProvided = false,
) {
  return render(
    <CompareProviders locale={locale}>
      <CompareGrid view={view} onlyDifferences={onlyDifferences} budgetProvided={budgetProvided} />
    </CompareProviders>,
  );
}

function row(container: HTMLElement, id: string): HTMLElement {
  const section = container.querySelector<HTMLElement>(`section[data-row="${id}"]`);
  if (section === null) throw new Error(`no ${id} row`);
  return section;
}

function cell(container: HTMLElement, id: string, slug: string): HTMLElement {
  const li = row(container, id).querySelector<HTMLElement>(`li[data-slug="${slug}"]`);
  if (li === null) throw new Error(`no ${id} cell for ${slug}`);
  return li;
}

function badges(scope: HTMLElement): number {
  return scope.querySelectorAll('[data-slot="source-badge"]').length;
}

describe.each(LOCALES)("CompareGrid (%s)", (locale) => {
  it("has a header of program names linking to the program pages, then one section per row", () => {
    const view = views[locale];
    const { container } = renderGrid(locale, view);
    for (const p of view.programs) {
      const link = screen.getByRole("link", { name: p.name });
      expect(link.getAttribute("href")).toBe(`/${locale}/programs/${p.slug}`);
    }
    const sections = container.querySelectorAll("section[aria-labelledby]");
    expect(sections).toHaveLength(COMPARE_ROWS.length);
    expect([...sections].map((s) => s.getAttribute("data-row"))).toEqual([...COMPARE_ROWS]);
    for (const section of sections) {
      const heading = section.querySelector("h2");
      expect(heading?.id).toBe(section.getAttribute("aria-labelledby"));
      expect(section.querySelectorAll(":scope > ul > li")).toHaveLength(view.programs.length);
    }
    // Headings strictly nested: no h1 here and nothing below h2.
    expect(container.querySelector("h1,h3,h4")).toBeNull();
    expectNoPhysicalDirection(container);
  });

  it("labels each cell with its program (visible on a phone, screen-reader only from md)", () => {
    const view = views[locale];
    const { container } = renderGrid(locale, view);
    for (const id of COMPARE_ROWS) {
      for (const p of view.programs) {
        const label = cell(container, id, p.slug).querySelector("[data-slot='cell-label']");
        expect(label?.textContent).toBe(p.name);
        expect(label?.className).toContain("md:sr-only");
        expect(label?.querySelector("bdi")?.textContent).toBe(p.name);
      }
    }
  });

  it("uses a grid with one column per program from md, with logical utilities only", () => {
    const view = views[locale];
    const { container } = renderGrid(locale, view);
    const list = row(container, "tuition").querySelector(":scope > ul");
    expect(list?.className).toContain("md:grid-cols-4");
    expect(container.querySelector("[data-slot='compare-heads']")?.className).toContain(
      "md:grid-cols-4",
    );
  });

  it("marks the differing rows with an icon and text, whether or not the switch is on", () => {
    const view = views[locale];
    const marker = t(locale, "compare.differences", "marker");
    const { container } = renderGrid(locale, view);
    for (const id of COMPARE_ROWS) {
      const heading = row(container, id).querySelector("h2");
      const mark = row(container, id).querySelector("[data-slot='differs-marker']");
      expect(mark !== null, id).toBe(view.differs[id]);
      if (mark !== null) {
        expect(mark.textContent).toContain(marker);
        expect(mark.querySelector("svg")).not.toBeNull();
        expect(heading?.contains(mark)).toBe(false);
      }
    }
  });

  it("shows only the rows that differ when the switch is on", () => {
    const view = pairs[locale];
    const { container } = renderGrid(locale, view, true);
    const shown = [...container.querySelectorAll("section[data-row]")].map((s) =>
      s.getAttribute("data-row"),
    );
    expect(shown).toEqual(COMPARE_ROWS.filter((id) => view.differs[id]));
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThan(COMPARE_ROWS.length);
  });

  it("says the programs are the same when nothing differs and the switch is on", () => {
    const view = views[locale];
    const same: CompareView = {
      ...view,
      differs: Object.fromEntries(COMPARE_ROWS.map((id) => [id, false])) as CompareView["differs"],
    };
    const { container } = renderGrid(locale, same, true);
    expect(container.querySelector("section[data-row]")).toBeNull();
    expect(screen.getByText(t(locale, "compare.differences", "allSame"))).toBeTruthy();
  });

  it("keeps a row whose values are unknown (they never count as the same)", () => {
    const view = views[locale];
    const unknownTuition = {
      ...view,
      programs: view.programs.map((p) => ({ ...p, tuition: { ...p.tuition, value: null } })),
      differs: { ...view.differs, tuition: true },
    };
    const { container } = renderGrid(locale, unknownTuition, true);
    expect(row(container, "tuition")).toBeTruthy();
    expect(badges(row(container, "tuition"))).toBe(0);
    const line = catalogs[locale].domain.cost.missingLine;
    expect(row(container, "tuition").textContent?.split(line).length).toBe(
      view.programs.length + 1,
    );
  });

  it("shows tuition with one source badge, or the to-check line and no badge", () => {
    const view = views[locale];
    const { container } = renderGrid(locale, view);
    for (const p of view.programs) {
      const scope = cell(container, "tuition", p.slug);
      if (p.tuition.value === null) {
        expect(badges(scope)).toBe(0);
        expect(scope.textContent).toContain(catalogs[locale].domain.cost.missingLine);
      } else {
        expect(badges(scope)).toBe(1);
        expect(scope.textContent).toContain(
          catalogs[locale].domain.cost.per[p.tuition.value.period],
        );
      }
    }
  });

  it("shows an official fee range with its income note in the compare cell", () => {
    const range = {
      amountMinor: 120000,
      maxAmountMinor: 300000,
      currency: "XTS",
      period: "year" as const,
      basis: "income_based" as const,
    };
    const view = views[locale];
    const ranged: CompareView = {
      ...view,
      programs: view.programs.map((p) =>
        p.slug === REFS.ok.slug ? { ...p, tuition: { ...p.tuition, value: range } } : p,
      ),
    };
    const { container } = renderGrid(locale, ranged);
    const scope = cell(container, "tuition", REFS.ok.slug);
    // The cell label is a <p><bdi>; the amount sits in the cell's wrapper <div>.
    expect(scope.querySelector(":scope > div bdi")?.textContent).toBe(formatTuition(range, locale));
    expect(scope.textContent).toContain(catalogs[locale].domain.cost.incomeBased);
    expect(badges(scope)).toBe(1);
  });

  it("shows the cost as a ranged, tagged estimate with the ten-month note, never as best or cheapest", () => {
    const view = views[locale];
    const { container } = renderGrid(locale, view);
    for (const p of view.programs) {
      const scope = cell(container, "cost", p.slug);
      expect(scope.querySelector("[data-slot='cost-breakdown']")).not.toBeNull();
      if (p.cost.totals.length > 0) {
        expect(scope.textContent).toContain(catalogs[locale].domain.cost.estimateTag);
      }
      if (!p.cost.complete) {
        expect(scope.textContent).toContain(catalogs[locale].domain.cost.partialTotal);
      }
    }
    expect(container.textContent).not.toMatch(/\b(best|cheapest|meilleur|moins cher)\b|الأرخص/iu);
  });

  it("shows the match group only through the shared badge and never green for a stale program", () => {
    const view = views[locale];
    const { container } = renderGrid(locale, view);
    for (const p of view.programs) {
      const badge = cell(container, "result", p.slug).querySelector("[data-group]");
      expect(badge?.getAttribute("data-group")).toBe(p.group);
    }
    const stale = program(view, REFS.stale.slug);
    expect(stale.group).not.toBe("ok");
    expect(cell(container, "result", stale.slug).querySelector('[data-group="ok"]')).toBeNull();
  });

  it("folds the reasons behind a disclosure with their sources grouped", () => {
    const view = views[locale];
    const { container } = renderGrid(locale, view);
    const scope = cell(container, "result", REFS.ok.slug);
    const details = scope.querySelector("details");
    expect(details?.open).toBe(false);
    expect(details?.querySelector("[data-slot='reason-list']")).not.toBeNull();
    const reasons = program(view, REFS.ok.slug).reasons.length;
    expect(details?.querySelectorAll("[data-code]")).toHaveLength(reasons);
  });

  it("shows the deadline with DD/MM/YYYY and Latin digits", () => {
    const view = views[locale];
    const { container } = renderGrid(locale, view);
    expect(container.textContent).not.toMatch(/[٠-٩۰-۹]/u);
    const upcoming = view.programs.find((p) => p.intake.kind === "upcoming");
    if (upcoming === undefined) throw new Error("fixture needs an upcoming deadline");
    const scope = cell(container, "deadline", upcoming.slug);
    expect(scope.querySelector("time")?.textContent).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it("shows the teaching language with its badge, or the unknown line without one", () => {
    const view = views[locale];
    const { container } = renderGrid(locale, view);
    for (const p of view.programs) {
      const scope = cell(container, "language", p.slug);
      expect(badges(scope)).toBe(p.teachingLanguages.value === null ? 0 : 1);
    }
    const unknown = {
      ...view,
      programs: view.programs.map((p) => ({
        ...p,
        teachingLanguages: { ...p.teachingLanguages, value: null },
      })),
    };
    cleanup();
    const again = renderGrid(locale, unknown);
    const line = t(locale, "compare.cells", "languageUnknown");
    for (const p of unknown.programs) {
      const scope = cell(again.container, "language", p.slug);
      expect(scope.textContent).toContain(line);
      expect(badges(scope)).toBe(0);
    }
  });

  it("lists scholarships as links to the program page anchor, with the caveat once", () => {
    const view = views[locale];
    const { container } = renderGrid(locale, view);
    const caveat = t(locale, "compare.scholarships", "caveat");
    expect(container.textContent?.split(caveat).length).toBe(2);
    const none = t(locale, "compare.scholarships", "none");
    for (const p of view.programs) {
      const scope = cell(container, "scholarships", p.slug);
      if (p.scholarships.length === 0) {
        expect(scope.textContent).toContain(none);
      } else {
        for (const s of p.scholarships) {
          const link = within(scope).getByRole("link", { name: new RegExp(s.name) });
          expect(link.getAttribute("href")).toBe(
            `/${locale}/programs/${p.slug}#scholarship-${s.slug}`,
          );
        }
      }
    }
  });

  it("shows the application channel with its source and an official link, or says it is unknown", () => {
    const view = views[locale];
    const { container } = renderGrid(locale, view);
    for (const p of view.programs) {
      const scope = cell(container, "application", p.slug);
      if (p.channel === null) {
        expect(scope.textContent).toContain(t(locale, "compare.application", "channelUnknown"));
      } else {
        expect(scope.textContent).toContain(p.channel.name);
        const link = [...scope.querySelectorAll("a")].find(
          (a) => a.getAttribute("href") === p.channel?.url,
        );
        expect(link?.getAttribute("rel")).toContain("noopener");
      }
    }
    const missing = {
      ...view,
      programs: view.programs.map((p) => ({
        ...p,
        channel: null,
        channelFact: null,
        documents: null,
      })),
    };
    cleanup();
    const again = renderGrid(locale, missing);
    for (const p of missing.programs) {
      const scope = cell(again.container, "application", p.slug);
      expect(scope.textContent).toContain(t(locale, "compare.application", "channelUnknown"));
      expect(scope.textContent).toContain(t(locale, "compare.application", "documentsUnknown"));
      expect(badges(scope)).toBe(0);
    }
  });

  it("lists documents with their translation line and one badge for the list", () => {
    const view = views[locale];
    const { container } = renderGrid(locale, view);
    const withDocuments = view.programs.find((p) => (p.documents?.length ?? 0) > 0);
    if (withDocuments === undefined) throw new Error("fixture needs a program with documents");
    const scope = cell(container, "application", withDocuments.slug);
    expect(scope.querySelectorAll("[data-slot='documents'] > li")).toHaveLength(
      withDocuments.documents?.length ?? 0,
    );
    expect(scope.textContent).toMatch(
      new RegExp(
        [
          t(locale, "compare.application.translation", "yes"),
          t(locale, "compare.application.translation", "no"),
          t(locale, "compare.application.translation", "unknown"),
        ]
          .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          .join("|"),
      ),
    );
  });
});

describe("DifferencesSwitch", () => {
  it.each(LOCALES)("is a native checkbox with a constant label (%s)", (locale) => {
    let value = false;
    const { container, rerender } = render(
      <CompareProviders locale={locale}>
        <DifferencesSwitch checked={value} onChange={(next) => (value = next)} />
      </CompareProviders>,
    );
    const box = screen.getByRole<HTMLInputElement>("checkbox", {
      name: t(locale, "compare.differences", "label"),
    });
    expect(box.checked).toBe(false);
    expect(box.hasAttribute("aria-pressed")).toBe(false);
    box.click();
    expect(value).toBe(true);
    rerender(
      <CompareProviders locale={locale}>
        <DifferencesSwitch checked={true} onChange={() => {}} />
      </CompareProviders>,
    );
    expect(
      screen.getByRole<HTMLInputElement>("checkbox", {
        name: t(locale, "compare.differences", "label"),
      }).checked,
    ).toBe(true);
    expect(container.querySelector("label")?.className).toMatch(/min-h-1[12]/);
  });
});
