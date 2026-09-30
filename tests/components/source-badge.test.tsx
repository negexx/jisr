// @vitest-environment jsdom
import { act, cleanup, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FreshnessMark } from "@/components/freshness-mark";
import { SourceBadge } from "@/components/source-badge";
import type { FactMeta } from "@/data-schema/resolved";
import type { AppLocale } from "@/i18n/routing";

import { daysAgo, meta, NOW } from "../fixtures/domain/builders";
import { IntlWrapper } from "./intl";
import {
  catalogs,
  expectNoPhysicalDirection,
  LOCALES,
  OFFICIAL_WORD,
  reachableText,
  renderWithMessages,
  watchConsole,
} from "./trust-helpers";

const KINDS = ["official", "estimate", "guidance"] as const;
const aging = (o: Partial<FactMeta> = {}) => meta({ last_verified_at: daysAgo(300), ...o });
const stale = (o: Partial<FactMeta> = {}) => meta({ last_verified_at: daysAgo(546), ...o });

let consoleWatch: ReturnType<typeof watchConsole>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${NOW}T12:00:00Z`));
  consoleWatch = watchConsole();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  consoleWatch.expectSilent();
  consoleWatch.restore();
});

describe("SourceBadge static part", () => {
  it.each(LOCALES)("shows the kind label, DD/MM/YYYY date and an https link in %s", (locale) => {
    const { container } = renderWithMessages(
      <SourceBadge meta={meta({ last_verified_at: "2026-03-05" })} variant="full" />,
      locale,
    );
    expect(container.textContent).toContain(catalogs[locale].domain.infoKind.official.label);
    expect(container.textContent).toContain("05/03/2026");
    expect(container.textContent).not.toContain("2026-03-05");
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("https://example.org/xx-test-source");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(container.querySelector("time")?.getAttribute("datetime")).toBe("2026-03-05");
    expectNoPhysicalDirection(container);
  });

  it("keeps the date in an isolated bidi run so Arabic text cannot reorder it", () => {
    const { container } = renderWithMessages(<SourceBadge meta={meta()} />, "ar");
    expect(container.querySelector("bdi time")?.textContent).toContain("01/09/2026");
  });

  it("gives the three kinds three different icon and label combinations", () => {
    const classes = new Set<string>();
    const labels = new Set<string>();
    for (const kind of KINDS) {
      const { container, unmount } = renderWithMessages(
        <SourceBadge meta={meta({ info_kind: kind })} />,
        "en",
      );
      const pill = container.querySelector(`[data-kind="${kind}"]`);
      expect(pill).not.toBeNull();
      expect(pill?.querySelector(`[data-testid="source-kind-icon-${kind}"]`)).not.toBeNull();
      expect(pill?.textContent).toBe(catalogs.en.domain.infoKind[kind].label);
      classes.add(pill?.getAttribute("class") ?? "");
      labels.add(pill?.textContent ?? "");
      unmount();
    }
    expect(classes.size).toBe(3);
    expect(labels.size).toBe(3);
  });

  it.each(
    LOCALES,
  )("never reads as official for fresh, aging or stale estimates and guidance in %s", (locale) => {
    const ages = { fresh: meta, aging, stale } as const;
    for (const kind of ["estimate", "guidance"] as const) {
      for (const variant of ["compact", "full"] as const) {
        for (const [age, build] of Object.entries(ages)) {
          const { container, unmount } = renderWithMessages(
            <SourceBadge
              meta={build({ info_kind: kind })}
              variant={variant}
              label="Tuition"
              basisText="Average of three published fees"
            />,
            locale,
          );
          if (age !== "fresh") {
            expect(container.querySelector(`[data-freshness="${age}"]`)).not.toBeNull();
          }
          expect(reachableText(container)).not.toMatch(OFFICIAL_WORD[locale]);
          unmount();
        }
      }
    }
  });

  it.each(
    LOCALES,
  )("tells a stale estimate to check the source, not the official page, in %s", (locale) => {
    const { container } = renderWithMessages(
      <SourceBadge meta={stale({ info_kind: "estimate" })} />,
      locale,
    );
    expect(container.querySelector('[data-freshness="stale"]')?.textContent).toBe(
      catalogs[locale].sourceBadge.staleCheckSource,
    );
  });

  it("draws the official pill only from the kind token family", () => {
    const { container } = renderWithMessages(<SourceBadge meta={meta()} />, "en");
    const cls = container.querySelector('[data-kind="official"]')?.getAttribute("class") ?? "";
    expect(cls).toContain("bg-kind-official");
    expect(cls).toContain("text-kind-official-bg");
    expect(cls).not.toContain("primary");
  });

  it("does name the official kind as official (sanity check for the previous test)", () => {
    const { container } = renderWithMessages(<SourceBadge meta={meta()} />, "en");
    expect(reachableText(container)).toMatch(OFFICIAL_WORD.en);
  });

  it("compact hides the host visually and full shows it", () => {
    const compact = renderWithMessages(<SourceBadge meta={meta()} variant="compact" />, "en");
    expect(screen.getByText("example.org").closest(".sr-only")).not.toBeNull();
    expect(compact.container.textContent).toContain(catalogs.en.sourceBadge.source);
    cleanup();

    renderWithMessages(<SourceBadge meta={meta()} variant="full" />, "en");
    expect(screen.getByText("example.org").closest(".sr-only")).toBeNull();
  });

  it("shows how an estimate was made only in full, only for estimates, only when text is given", () => {
    const how = catalogs.en.sourceBadge.howWeEstimated;
    const withBasis = renderWithMessages(
      <SourceBadge
        meta={meta({ info_kind: "estimate" })}
        variant="full"
        basisText="Average of three fees"
      />,
      "en",
    );
    expect(withBasis.container.textContent).toContain(how);
    expect(withBasis.container.textContent).toContain("Average of three fees");
    cleanup();

    const withoutBasis: ReactElement[] = [
      <SourceBadge key="a" meta={meta({ info_kind: "estimate" })} variant="full" />,
      <SourceBadge
        key="b"
        meta={meta({ info_kind: "estimate" })}
        variant="compact"
        basisText="X basis"
      />,
      <SourceBadge
        key="c"
        meta={meta({ info_kind: "guidance" })}
        variant="full"
        basisText="X basis"
      />,
    ];
    for (const ui of withoutBasis) {
      const { container, unmount } = renderWithMessages(ui, "en");
      expect(container.textContent).not.toContain(how);
      expect(container.textContent).not.toContain("X basis");
      unmount();
    }
  });

  it("names the fact it belongs to for screen readers", () => {
    renderWithMessages(<SourceBadge meta={meta()} label="Tuition" />, "en");
    expect(screen.getByRole("group", { name: "Tuition" })).toBeTruthy();
  });

  it("accepts a FactRef", () => {
    renderWithMessages(
      <SourceBadge
        meta={{
          record: "programs/xx",
          path: "tuition",
          source_url: "https://example.org/fee",
          last_verified_at: "2026-09-01",
          info_kind: "estimate",
          class: "volatile",
          freshness: "fresh",
        }}
      />,
      "fr",
    );
    expect(screen.getByRole("link").getAttribute("href")).toBe("https://example.org/fee");
  });
});

describe("SourceBadge freshness", () => {
  it.each(LOCALES)("shows nothing extra for fresh facts in %s", (locale) => {
    const { container } = renderWithMessages(<SourceBadge meta={meta()} />, locale);
    const { aging: agingText, stale: staleText } = catalogs[locale].domain.freshness;
    expect(container.textContent).not.toContain(agingText);
    expect(container.textContent).not.toContain(staleText);
    expect(container.querySelector("[data-freshness]")).toBeNull();
  });

  it.each(LOCALES)("shows an emphasised icon and the aging text in %s", (locale) => {
    const { container } = renderWithMessages(<SourceBadge meta={aging()} />, locale);
    const mark = container.querySelector('[data-freshness="aging"]');
    expect(mark?.textContent).toBe(catalogs[locale].domain.freshness.aging);
    expect(mark?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.textContent).not.toContain(catalogs[locale].domain.freshness.stale);
  });

  it.each(LOCALES)("shows an icon and the stale warning in %s", (locale) => {
    const { container } = renderWithMessages(<SourceBadge meta={stale()} />, locale);
    const mark = container.querySelector('[data-freshness="stale"]');
    expect(mark?.textContent).toBe(catalogs[locale].domain.freshness.stale);
    expect(mark?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("looks different from the match status badge: other icon, other shape, no border", () => {
    const { container } = renderWithMessages(<SourceBadge meta={stale()} />, "en");
    const mark = container.querySelector('[data-freshness="stale"]');
    expect(mark?.querySelector("svg")?.getAttribute("data-testid")).toBe("freshness-icon-stale");
    expect(mark?.getAttribute("class")).toContain("rounded-full");
    expect(mark?.getAttribute("class")).not.toMatch(/\bborder\b/);
    expect(mark?.getAttribute("class")).not.toContain("rounded-md");
  });

  it("uses the class of the fact: the same age is fresh for stable and aging for volatile", () => {
    const age = daysAgo(200);
    const stable = renderWithMessages(
      <SourceBadge meta={meta({ last_verified_at: age, class: "stable" })} />,
      "en",
    );
    expect(stable.container.querySelector("[data-freshness]")).toBeNull();
    cleanup();
    const volatile = renderWithMessages(
      <SourceBadge meta={meta({ last_verified_at: age, class: "volatile" })} />,
      "en",
    );
    expect(volatile.container.querySelector('[data-freshness="aging"]')).not.toBeNull();
  });

  it("reads the browser clock through todayIso, so a later day turns a fresh fact aging", () => {
    vi.setSystemTime(new Date("2027-06-30T12:00:00Z"));
    const { container } = renderWithMessages(
      <SourceBadge meta={meta({ last_verified_at: "2026-09-01" })} />,
      "en",
    );
    expect(container.querySelector('[data-freshness="aging"]')).not.toBeNull();
  });

  it("FreshnessMark renders the labels it is given", () => {
    const { container } = renderWithMessages(
      <FreshnessMark meta={stale()} labels={{ aging: "A", stale: "S" }} />,
      "en",
    );
    expect(container.textContent).toBe("S");
  });
});

describe("SourceBadge server render and hydration", () => {
  const serverHtml = (ui: ReactElement, locale: AppLocale): string =>
    renderToString(
      <IntlWrapper locale={locale} withMessages>
        {ui}
      </IntlWrapper>,
    );

  it.each(LOCALES)("makes no freshness claim on the server in %s", (locale) => {
    const html = serverHtml(<SourceBadge meta={stale()} />, locale);
    const { aging: agingText, stale: staleText } = catalogs[locale].domain.freshness;
    expect(html).not.toContain(agingText);
    expect(html).not.toContain(staleText);
    expect(html).not.toContain("data-freshness");
    expect(html).toContain(catalogs[locale].domain.infoKind.official.label);
  });

  it("hydrates a stale badge without a mismatch and then shows the warning", async () => {
    const ui = <SourceBadge meta={stale()} variant="full" />;
    const html = serverHtml(ui, "fr");

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);
    const recoverable = vi.fn();
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(
        container,
        <IntlWrapper locale="fr" withMessages>
          {ui}
        </IntlWrapper>,
        {
          onRecoverableError: recoverable,
        },
      );
    });

    expect(recoverable).not.toHaveBeenCalled();
    expect(container.querySelector('[data-freshness="stale"]')?.textContent).toBe(
      catalogs.fr.domain.freshness.stale,
    );
    await act(async () => root?.unmount());
    container.remove();
  });
});
