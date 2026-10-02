// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTranslator } from "next-intl";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { SkippedSteps } from "@/components/plan/skipped-steps";
import { StepRow } from "@/components/plan/step-row";
import type { AppLocale } from "@/i18n/routing";
import type { PlanProgram, PlanStep } from "@/lib/journey/plan-view";
import { E2E_SCHOLARSHIP_SLUGS } from "../../fixtures/e2e/profiles";
import { forbidConsole } from "../../lib/profile/no-console";
import { expectNoPhysicalDirection, LOCALES } from "../trust-helpers";
import {
  catalogs,
  PlanProviders,
  PROGRAMS,
  planEntries,
  stepTitle,
  withFixtureClient,
} from "./helpers";

forbidConsole();

const fixture = withFixtureClient();

afterEach(cleanup);

const entries = {} as Record<AppLocale, PlanProgram>;

beforeAll(async () => {
  for (const locale of LOCALES) {
    const { programs } = await planEntries(fixture.client(), locale, [PROGRAMS.ok]);
    const [entry] = programs;
    if (entry === undefined) throw new Error("no ok entry");
    entries[locale] = entry;
  }
}, 120_000);

function step(program: PlanProgram, id: PlanStep["id"]): PlanStep {
  const found = program.steps.find((s) => s.id === id);
  if (found === undefined) throw new Error(`no step ${id}`);
  return found;
}

function renderRow(
  locale: AppLocale,
  id: PlanStep["id"],
  options: { done?: boolean; onToggle?: (done: boolean) => void; program?: PlanProgram } = {},
) {
  const program = options.program ?? entries[locale];
  const view = render(
    <PlanProviders locale={locale}>
      <ol>
        <StepRow
          program={program}
          step={step(program, id)}
          done={options.done ?? false}
          onToggle={options.onToggle ?? (() => undefined)}
        />
      </ol>
    </PlanProviders>,
  );
  return { ...view, row: view.container.querySelector("li") as HTMLElement };
}

function factKey(fact: { record: string; path: string }): string {
  return `${fact.record}#${fact.path}`;
}

describe.each(LOCALES)("StepRow (%s)", (locale) => {
  const t = catalogs[locale];

  it("shows the title as the checkbox name, with the meaning and the reason described", () => {
    const { row } = renderRow(locale, "documents");
    const box = within(row).getByRole("checkbox", { name: stepTitle(locale, "documents") });
    const description = (box.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ");
    expect(description).toContain(t.domain.checklist.step.documents.meaning);
    expect(description).toContain(
      t.domain.checklist.reason[step(entries[locale], "documents").reason],
    );
  });

  it("calls onToggle with the new state and shows a ticked step as checked, text unstruck", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { row, rerender } = renderRow(locale, "documents", { onToggle });
    await user.click(within(row).getByRole("checkbox"));
    expect(onToggle).toHaveBeenCalledWith(true);
    rerender(
      <PlanProviders locale={locale}>
        <ol>
          <StepRow
            program={entries[locale]}
            step={step(entries[locale], "documents")}
            done
            onToggle={onToggle}
          />
        </ol>
      </PlanProviders>,
    );
    const box = screen.getByRole<HTMLInputElement>("checkbox");
    expect(box.checked).toBe(true);
    expect(row.innerHTML).not.toContain("line-through");
  });

  it("renders one source badge per fact, and the guidance tag only for steps without facts", () => {
    const program = entries[locale];
    for (const s of program.steps.filter((candidate) => candidate.status === "todo")) {
      const { row, unmount } = renderRow(locale, s.id);
      const badges = row.querySelectorAll('[data-slot="source-badge"]');
      // The deadline status brings its own badge for the intake it shows.
      const keys = new Set(s.facts.map(factKey));
      if (s.id === "submit" && program.intake.kind !== "unknown" && program.intake.fact !== null) {
        keys.add(factKey(program.intake.fact));
      }
      const documentsListed = s.id === "documents" && program.documents !== null;
      const expected = keys.size > 0 ? keys.size : documentsListed ? 1 : 0;
      expect(badges.length, s.id).toBe(expected);
      const guidance = within(row).queryByText(t.plan.steps.guidance);
      if (expected === 0) {
        expect(guidance, s.id).not.toBeNull();
        expect(row.querySelector("a[href^='http']"), s.id).toBeNull();
      } else {
        expect(guidance, s.id).toBeNull();
      }
      unmount();
    }
  });

  it("shows the next deadline for the submit step, DD/MM/YYYY with Latin digits", () => {
    const { row } = renderRow(locale, "submit");
    const deadline = row.querySelector('[data-intake="upcoming"] time');
    expect(deadline?.textContent).toContain("15/01/2027");
    expect(row.textContent).not.toMatch(/[٠-٩۰-۹]/u);
  });

  it("says the intake is closed on the submit step, with no deadline shown", () => {
    const base = entries[locale];
    if (base.intake.fact === null) throw new Error("the ok program has an intake fact");
    const program: PlanProgram = { ...base, intake: { kind: "closed", fact: base.intake.fact } };
    const { row } = renderRow(locale, "submit", { program });
    const status = row.querySelector('[data-intake="closed"]');
    expect(status?.textContent).toContain(t.domain.intake.closed);
    expect(status?.querySelector("p time")).toBeNull();
    expect(row.textContent).not.toContain("15/01/2027");
    expect(row.querySelector('[data-intake="upcoming"]')).toBeNull();
  });

  it("says the deadline is unknown on the submit step, with no date or verified badge for it", () => {
    const program: PlanProgram = { ...entries[locale], intake: { kind: "unknown", fact: null } };
    const { row } = renderRow(locale, "submit", { program });
    const status = row.querySelector('[data-intake="unknown"]');
    expect(status?.textContent).toContain(t.domain.intake.unknown);
    expect(status?.querySelector("time")).toBeNull();
    expect(status?.querySelector('[data-slot="source-badge"]')).toBeNull();
    expect(row.textContent).not.toContain("15/01/2027");
  });

  it("links the application channel on the submit and account steps, with the account line", () => {
    for (const id of ["submit", "application_account"] as const) {
      const { row, unmount } = renderRow(locale, id);
      const link = row.querySelector<HTMLAnchorElement>("a[href='https://example.org/portal-b']");
      expect(link, id).not.toBeNull();
      expect(link?.textContent).toContain("XX Test Portal B");
      expect(link?.getAttribute("rel")).toContain("noopener");
      unmount();
    }
    const { row } = renderRow(locale, "application_account");
    expect(within(row).getByText(t.plan.steps.accountRequired)).toBeTruthy();
  });

  it("lists the documents with their translation line", () => {
    const { row } = renderRow(locale, "documents");
    const program = entries[locale];
    expect(within(row).getByText(t.plan.steps.documents)).toBeTruthy();
    const items = row.querySelectorAll('[data-slot="documents"] > li');
    expect(items).toHaveLength(program.documents?.length ?? -1);
    expect(items[0]?.textContent).toContain(program.documents?.[0]?.name?.text ?? "missing name");
    expect(items[0]?.textContent).toContain(t.plan.steps.translation.yes);
    expect(items[1]?.textContent).toContain(t.plan.steps.translation.no);
    expect(items[2]?.textContent).toContain(t.plan.steps.translation.unknown);
  });

  it("links each scholarship to its anchor on the program page", () => {
    const { row } = renderRow(locale, "scholarships");
    const link = within(row).getByRole("link", { name: "XX Test Open Scholarship" });
    expect(link.getAttribute("href")).toBe(
      `/${locale}/programs/${PROGRAMS.ok.slug}#scholarship-${E2E_SCHOLARSHIP_SLUGS.open}`,
    );
  });

  it("uses no physical direction utilities", () => {
    const { container } = renderRow(locale, "submit");
    expectNoPhysicalDirection(container);
  });
});

