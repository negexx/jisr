// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DeadlineStatus } from "@/components/deadline-status";
import type { IntakeStatus } from "@/domain/types";

import { daysAgo, meta, STALE } from "../fixtures/domain/builders";

import {
  catalogs,
  expectNoPhysicalDirection,
  LOCALES,
  renderWithMessages,
  watchConsole,
} from "./trust-helpers";

const ref = (o: Partial<IntakeStatus["fact"] & object> = {}) => ({
  record: "programs/xx-test-prog",
  path: "intakes",
  ...meta({ info_kind: "official", class: "volatile" }),
  freshness: "fresh" as const,
  ...o,
});

const upcoming: IntakeStatus = {
  kind: "upcoming",
  intake: {
    startDate: "2027-09-01",
    applicationOpens: "2026-11-01",
    applicationDeadline: "2027-01-15",
  },
  fact: ref(),
};

const recurring: IntakeStatus = {
  kind: "recurring",
  deadline: { month: 7, day: 15 },
  fact: ref(),
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

describe("DeadlineStatus", () => {
  it.each(LOCALES)("shows the deadline and the opening date as DD/MM/YYYY in %s", (locale) => {
    const { container } = renderWithMessages(<DeadlineStatus intake={upcoming} />, locale);
    const text = container.textContent ?? "";
    expect(text).toContain("15/01/2027");
    expect(text).toContain("01/11/2026");
    expect(text).not.toMatch(/2027-01-15|١|٢|٣/);
    expect(text).toContain(catalogs[locale].domain.intake.upcoming.replace("{date}", "15/01/2027"));
    expect(container.querySelectorAll("bdi time").length).toBeGreaterThanOrEqual(2);
    expectNoPhysicalDirection(container);
  });

  it("lets the source badge use the full row: only the opening line is indented", () => {
    const { container } = renderWithMessages(<DeadlineStatus intake={upcoming} />, "fr");
    const badge = container.querySelector("[data-slot='source-badge']");
    expect(badge).not.toBeNull();
    for (let node = badge?.parentElement; node && node !== container; node = node.parentElement) {
      expect(node.classList.contains("ps-7")).toBe(false);
    }
    const opens = [...container.querySelectorAll("p")].find((p) =>
      p.textContent?.includes("01/11/2026"),
    );
    expect(opens?.className).toContain("ps-7");
  });

  it("omits the opening line when the intake has no opening date", () => {
    const withoutOpening: IntakeStatus = {
      ...upcoming,
      intake: { startDate: null, applicationOpens: null, applicationDeadline: "2027-01-15" },
    };
    const { container } = renderWithMessages(<DeadlineStatus intake={withoutOpening} />, "en");
    expect(container.textContent).toContain("15/01/2027");
    expect(container.textContent).not.toContain(
      catalogs.en.deadline.opensFrom.replace("{date}", ""),
    );
  });

  it.each(LOCALES)("shows the closed wording in %s", (locale) => {
    const { container } = renderWithMessages(
      <DeadlineStatus intake={{ kind: "closed", fact: ref() }} />,
      locale,
    );
    expect(container.textContent).toContain(catalogs[locale].domain.intake.closed);
    expect(container.querySelector('[data-intake="closed"]')).not.toBeNull();
  });

  it.each(LOCALES)("shows the unknown wording in %s, with or without a fact", (locale) => {
    const a = renderWithMessages(
      <DeadlineStatus intake={{ kind: "unknown", fact: ref() }} />,
      locale,
    );
    expect(a.container.textContent).toContain(catalogs[locale].domain.intake.unknown);
    // an unknown deadline has nothing to verify: no "verified on" badge beside it
    expect(a.container.querySelector("a")).toBeNull();
    expect(a.container.textContent).not.toContain("01/");
    cleanup();
    const b = renderWithMessages(
      <DeadlineStatus intake={{ kind: "unknown", fact: null }} />,
      locale,
    );
    expect(b.container.textContent).toContain(catalogs[locale].domain.intake.unknown);
    expect(b.container.querySelector("a")).toBeNull();
  });

  it("renders closed for a closed model even when its fact is dated in the future", () => {
    const closed: IntakeStatus = { kind: "closed", fact: ref({ last_verified_at: "2099-01-01" }) };
    const { container } = renderWithMessages(<DeadlineStatus intake={closed} />, "en");
    expect(container.querySelector('[data-intake="closed"]')).not.toBeNull();
    expect(container.querySelector('[data-intake="upcoming"]')).toBeNull();
    expect(container.textContent).not.toContain("Next deadline");
  });

  it("renders only from the given status: an upcoming model with a past-looking date stays upcoming", () => {
    const pastDeadline: IntakeStatus = {
      ...upcoming,
      intake: { startDate: null, applicationOpens: null, applicationDeadline: daysAgo(400) },
    };
    const { container } = renderWithMessages(<DeadlineStatus intake={pastDeadline} />, "en");
    expect(container.querySelector('[data-intake="upcoming"]')).not.toBeNull();
    expect(container.textContent).not.toContain(catalogs.en.domain.intake.closed);
  });

  it("still shows closed when the fact behind it is stale, next to the stale warning", () => {
    const closed: IntakeStatus = {
      kind: "closed",
      fact: ref({ last_verified_at: STALE, freshness: "stale" }),
    };
    const { container } = renderWithMessages(<DeadlineStatus intake={closed} />, "en");
    expect(container.querySelector('[data-intake="closed"]')).not.toBeNull();
    expect(container.textContent).toContain(catalogs.en.domain.intake.closed);
  });

  it("includes the compact source badge of the fact", () => {
    renderWithMessages(<DeadlineStatus intake={upcoming} />, "en");
    expect(screen.getByRole("link").getAttribute("href")).toBe(
      "https://example.org/xx-test-source",
    );
    expect(screen.getByText(catalogs.en.domain.infoKind.official.label)).toBeTruthy();
  });

  it("gives every state an icon hidden from screen readers and visible text", () => {
    const states: IntakeStatus[] = [
      upcoming,
      { kind: "closed", fact: ref() },
      { kind: "unknown", fact: null },
      recurring,
    ];
    const ids = new Set<string>();
    for (const status of states) {
      const { container, unmount } = renderWithMessages(<DeadlineStatus intake={status} />, "en");
      const icon = container.querySelector(`[data-intake="${status.kind}"] svg`);
      expect(icon?.getAttribute("aria-hidden")).toBe("true");
      ids.add(icon?.getAttribute("data-testid") ?? "");
      unmount();
    }
    expect(ids.size).toBe(4);
  });

  describe("recurring", () => {
    it.each(LOCALES)("shows the usual date as DD/MM, without a year, in %s", (locale) => {
      const { container } = renderWithMessages(<DeadlineStatus intake={recurring} />, locale);
      expect(container.querySelector('[data-intake="recurring"]')).not.toBeNull();
      expect(container.querySelector('[data-intake="upcoming"]')).toBeNull();
      expect(container.textContent).toContain(
        catalogs[locale].domain.intake.recurring.replace("{date}", "15/07"),
      );
      // there is no ISO date to put in a <time>: the year is not published
      // (the source badge's own "verified on" date is a <time>, outside the status line)
      const line = container.querySelector('[data-intake="recurring"] > p');
      expect(line?.querySelector("time")).toBeNull();
      expect(line?.querySelector("bdi")?.textContent).toContain("15/07");
      const icon = container.querySelector('[data-testid="deadline-icon-recurring"]');
      expect(icon?.getAttribute("aria-hidden")).toBe("true");
      expect(container.querySelector('[data-testid="deadline-icon-upcoming"]')).toBeNull();
      expectNoPhysicalDirection(container);
    });

    it.each(LOCALES)("keeps the compact source badge for a fresh fact in %s", (locale) => {
      const { container } = renderWithMessages(<DeadlineStatus intake={recurring} />, locale);
      expect(container.querySelector("[data-slot='source-badge']")).not.toBeNull();
      expect(
        container.querySelector('a[href="https://example.org/xx-test-source"]'),
      ).not.toBeNull();
      expect(container.querySelector("[data-freshness]")).toBeNull();
    });

    it.each(LOCALES)("keeps the stale marker for a stale fact in %s", (locale) => {
      const stale: IntakeStatus = {
        ...recurring,
        fact: ref({ last_verified_at: STALE, freshness: "stale" }),
      };
      const { container } = renderWithMessages(<DeadlineStatus intake={stale} />, locale);
      expect(container.querySelector('[data-freshness="stale"]')).not.toBeNull();
      expect(container.querySelector('[data-intake="recurring"]')).not.toBeNull();
    });

    it("marks the date as something to check, with the same question-mark glyph as unknown", () => {
      const a = renderWithMessages(<DeadlineStatus intake={recurring} />, "en");
      const recurringIcon = a.container.querySelector('[data-testid="deadline-icon-recurring"]');
      a.unmount();
      const b = renderWithMessages(
        <DeadlineStatus intake={{ kind: "unknown", fact: null }} />,
        "en",
      );
      const unknownIcon = b.container.querySelector('[data-testid="deadline-icon-unknown"]');
      expect(recurringIcon?.getAttribute("class")).toBe(unknownIcon?.getAttribute("class"));
    });

    it("pads a single-digit day and month", () => {
      const early: IntakeStatus = { ...recurring, deadline: { month: 3, day: 1 } };
      const { container } = renderWithMessages(<DeadlineStatus intake={early} />, "en");
      expect(container.textContent).toContain("01/03");
    });

    it("never shows the opening line", () => {
      const { container } = renderWithMessages(<DeadlineStatus intake={recurring} />, "en");
      expect(container.textContent).not.toContain(
        catalogs.en.deadline.opensFrom.replace("{date}", ""),
      );
    });
  });
});
