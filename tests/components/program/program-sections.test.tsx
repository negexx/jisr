// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { DeadlineSection } from "@/components/program/program-sections";
import type { Intake } from "@/data-schema/records/program";
import type { AppLocale } from "@/i18n/routing";
import { loadProgramPageData, type ProgramPageData } from "@/lib/snapshot/server";

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

async function withIntakes(
  intakes: Intake[],
  locale: AppLocale,
  slug: string = E2E_SLUGS.ok,
): Promise<ProgramPageData> {
  const data = await loadProgramPageData(slug, locale, dir);
  if (data === null) throw new Error(`no data for ${slug}`);
  return {
    ...data,
    program: { ...data.program, intakes: { ...data.program.intakes, value: intakes } },
  };
}

const recurringOnly = (month: number, day: number): Intake => ({
  startDate: null,
  applicationOpens: null,
  applicationDeadline: null,
  recurringDeadline: { month, day },
});

function renderSection(data: ProgramPageData, locale: AppLocale) {
  return render(
    <IntlWrapper locale={locale} withMessages>
      <DeadlineSection data={data} />
    </IntlWrapper>,
  );
}

describe("DeadlineSection", () => {
  it.each(
    LOCALES,
  )("shows a recurring deadline as usual guidance, not as a date, in %s", async (locale) => {
    const data = await withIntakes([recurringOnly(7, 15)], locale);
    const { container } = renderSection(data, locale);
    const text = container.textContent ?? "";
    expect(text).toContain(catalogs[locale].program.deadline.recurring.replace("{date}", "15/07"));
    expect(text).not.toContain(catalogs[locale].program.deadline.deadlineUnknown);
    // no year is published, so no ISO date and no <time> for the deadline line
    expect(container.querySelector("li time")).toBeNull();
    expectNoPhysicalDirection(container);
  });

  it("keeps the dated deadline line unchanged for a dated intake", async () => {
    const data = await withIntakes(
      [
        {
          startDate: "2027-09-01",
          applicationOpens: "2026-11-01",
          applicationDeadline: "2027-01-15",
        },
      ],
      "en",
    );
    const { container } = renderSection(data, "en");
    const text = container.textContent ?? "";
    expect(text).toContain(catalogs.en.program.deadline.deadline.replace("{date}", "15/01/2027"));
    expect(text).not.toContain(catalogs.en.program.deadline.recurring.split("{")[0] ?? "");
  });

  it("lists two recurring-only intakes without a duplicate-key warning", async () => {
    const data = await withIntakes([recurringOnly(7, 15), recurringOnly(1, 31)], "en");
    const { container } = renderSection(data, "en");
    const items = [...container.querySelectorAll('[data-testid="intake"]')];
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain("15/07");
    expect(items[1]?.textContent).toContain("31/01");
    // watchConsole().expectSilent() in afterEach fails on React's "same key" error
  });
});
