// @vitest-environment jsdom
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ReasonList } from "@/components/reason-list";
import type { FactRef, RuleOutcome } from "@/domain/types";
import { REASON_CODES, REASON_KINDS } from "@/lib/i18n/vocabulary";
import type { ReasonView } from "@/lib/journey/reasons";

import { type JourneyFixture, loadJourneyFixture } from "./journey-fixture";
import {
  catalogs,
  expectNoPhysicalDirection,
  LOCALES,
  renderWithMessages,
  watchConsole,
} from "./trust-helpers";

let journey: JourneyFixture;
beforeAll(() => {
  journey = loadJourneyFixture();
}, 180_000);

let consoleWatch: ReturnType<typeof watchConsole>;
beforeEach(() => {
  consoleWatch = watchConsole();
});
afterEach(() => {
  cleanup();
  consoleWatch.expectSilent();
  consoleWatch.restore();
});

function ref(overrides: Partial<FactRef> = {}): FactRef {
  return {
    record: "programs/xx-test-prog-ok",
    path: "requirements.rules.r1",
    source_url: "https://example.org/xx-test-rules",
    last_verified_at: "2026-09-01",
    info_kind: "official",
    class: "stable",
    freshness: "fresh",
    ...overrides,
  };
}

function view(overrides: Partial<ReasonView> = {}): ReasonView {
  return {
    key: "domain.reason.code.manual_check",
    kindKey: "domain.reason.kind.manual_check",
    params: {},
    outcome: "unknown",
    kind: "manual_check",
    code: "manual_check",
    note: null,
    facts: [],
    ...overrides,
  };
}

describe("ReasonList: every reason renders", () => {
  it.each(LOCALES)("renders a non-empty text for every kind x code x outcome in %s", (locale) => {
    for (const outcome of ["pass", "fail", "unknown"] as const satisfies readonly RuleOutcome[]) {
      const views = journey.reasonViews(locale).filter((reason) => reason.outcome === outcome);
      expect(views).toHaveLength(REASON_KINDS.length * REASON_CODES.length);
      const { container } = renderWithMessages(<ReasonList reasons={views} />, locale);
      const items = [...container.querySelectorAll("li[data-code]")];
      expect(items).toHaveLength(views.length);
      for (const item of items) {
        const text = item.textContent ?? "";
        expect(text.trim(), item.getAttribute("data-code") ?? "").not.toBe("");
        expect(text).not.toMatch(/domain\.|\{|\}|undefined|\bNaN\b/);
        expect(text).toContain(catalogs[locale].domain.reason.outcome[outcome]);
      }
      cleanup();
    }
  });

  it.each(LOCALES)("renders the real reasons of every fixture group in %s", (locale) => {
    for (const card of journey.cards(locale)) {
      const { container } = renderWithMessages(<ReasonList reasons={card.topReasons} />, locale);
      expect(container.querySelectorAll("li[data-code]")).toHaveLength(card.topReasons.length);
      expect(container.textContent).not.toMatch(/domain\.|\{|\}/);
      cleanup();
    }
  });

  it("covers satisfied, failed, stale, partial and foundation reasons", () => {
    const codes = new Set(
      journey.cards("fr").flatMap((card) => card.topReasons.map((reason) => reason.code)),
    );
    for (const code of [
      "ok",
      "below_threshold",
      "stale_source",
      "coverage_partial",
      "route_foundation",
    ]) {
      expect(codes, code).toContain(code);
    }
  });

  it.each(LOCALES)("shows the outcome word with an icon, never colour alone (%s)", (locale) => {
    const reasons = (["pass", "fail", "unknown"] as const).map((outcome) => view({ outcome }));
    const { container } = renderWithMessages(<ReasonList reasons={reasons} />, locale);
    for (const outcome of ["pass", "fail", "unknown"] as const) {
      const item = container.querySelector(`li[data-outcome="${outcome}"]`);
      expect(item?.textContent).toContain(catalogs[locale].domain.reason.outcome[outcome]);
      expect(item?.querySelector(`[data-testid="reason-icon-${outcome}"]`)).not.toBeNull();
    }
  });

  it("leads with the plain kind label, or the detail label when the subject or language is known", () => {
    const plain = renderWithMessages(<ReasonList reasons={[view()]} />, "en");
    expect(plain.container.textContent).toContain("Other requirement");
    cleanup();
    const detailed = renderWithMessages(
      <ReasonList
        reasons={[
          view({
            kind: "language_proficiency",
            kindKey: "domain.reason.kindDetail.language_proficiency",
            params: { language: "French" },
          }),
        ]}
      />,
      "en",
    );
    expect(detailed.container.textContent).toContain("Level in French");
  });
});

