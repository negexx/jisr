// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CompareGrid } from "@/components/compare/compare-grid";
import { CostBreakdown } from "@/components/cost-breakdown";
import { HeroDemo } from "@/components/home/hero-demo";
import { MatchCard } from "@/components/match-card";
import { Fact } from "@/components/mdx/fact";
import { StepRow } from "@/components/plan/step-row";
import {
  CostsSection,
  DeadlineSection,
  DocumentsSection,
  OverviewSection,
  ProcedureSection,
  RequirementsSection,
  ScholarshipsSection,
  TuitionSection,
} from "@/components/program/program-sections";
import { ReasonList } from "@/components/reason-list";
import { ReportProvider } from "@/components/report-outdated/report-context";
import { ScholarshipsPageView } from "@/components/scholarships/scholarships-page-view";
import { SourceBadge } from "@/components/source-badge";
import type { CoreShard } from "@/data-schema/snapshot";
import { estimateCost } from "@/domain/costs";
import type { AppLocale } from "@/i18n/routing";
import { setSessionHint } from "@/lib/auth/session-hint";
import { FeedbackInputSchema } from "@/lib/server/account-inputs";
import { loadProgramPageData, type ProgramPageData } from "@/lib/snapshot/server";
import { fact, scholarship } from "../fixtures/domain/builders";
import { E2E_NOW, E2E_SLUGS } from "../fixtures/e2e/profiles";
import { CompareProviders, compareView, REFS, withFixtureClient } from "./compare/helpers";
import { type JourneyFixture, loadJourneyFixture } from "./journey-fixture";
import { PlanProviders, PROGRAMS, planEntries } from "./plan/helpers";
import { buildFixtureSnapshot, removeFixtureSnapshots } from "./program/program-fixture";
import { catalogs, LOCALES, renderWithMessages } from "./trust-helpers";

const mocks = vi.hoisted(() => ({
  push: vi.fn<(href: string) => void>(),
  prefetch: vi.fn<(href: string) => void>(),
  createFeedbackReport: vi.fn<(input: unknown) => Promise<unknown>>(),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: mocks.push, prefetch: mocks.prefetch }),
}));
vi.mock("@/lib/server/account-actions", () => ({
  createFeedbackReport: mocks.createFeedbackReport,
}));

const VERSION = "0123456789ab";
const BUTTON = '[data-slot="report-outdated"]';
const BADGE = '[data-slot="source-badge"]';
const fetchSpy = vi.fn<typeof fetch>();

let journey: JourneyFixture;
let programDir = "";
const fixture = withFixtureClient();

beforeAll(() => {
  journey = loadJourneyFixture();
  programDir = buildFixtureSnapshot();
}, 180_000);
afterAll(removeFixtureSnapshots);