describe.each(LOCALES)("SkippedSteps (%s)", (locale) => {
  const t = catalogs[locale].plan;

  it("is collapsed, has no checkboxes, and keeps the title, reason and source of each step", () => {
    const program = entries[locale];
    const skipped = program.steps.filter((s) => s.status === "skipped");
    expect(skipped.length).toBeGreaterThan(0);
    const { container } = render(
      <PlanProviders locale={locale}>
        <SkippedSteps steps={skipped} />
      </PlanProviders>,
    );
    const details = container.querySelector<HTMLDetailsElement>("details");
    expect(details?.open).toBe(false);
    expect(details?.querySelectorAll("input")).toHaveLength(0);
    const heading = createTranslator({
      locale,
      messages: catalogs[locale],
      namespace: "plan.steps",
    })("skippedHeading", { count: String(skipped.length) });
    expect(within(details as HTMLElement).getByText(heading)).toBeTruthy();
    expect(within(details as HTMLElement).getByText(t.steps.skippedLead)).toBeTruthy();
    const rows = details?.querySelectorAll("li") ?? [];
    expect(rows).toHaveLength(skipped.length);
    for (const s of skipped) {
      expect(details?.textContent).toContain(stepTitle(locale, s.id));
      expect(details?.textContent).toContain(catalogs[locale].domain.checklist.reason[s.reason]);
    }
    expectNoPhysicalDirection(container);
  });

  it("shows no guidance tag on a skipped row without facts, whose reason is about this program", () => {
    const noFacts: PlanStep = {
      id: "scholarships",
      status: "skipped",
      reason: "no_scholarships_listed",
      facts: [],
      deadline: null,
      channel: null,
      scholarships: [],
    };
    const withFacts = entries[locale].steps.find(
      (s) => s.status === "skipped" && s.facts.length > 0,
    );
    const { container } = render(
      <PlanProviders locale={locale}>
        <SkippedSteps steps={withFacts === undefined ? [noFacts] : [noFacts, withFacts]} />
      </PlanProviders>,
    );
    const rows = container.querySelectorAll<HTMLElement>("li[data-step]");
    const bare = container.querySelector<HTMLElement>('li[data-step="scholarships"]');
    expect(bare?.textContent).toContain(
      catalogs[locale].domain.checklist.reason.no_scholarships_listed,
    );
    expect(within(bare as HTMLElement).queryByText(t.steps.guidance)).toBeNull();
    expect(bare?.querySelector('[data-slot="guidance-tag"]')).toBeNull();
    expect(bare?.querySelector('[data-slot="source-badge"]')).toBeNull();
    for (const row of rows) expect(row.querySelector('[data-slot="guidance-tag"]')).toBeNull();
  });
});