describe("ReasonList: notes", () => {
  it("shows no note and no raw key when the note is none or absent", () => {
    const { container } = renderWithMessages(
      <ReasonList reasons={[view(), view({ note: { text: "Lire la page", textNote: "none" } })]} />,
      "fr",
    );
    const notes = container.querySelectorAll('[data-testid="reason-note"]');
    expect(notes).toHaveLength(1);
    expect(notes[0]?.textContent).toBe("Lire la page");
    expect(container.textContent).not.toContain(catalogs.fr.domain.textNote.french_fallback);
    expect(container.textContent).not.toMatch(/textNote|domain\./);
  });

  it.each(
    LOCALES,
  )("adds the translation note when the text is machine translated (%s)", (locale) => {
    const { container } = renderWithMessages(
      <ReasonList reasons={[view({ note: { text: "Texte", textNote: "machine_translated" } })]} />,
      locale,
    );
    expect(container.textContent).toContain(catalogs[locale].domain.textNote.machine_translated);
  });
});

describe("ReasonList: sources", () => {
  const OFFICIAL = ref();
  const SAME_SOURCE_OTHER_PATH = ref({ path: "requirements.rules.r2" });
  const OTHER_DATE = ref({ last_verified_at: "2026-08-01" });
  const OTHER_KIND = ref({ info_kind: "guidance" });

  it("shows one badge per distinct source, date and kind", () => {
    const { container } = renderWithMessages(
      <ReasonList
        reasons={[view({ facts: [OFFICIAL, SAME_SOURCE_OTHER_PATH, OTHER_DATE, OTHER_KIND] })]}
      />,
      "en",
    );
    expect(container.querySelectorAll('[data-slot="source-badge"]')).toHaveLength(3);
  });

  it("puts the sources inside a native, closed details element", () => {
    const { container } = renderWithMessages(
      <ReasonList reasons={[view({ facts: [OFFICIAL] })]} />,
      "fr",
    );
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details?.hasAttribute("open")).toBe(false);
    expect(details?.querySelector("summary")?.textContent).toBe(catalogs.fr.reasonList.sources);
    expect(details?.querySelector('[data-slot="source-badge"]')).not.toBeNull();
  });

  it("shows no sources element when the reason has no fact or showSources is false", () => {
    const empty = renderWithMessages(<ReasonList reasons={[view()]} />, "en");
    expect(empty.container.querySelector("details")).toBeNull();
    cleanup();
    const hidden = renderWithMessages(
      <ReasonList reasons={[view({ facts: [OFFICIAL] })]} showSources={false} />,
      "en",
    );
    expect(hidden.container.querySelector("details")).toBeNull();
    expect(hidden.container.querySelector('[data-slot="source-badge"]')).toBeNull();
  });
});

describe("ReasonList: structure", () => {
  it.each([3, 4] as const)("renders the heading at level %i and a list", (level) => {
    const { container } = renderWithMessages(
      <ReasonList reasons={[view()]} heading="Requirements" headingLevel={level} />,
      "en",
    );
    expect(container.querySelector(`h${level}`)?.textContent).toBe("Requirements");
    expect(container.querySelector("ul")).not.toBeNull();
  });

  it("renders no heading when none is given and stays in logical directions in ar", () => {
    const { container } = renderWithMessages(
      <ReasonList reasons={journey.reasonViews("ar").slice(0, 3)} />,
      "ar",
    );
    expect(container.querySelector("h3, h4")).toBeNull();
    expectNoPhysicalDirection(container);
  });
});
