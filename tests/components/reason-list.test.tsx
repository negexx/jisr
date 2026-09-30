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
  it("shows the note text without a translation note when the note is none, and nothing when it is absent", () => {
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

describe("ReasonList: collapsing", () => {
  const pass = () => view({ outcome: "pass", code: "ok", key: "domain.reason.code.ok" });
  const unknown = () => view({ outcome: "unknown" });
  const fail = () =>
    view({
      outcome: "fail",
      code: "below_threshold",
      key: "domain.reason.code.below_threshold",
      params: { student: "10 / 20", required: "12 / 20" },
    });

  it.each(
    LOCALES,
  )("shows the first reason and folds the rest into a Why? details (%s)", (locale) => {
    const { container } = renderWithMessages(
      <ReasonList reasons={[unknown(), pass(), pass(), fail()]} collapseFrom={3} />,
      locale,
    );
    const items = [...container.querySelectorAll("li[data-code]")];
    expect(items).toHaveLength(4);
    expect(items[0]?.closest("details")).toBeNull();
    for (const item of items.slice(1)) {
      expect(item.closest("details[data-slot='why']")).not.toBeNull();
    }
    const summary = container.querySelector("details[data-slot='why'] summary");
    const outcomes = catalogs[locale].domain.reason.outcome;
    const count = catalogs[locale].reasonList.count;
    expect(summary?.textContent).toContain(
      catalogs[locale].reasonList.whySummary.split("{counts}")[0]?.trim() ?? "?",
    );
    expect(summary?.textContent).toContain(
      count.replace("{outcome}", outcomes.pass).replace("{count}", "2"),
    );
    expect(summary?.textContent).toContain(
      count.replace("{outcome}", outcomes.fail).replace("{count}", "1"),
    );
    expect(summary?.textContent).not.toContain(outcomes.unknown);
    expect(container.textContent).not.toMatch(/[٠-٩]/u);
  });

  it("keeps the whole list open below the threshold and by default", () => {
    const three = [unknown(), pass(), fail()];
    const below = renderWithMessages(<ReasonList reasons={three} collapseFrom={4} />, "en");
    expect(below.container.querySelector("details[data-slot='why']")).toBeNull();
    cleanup();
    const plain = renderWithMessages(<ReasonList reasons={three} />, "en");
    expect(plain.container.querySelector("details[data-slot='why']")).toBeNull();
  });

  it("shows a chevron on the disclosure so its state is visible", () => {
    const { container } = renderWithMessages(
      <ReasonList reasons={[unknown(), pass(), fail()]} collapseFrom={3} />,
      "en",
    );
    expect(container.querySelector("details[data-slot='why'] summary svg")).not.toBeNull();
  });
});

describe("ReasonList: grouped sources", () => {
  const A = ref();
  const B = ref({ source_url: "https://example.org/other" });

  it("shows one deduped Sources details after the list and none per item", () => {
    const { container } = renderWithMessages(
      <ReasonList
        reasons={[view({ facts: [A, B] }), view({ facts: [A] }), view({ facts: [B] })]}
        sources="grouped"
        collapseFrom={2}
      />,
      "en",
    );
    const sources = [...container.querySelectorAll("details")].filter(
      (details) => details.querySelector("summary")?.textContent === "Sources",
    );
    expect(sources).toHaveLength(1);
    expect(sources[0]?.closest("li")).toBeNull();
    expect(sources[0]?.closest("details[data-slot='why']")).toBeNull();
    expect(sources[0]?.querySelectorAll('[data-slot="source-badge"]')).toHaveLength(2);
  });

  it("shows no grouped details when no reason has a fact or sources are off", () => {
    const empty = renderWithMessages(<ReasonList reasons={[view()]} sources="grouped" />, "en");
    expect(empty.container.querySelector("details")).toBeNull();
    cleanup();
    const off = renderWithMessages(
      <ReasonList reasons={[view({ facts: [A] })]} sources="grouped" showSources={false} />,
      "en",
    );
    expect(off.container.querySelector("details")).toBeNull();
  });
});

describe("ReasonList: compact and hidden bodies", () => {
  const passView = () => view({ outcome: "pass", code: "ok", key: "domain.reason.code.ok" });

  it.each(
    LOCALES,
  )("drops the body of passing reasons but keeps failing and unknown ones (%s)", (locale) => {
    const { container } = renderWithMessages(
      <ReasonList
        compact
        reasons={[
          passView(),
          view({ outcome: "unknown" }),
          view({
            outcome: "fail",
            code: "below_threshold",
            key: "domain.reason.code.below_threshold",
            params: { student: "10 / 20", required: "12 / 20" },
          }),
        ]}
      />,
      locale,
    );
    const [pass, unknown, fail] = [...container.querySelectorAll("li[data-code]")];
    const codes = catalogs[locale].domain.reason.code;
    expect(pass?.textContent).not.toContain(codes.ok);
    expect(pass?.textContent).toContain(catalogs[locale].domain.reason.outcome.pass);
    expect(pass?.textContent).toContain(catalogs[locale].domain.reason.kind.manual_check);
    expect(unknown?.textContent).toContain(codes.manual_check);
    expect(fail?.textContent).toContain("10 / 20");
  });

  it("keeps the note of a passing reason in compact mode", () => {
    const { container } = renderWithMessages(
      <ReasonList
        compact
        reasons={[{ ...passView(), note: { text: "Lire la page", textNote: "none" } }]}
      />,
      "fr",
    );
    expect(container.querySelector('[data-testid="reason-note"]')?.textContent).toBe(
      "Lire la page",
    );
  });

  it("hides the body of the listed codes but keeps their chip, label and sources", () => {
    const foundation = view({
      outcome: "unknown",
      kind: "route",
      code: "route_foundation",
      key: "domain.reason.code.route_foundation",
      kindKey: "domain.reason.kind.route",
      facts: [ref()],
    });
    const { container } = renderWithMessages(
      <ReasonList reasons={[foundation]} bodyHiddenFor={["route_foundation"]} />,
      "en",
    );
    expect(container.textContent).not.toContain(catalogs.en.domain.reason.code.route_foundation);
    expect(container.textContent).toContain(catalogs.en.domain.reason.kind.route);
    expect(container.textContent).toContain(catalogs.en.domain.reason.outcome.unknown);
    expect(container.querySelector('[data-slot="source-badge"]')).not.toBeNull();
  });
});
