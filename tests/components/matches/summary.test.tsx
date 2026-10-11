// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MatchesSummary } from "@/components/matches/matches-summary";
import type { AppLocale } from "@/i18n/routing";
import { routing } from "@/i18n/routing";
import { buildMatchesView } from "@/lib/journey/matches-view";
import { profileStore } from "@/lib/profile/store";
import { shardsForMatches } from "@/lib/snapshot/plan";
import { E2E_NOW, E2E_PROFILE } from "../../fixtures/e2e/profiles";
import { forbidConsole } from "../../lib/profile/no-console";
import { catalogs, Providers, withFixtureClient } from "./helpers";

forbidConsole();

const fixture = withFixtureClient();

const state = vi.hoisted(() => ({ locale: "fr" as AppLocale }));

// The page reads next-intl's server API; the mock stands in for the RSC request scope.
vi.mock("next-intl/server", async () => {
  const { createTranslator: translator } = await import("next-intl");
  const messages = {
    fr: (await import("../../../messages/fr.json")).default,
    en: (await import("../../../messages/en.json")).default,
    ar: (await import("../../../messages/ar.json")).default,
  };
  return {
    setRequestLocale: (locale: string) => {
      state.locale = locale as AppLocale;
    },
    getMessages: async () => messages[state.locale],
    getTranslations: async (arg: string | { locale: AppLocale; namespace: string }) => {
      const locale = typeof arg === "string" ? state.locale : arg.locale;
      const namespace = typeof arg === "string" ? arg : arg.namespace;
      return translator({ locale, messages: messages[locale], namespace: namespace as never });
    },
  };
});

const page = await import("@/app/[locale]/matches/page");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${E2E_NOW}T10:00:00Z`));
});

afterEach(() => {
  cleanup();
  profileStore.clear();
  window.localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function renderPage(locale: AppLocale): Promise<Document> {
  state.locale = locale;
  const element = await page.default({ params: Promise.resolve({ locale }) });
  const html = renderToString(
    <NextIntlClientProvider locale={locale} messages={catalogs[locale]} timeZone="UTC">
      {element}
    </NextIntlClientProvider>,
  );
  const parsed = document.implementation.createHTMLDocument("");
  parsed.body.innerHTML = html;
  return parsed;
}

describe.each(routing.locales)("My Matches: the page band (%s)", (locale) => {
  it("opens with the band h1 and the static trust lead", async () => {
    const parsed = await renderPage(locale);
    const h1 = parsed.querySelector("h1");
    expect(parsed.querySelectorAll("h1")).toHaveLength(1);
    expect(h1?.textContent).toBe(catalogs[locale].matches.title);
    expect(h1?.className).toContain("text-display");
    expect(h1?.className).toContain("font-light");
    expect(parsed.body.textContent).toContain(catalogs[locale].matches.lead);
  });

  it("cancels only the top padding of the main column, like the profile page", async () => {
    const parsed = await renderPage(locale);
    const wrapper = parsed.body.firstElementChild;
    expect(wrapper?.className).toContain("-mt-8");
    expect(wrapper?.className).toContain("md:-mt-12");
  });

  it("makes no result-count claim in the static HTML", async () => {
    const parsed = await renderPage(locale);
    expect(parsed.querySelector('[data-slot="status-summary"]')).toBeNull();
    expect(parsed.querySelector("[data-group]")).toBeNull();
  });
});

describe("MatchesSummary: the band's status summary", () => {
  it("renders nothing before hydration: no chips and no count in the static output", () => {
    const html = renderToString(<MatchesSummary locale="fr" />);
    expect(html).toBe("");
  });

  it("folds the foundation year into to-check and counts each status once hydrated", async () => {
    profileStore.save(E2E_PROFILE);
    const bundle = await fixture
      .client()
      .load((manifest) => shardsForMatches(E2E_PROFILE, manifest), "fr");
    const view = buildMatchesView({ profile: E2E_PROFILE, bundle, now: E2E_NOW, locale: "fr" });
    if (view.kind !== "ok") throw new Error("expected an ok view");

    const { container } = render(
      <Providers locale="fr">
        <MatchesSummary locale="fr" client={fixture.client()} />
      </Providers>,
    );
    await waitFor(() =>
      expect(container.querySelector('[data-slot="status-summary"]')).not.toBeNull(),
    );
    const chips = [...container.querySelectorAll('[data-slot="status-summary-chip"]')];
    const expected = (
      [
        ["ok", view.counts.ok],
        ["check", view.counts.check + view.counts.foundation],
        ["failed", view.counts.failed],
      ] as const
    ).filter(([, count]) => count > 0);
    expect(
      chips.map((chip) => ({
        group: chip.querySelector("[data-group]")?.getAttribute("data-group"),
        count: chip.querySelector("bdi")?.textContent,
      })),
    ).toEqual(expected.map(([group, count]) => ({ group, count: String(count) })));
    // The foundation programs are amber "to check" here; they stay distinct in the sections below.
    expect(container.querySelector('[data-group="foundation"]')).toBeNull();
  });
});
