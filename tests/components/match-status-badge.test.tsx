// @vitest-environment jsdom
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MatchStatusBadge } from "@/components/match-status-badge";
import { MATCH_GROUPS, type MatchGroup } from "@/lib/journey/matches-view";

import {
  catalogs,
  expectNoPhysicalDirection,
  LOCALES,
  renderWithMessages,
  watchConsole,
} from "./trust-helpers";

let consoleWatch: ReturnType<typeof watchConsole>;
beforeEach(() => {
  consoleWatch = watchConsole();
});
afterEach(() => {
  cleanup();
  consoleWatch.expectSilent();
  consoleWatch.restore();
});

function expectedText(locale: (typeof LOCALES)[number], group: MatchGroup): string {
  const { domain, matchStatusBadge } = catalogs[locale];
  switch (group) {
    case "ok":
      return domain.status.satisfied;
    case "check":
      return domain.status.check;
    case "foundation":
      return matchStatusBadge.foundation;
    case "failed":
      return domain.status.not_satisfied;
  }
}

describe("MatchStatusBadge", () => {
  it.each(LOCALES)("shows the T4 wording as visible text for every group in %s", (locale) => {
    for (const group of MATCH_GROUPS) {
      const { container, unmount } = renderWithMessages(<MatchStatusBadge group={group} />, locale);
      const badge = container.querySelector(`[data-group="${group}"]`);
      expect(badge?.textContent).toBe(expectedText(locale, group));
      expect(badge?.querySelector(".sr-only")).toBeNull();
      expect(badge?.closest(".sr-only")).toBeNull();
      expectNoPhysicalDirection(container);
      unmount();
    }
  });

  it("gives every group its own icon, hidden from screen readers", () => {
    const icons = new Set<string>();
    for (const group of MATCH_GROUPS) {
      const { container, unmount } = renderWithMessages(<MatchStatusBadge group={group} />, "en");
      const icon = container.querySelector("svg");
      expect(icon?.getAttribute("aria-hidden")).toBe("true");
      const id = icon?.getAttribute("data-testid");
      expect(id).toBe(`match-status-icon-${group}`);
      icons.add(id ?? "");
      unmount();
    }
    expect(icons.size).toBe(4);
  });

  it("uses the status tokens per group and never the estimate family", () => {
    const tokens: Record<MatchGroup, string> = {
      ok: "status-ok",
      check: "status-check",
      foundation: "status-check",
      failed: "status-fail",
    };
    for (const group of MATCH_GROUPS) {
      const { container, unmount } = renderWithMessages(<MatchStatusBadge group={group} />, "en");
      const badge = container.querySelector(`[data-group="${group}"]`);
      expect(badge?.getAttribute("class")).toContain(`bg-${tokens[group]}-bg`);
      expect(badge?.getAttribute("class")).toContain(`text-${tokens[group]}-fg`);
      expect(badge?.getAttribute("class")).not.toContain("kind-");
      unmount();
    }
  });

  it("offers two sizes and defaults to md", () => {
    const md = renderWithMessages(<MatchStatusBadge group="ok" />, "en");
    const sm = renderWithMessages(<MatchStatusBadge group="ok" size="sm" />, "en");
    expect(md.container.querySelector("[data-group]")?.getAttribute("data-size")).toBe("md");
    expect(sm.container.querySelector("[data-group]")?.getAttribute("data-size")).toBe("sm");
  });

  it("never words a verdict or a promise", () => {
    for (const locale of LOCALES) {
      const all = MATCH_GROUPS.map((group) => expectedText(locale, group)).join(" ");
      expect(all).not.toMatch(/eligible|admis|admitted|guarantee|garanti|مضمون|مؤهل/i);
    }
  });
});
