// @vitest-environment jsdom
import { cleanup, render, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ScholarshipsSection } from "@/components/program/program-sections";
import type { AppLocale } from "@/i18n/routing";
import {
  loadProgramPageData,
  type ProgramPageData,
  type RouteGuidanceNote,
} from "@/lib/snapshot/server";

import { E2E_SLUGS } from "../../fixtures/e2e/profiles";
import { IntlWrapper } from "../intl";
import { catalogs, expectNoPhysicalDirection, LOCALES, watchConsole } from "../trust-helpers";
import { buildFixtureSnapshot, removeFixtureSnapshots } from "./program-fixture";

let dir = "";
beforeAll(() => {
  dir = buildFixtureSnapshot();
}, 180_000);
afterAll(removeFixtureSnapshots);

let consoleWatch: ReturnType<typeof watchConsole>;
beforeEach(() => {
  consoleWatch = watchConsole();
});
afterEach(() => {
  cleanup();
  consoleWatch.expectSilent();
  consoleWatch.restore();
});

const note = (origin: string, id: string): RouteGuidanceNote => ({
  route: `xx-test-route-${origin.toLowerCase()}-xb`,
  origin,
  id,
  note: `admission-routes/xx-test-route-${origin.toLowerCase()}-xb#guidance.${id}.note`,
  fact: {
    source_url: "https://example.org/aid",
    info_kind: "guidance",
    last_verified_at: "2026-09-02",
    class: "stable",
  },
});

async function withGuidance(
  notes: RouteGuidanceNote[],
  locale: AppLocale,
  scholarships = true,
): Promise<ProgramPageData> {
  const data = await loadProgramPageData(E2E_SLUGS.ok, locale, dir);
  if (data === null) throw new Error("no data");
  return {
    ...data,
    scholarships: scholarships ? data.scholarships : [],
    routeGuidance: notes,
    text: (key) =>
      key.includes("#guidance.")
        ? { text: `Note ${key.split("#guidance.")[1]}`, note: "none" }
        : data.text(key),
  };
}

function renderSection(data: ProgramPageData, locale: AppLocale) {
  return render(
    <IntlWrapper locale={locale} withMessages>
      <ScholarshipsSection data={data} />
    </IntlWrapper>,
  );
}

describe("ScholarshipsSection route guidance", () => {
  it.each(
    LOCALES,
  )("shows the aid guidance with its heading, notes and a guidance badge in %s", async (locale) => {
    const data = await withGuidance([note("XA", "xx-test-aid")], locale);
    const { container, getByRole } = renderSection(data, locale);
    const heading = getByRole("heading", {
      name: catalogs[locale].program.scholarships.aid.heading,
    });
    expect(heading.tagName).toBe("H3");
    const block = container.querySelector('[data-testid="route-guidance"]');
    if (!(block instanceof HTMLElement)) throw new Error("no guidance block");
    expect(block.textContent).toContain(catalogs[locale].program.scholarships.aid.intro);
    expect(within(block).getAllByTestId("route-guidance-note")).toHaveLength(1);
    expect(block.textContent).toContain("Note xx-test-aid.note");
    expect(within(block).getByTestId("source-kind-icon-guidance")).toBeTruthy();
    expect(within(block).queryByTestId("source-kind-icon-official")).toBeNull();
    expectNoPhysicalDirection(container);
  });

  it("renders nothing about aid when no route carries guidance", async () => {
    const data = await withGuidance([], "fr");
    const { container, queryByRole } = renderSection(data, "fr");
    expect(container.querySelector('[data-testid="route-guidance"]')).toBeNull();
    expect(
      queryByRole("heading", { name: catalogs.fr.program.scholarships.aid.heading }),
    ).toBeNull();
  });

  it("shows the guidance even when no scholarship is listed", async () => {
    const data = await withGuidance([note("XA", "xx-test-aid")], "en", false);
    const { container } = renderSection(data, "en");
    expect(container.textContent).toContain(catalogs.en.program.scholarships.none);
    expect(container.querySelector('[data-testid="route-guidance"]')).not.toBeNull();
  });

  it("names the origin of each group only when guidance comes from several origins", async () => {
    const one = await withGuidance([note("XA", "xx-test-aid")], "en");
    expect(
      renderSection(one, "en").container.querySelector('[data-testid="route-guidance-origin"]'),
    ).toBeNull();
    cleanup();
    const two = await withGuidance([note("XA", "xx-test-aid"), note("XC", "xx-test-aid")], "en");
    const { container } = renderSection(two, "en");
    expect(container.querySelectorAll('[data-testid="route-guidance-origin"]')).toHaveLength(2);
  });
});