beforeEach(() => {
  window.localStorage.clear();
  mocks.push.mockReset();
  mocks.prefetch.mockReset();
  mocks.createFeedbackReport.mockReset();
  mocks.createFeedbackReport.mockResolvedValue({ ok: true, value: undefined });
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
  window.history.pushState({}, "", "/fr/matches");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

function Reporting({ locale, children }: { locale: AppLocale; children: ReactElement }) {
  return (
    <ReportProvider
      copy={catalogs[locale].reportOutdated}
      locale={locale}
      snapshotVersion={VERSION}
    >
      {children}
    </ReportProvider>
  );
}

function counts(root: HTMLElement) {
  return {
    badges: root.querySelectorAll(BADGE).length,
    buttons: root.querySelectorAll(BUTTON).length,
  };
}

async function programData(locale: AppLocale): Promise<ProgramPageData> {
  const data = await loadProgramPageData(E2E_SLUGS.ok, locale, programDir);
  if (data === null) throw new Error("no program data");
  return data;
}

// One entry per journey surface. Each renders the shared trust components exactly as the page does,
// inside a provider that offers reporting, the way ReportOutdatedEntry mounts it while accounts are on.
type Surface = { name: string; render: (locale: AppLocale) => Promise<{ container: HTMLElement }> };

const SURFACES: Surface[] = [
  {
    name: "program page facts",
    render: async (locale) => {
      const data = await programData(locale);
      const cost = estimateCost({
        program: data.program,
        costProfiles: data.costProfiles,
        budget: null,
        now: E2E_NOW,
      });
      return renderWithMessages(
        <Reporting locale={locale}>
          <div>
            <OverviewSection data={data} />
            <RequirementsSection data={data} />
            <TuitionSection data={data} />
            <CostsSection cost={cost} data={data} />
            <DeadlineSection data={data} />
            <ProcedureSection data={data} />
            <DocumentsSection data={data} />
            <ScholarshipsSection data={data} />
          </div>
        </Reporting>,
        locale,
      );
    },
  },
  {
    name: "match card (tuition, languages, deadline, channel, cost lines, reasons)",
    render: async (locale) => {
      const model = journey.card(locale, E2E_SLUGS.ok);
      return renderWithMessages(
        <Reporting locale={locale}>
          <MatchCard model={model} budgetProvided={false} monthsLabel="10" />
        </Reporting>,
        locale,
      );
    },
  },
  {
    name: "reason list",
    render: async (locale) =>
      renderWithMessages(
        <Reporting locale={locale}>
          <ReasonList
            reasons={journey.cards(locale).flatMap((card) => card.topReasons)}
            sources="per-item"
          />
        </Reporting>,
        locale,
      ),
  },
  {
    name: "cost lines",
    render: async (locale) => {
      const model = journey.card(locale, E2E_SLUGS.ok);
      return renderWithMessages(
        <Reporting locale={locale}>
          <CostBreakdown cost={model.cost} budgetProvided={false} monthsLabel="10" />
        </Reporting>,
        locale,
      );
    },
  },
  {
    name: "compare cells",
    render: async (locale) => {
      const saved = [REFS.ok, REFS.stale, REFS.fail];
      const view = await compareView(
        fixture.client(),
        locale,
        saved,
        saved.map((ref) => ref.slug),
      );
      return render(
        <CompareProviders locale={locale}>
          <Reporting locale={locale}>
            <CompareGrid view={view} onlyDifferences={false} budgetProvided={false} />
          </Reporting>
        </CompareProviders>,
      );
    },
  },
  {
    name: "scholarship facts",
    render: async (locale) => {
      const core: CoreShard = {
        kind: "core",
        countries: [{ code: "XB", name: "countries/xb#name", currency: "XTS" }],
        fields: [],
        subjects: [],
        languageCertificates: [],
        gradingScales: [],
        gradeConversions: [],
        credentialTypes: [],
        applicationChannels: [],
      };
      const support = fact(
        { amount: { min: 30000, max: 30000, currency: "EUR", per: "month" as const }, covers: [] },
        { class: "volatile" },
      );
      return renderWithMessages(
        <Reporting locale={locale}>
          <ScholarshipsPageView
            data={{
              snapshotVersion: VERSION,
              sections: [
                {
                  country: "XB",
                  entries: [
                    {
                      scholarship: scholarship({ support }),
                      scope: { kind: "institutions", groups: [], without: [] },
                    },
                  ],
                },
              ],
              core,
              text: (key) => ({ text: key, note: "none" }),
            }}
          />
        </Reporting>,
        locale,
      );
    },
  },
  {
    name: "plan steps",
    render: async (locale) => {
      const { programs } = await planEntries(fixture.client(), locale, [PROGRAMS.ok]);
      const [program] = programs;
      if (program === undefined) throw new Error("no plan program");
      return render(
        <PlanProviders locale={locale}>
          <Reporting locale={locale}>
            <ol>
              {program.steps.map((step) => (
                <StepRow
                  key={step.id}
                  program={program}
                  step={step}
                  done={false}
                  onToggle={() => undefined}
                />
              ))}
            </ol>
          </Reporting>
        </PlanProviders>,
      );
    },
  },
  {
    // The step's own facts are empty, so its only badge is the program's bare documents FactMeta.
    name: "plan documents step (fact without a record of its own)",
    render: async (locale) => {
      const { programs } = await planEntries(fixture.client(), locale, [PROGRAMS.ok]);
      const [program] = programs;
      const step = program?.steps.find((candidate) => candidate.id === "documents");
      if (program === undefined || step === undefined) throw new Error("no documents step");
      const result = render(
        <PlanProviders locale={locale}>
          <Reporting locale={locale}>
            <ol>
              <StepRow
                program={{ ...program, intake: { kind: "unknown", fact: null } }}
                step={{ ...step, facts: [] }}
                done={false}
                onToggle={() => undefined}
              />
            </ol>
          </Reporting>
        </PlanProviders>,
      );
      expect(counts(result.container)).toEqual({ badges: 1, buttons: 1 });
      return result;
    },
  },
];

describe.each(LOCALES)("ReportOutdatedButton on journey surfaces (%s)", (locale) => {
  it.each(
    SURFACES.map((surface) => [surface.name, surface] as const),
  )("renders beside the trust badges on %s", async (_name, surface) => {
    const { container } = await surface.render(locale);
    const { badges, buttons } = counts(container);
    expect(badges).toBeGreaterThan(0);
    expect(buttons).toBeGreaterThan(0);
    expect(buttons).toBeLessThanOrEqual(badges);
  });

  it.each(
    SURFACES.map((surface) => [surface.name, surface] as const),
  )("names a record and path the server accepts for every button on %s", async (_name, surface) => {
    setSessionHint();
    const user = userEvent.setup();
    const { container } = await surface.render(locale);
    // With a sign-in hint each slot swaps its label for the lazily loaded button, which owns an <output>.
    await waitFor(() =>
      expect(container.querySelectorAll(`${BUTTON} output`)).toHaveLength(
        container.querySelectorAll(BUTTON).length,
      ),
    );
    const buttons = [...container.querySelectorAll<HTMLButtonElement>(`${BUTTON} button`)];
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) await user.click(button);
    await waitFor(() => expect(mocks.createFeedbackReport).toHaveBeenCalledTimes(buttons.length));
    if (_name.startsWith("plan documents step")) {
      expect(mocks.createFeedbackReport).toHaveBeenCalledWith(
        expect.objectContaining({ record: `programs/${E2E_SLUGS.ok}`, path: "documents" }),
      );
    }
    for (const [input] of mocks.createFeedbackReport.mock.calls) {
      const parsed = FeedbackInputSchema.safeParse(input);
      expect(parsed.success, JSON.stringify(input)).toBe(true);
      expect(parsed.data?.snapshotVersion).toBe(VERSION);
    }
  });
});

describe("surfaces that carry no report button", () => {
  it.each(LOCALES)("the home hero demo shows badges and no button (%s)", (locale) => {
    const demo = catalogs[locale].home.demo;
    const { container } = renderWithMessages(
      <Reporting locale={locale}>
        <HeroDemo
          locale={locale}
          copy={{
            title: demo.title,
            illustrative: demo.illustrative,
            profile: {
              heading: demo.profile.heading,
              nationality: demo.profile.nationality,
              diploma: demo.profile.diploma,
              field: demo.profile.field,
              language: demo.profile.language,
              values: { ...demo.profile.values },
            },
            match: { ...demo.match },
          }}
        />
      </Reporting>,
      locale,
    );
    const { badges, buttons } = counts(container);
    expect(badges).toBeGreaterThan(0);
    expect(buttons).toBe(0);
  });

  it.each(LOCALES)("a guide's fact callout and source badge show no button (%s)", (locale) => {
    const { container } = renderWithMessages(
      <Reporting locale={locale}>
        <div>
          <Fact kind="official" source="https://example.org/requirement" verified="2026-10-11">
            text
          </Fact>
          <SourceBadge
            meta={{
              source_url: "https://example.org/guide",
              info_kind: "guidance",
              last_verified_at: "2026-10-11",
              class: "stable",
            }}
            variant="full"
          />
        </div>
      </Reporting>,
      locale,
    );
    expect(counts(container)).toEqual({ badges: 2, buttons: 0 });
  });

  it("a badge that does not opt in shows no button even under a provider", () => {
    const { container } = renderWithMessages(
      <Reporting locale="fr">
        <SourceBadge
          meta={{
            record: "programs/xx-test",
            path: "tuition",
            source_url: "https://example.org/x",
            last_verified_at: "2026-10-11",
            info_kind: "official",
            class: "stable",
            freshness: "fresh",
          }}
        />
      </Reporting>,
      "fr",
    );
    expect(counts(container)).toEqual({ badges: 1, buttons: 0 });
  });

  it.each([
    "src/components/home/hero-demo.tsx",
    "src/components/home/hero-demo-card.tsx",
    "src/components/home/trust-band.tsx",
    "src/components/mdx/fact.tsx",
    "src/app/[locale]/guides/[slug]/page.tsx",
    "src/app/[locale]/guides/page.tsx",
  ])("%s never asks for a report button", (file) => {
    const source = readFileSync(path.join(process.cwd(), file), "utf8");
    expect(source).not.toMatch(/report-outdated|ReportOutdated|\breport\b\s*(=|\/>|\n)/);
  });
});

describe("a signed-out visitor", () => {
  it.each(
    SURFACES.map((surface) => [surface.name, surface] as const),
  )("makes no request and prefetches nothing when %s renders", async (_name, surface) => {
    const { container } = await surface.render("fr");
    expect(counts(container).buttons).toBeGreaterThan(0);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.prefetch).not.toHaveBeenCalled();
    expect(mocks.createFeedbackReport).not.toHaveBeenCalled();
    // The button is a button, never a link a router could prefetch.
    expect(container.querySelectorAll(`${BUTTON} a`)).toHaveLength(0);
    expect(container.querySelector('a[href*="sign-in"], a[href*="welcome"]')).toBeNull();
    expect(document.querySelector('link[rel="prefetch"]')).toBeNull();
  });
});
