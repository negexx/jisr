// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTranslator } from "next-intl";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MatchesClient } from "@/components/matches/matches-client";
import type { Profile } from "@/data-schema/profile";
import type { AppLocale } from "@/i18n/routing";
import { writeMatchFilters } from "@/lib/matches/filter-store";
import { PROFILE_KEY } from "@/lib/profile/storage";
import { profileStore } from "@/lib/profile/store";
import type { SnapshotBundle, SnapshotClient } from "@/lib/snapshot/client";
import { SnapshotError } from "@/lib/snapshot/errors";
import { shardsForMatches } from "@/lib/snapshot/plan";
import { E2E_FILTERS, E2E_NOW, E2E_PROFILE, E2E_SLUGS } from "../../fixtures/e2e/profiles";
import { forbidConsole } from "../../lib/profile/no-console";
import { LOCALES } from "../trust-helpers";
import { bundleClient, catalogs, Providers, renderMatches, withFixtureClient } from "./helpers";

forbidConsole();

const fixture = withFixtureClient();

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

function texts(locale: AppLocale) {
  return catalogs[locale].matches;
}

function loadedBundle(
  locale: AppLocale = "fr",
  profile: Profile = E2E_PROFILE,
): Promise<SnapshotBundle> {
  return fixture.client().load((manifest) => shardsForMatches(profile, manifest), locale);
}

describe.each(LOCALES)("My Matches: no profile (%s)", (locale) => {
  it("shows the create-profile call to action with a link to the profile page", async () => {
    renderMatches(locale, fixture.client());
    const title = await screen.findByRole("heading", { name: texts(locale).states.none.title });
    expect(title.tagName).toBe("H2");
    const link = screen.getByRole("link", { name: texts(locale).states.none.cta });
    expect(link.getAttribute("href")).toBe(`/${locale}/profile`);
    expect(screen.queryByText(texts(locale).lead)).toBeNull();
  });

  it("never asks the network for anything", async () => {
    const before = fixture.requests.length;
    renderMatches(locale, fixture.client());
    await screen.findByRole("heading", { name: texts(locale).states.none.title });
    expect(fixture.requests.length).toBe(before);
  });
});

describe("My Matches: unhydrated", () => {
  it("renders a busy skeleton and a separate live status on the server", () => {
    const html = renderToString(
      <Providers locale="fr">
        <MatchesClient locale="fr" client={fixture.client()} />
      </Providers>,
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    const busy = document.querySelector('[aria-busy="true"]');
    expect(busy).not.toBeNull();
    const status = document.querySelector("output");
    expect(status?.textContent).toBe(texts("fr").loading);
    expect(busy?.contains(status ?? null)).toBe(false);
    expect(document.querySelector("article")).toBeNull();
    expect(document.body.textContent).not.toContain(texts("fr").states.none.title);
  });

  it("holds no clock-dependent output on the server", () => {
    const html = renderToString(
      <Providers locale="fr">
        <MatchesClient locale="fr" client={fixture.client()} />
      </Providers>,
    );
    expect(html).not.toContain("/2026");
  });
});

describe("My Matches: hydration with a saved profile", () => {
  it("matches the server HTML on the first client render: skeleton, no cards, no mismatch", async () => {
    profileStore.save(E2E_PROFILE);
    const errors: unknown[] = [];
    const ui = (
      <Providers locale="fr">
        <MatchesClient locale="fr" client={{ load: () => new Promise(() => undefined) }} />
      </Providers>
    );
    const container = document.createElement("div");
    document.body.appendChild(container);
    container.innerHTML = renderToString(ui);
    expect(container.querySelector("article")).toBeNull();
    const serverHtml = container.innerHTML;
    const { hydrateRoot } = await import("react-dom/client");
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, ui, { onRecoverableError: (error) => errors.push(error) });
    });
    // The stored profile is read after hydration, and no date is taken before an effect runs.
    expect(errors).toEqual([]);
    expect(container.querySelector("article")).toBeNull();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.querySelector("output")?.textContent).toBe(texts("fr").loading);
    expect(serverHtml).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
    act(() => root?.unmount());
    container.remove();
  });

  it("keeps one polite status region and only swaps its text", async () => {
    profileStore.save(E2E_PROFILE);
    const { container } = renderMatches("en", fixture.client());
    const status = container.querySelector("output");
    expect(status?.textContent).toBe(texts("en").loading);
    await waitFor(() => expect(screen.getAllByRole("article").length).toBeGreaterThan(0));
    // Each card carries its own save button, with its own announcement region: only the page-level one counts here.
    expect(container.querySelectorAll("output.sr-only:not(article output)")).toHaveLength(1);
    expect(container.querySelector("output:not(article output)")).toBe(status);
    expect(status?.textContent).toBe("");
  });
});

describe("My Matches: reset profile", () => {
  it("tells the student the saved profile was removed, offers the same call to action and dismisses", async () => {
    window.localStorage.setItem(PROFILE_KEY, "{not json");
    const user = userEvent.setup();
    renderMatches("en", fixture.client());
    expect(await screen.findByText(texts("en").states.reset.notice)).toBeTruthy();
    expect(screen.getByRole("link", { name: texts("en").states.none.cta })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: texts("en").states.reset.dismiss }));
    expect(screen.queryByText(texts("en").states.reset.notice)).toBeNull();
    expect(screen.getByRole("link", { name: texts("en").states.none.cta })).toBeTruthy();
  });
});

describe.each(LOCALES)("My Matches: loading and error (%s)", (locale) => {
  it("keeps the skeleton busy and announces loading outside the busy container", async () => {
    profileStore.save(E2E_PROFILE);
    renderMatches(locale, { load: () => new Promise(() => undefined) });
    const status = await screen.findByRole("status");
    expect(status.textContent).toBe(texts(locale).loading);
    const busy = document.querySelector('[aria-busy="true"]');
    expect(busy).not.toBeNull();
    expect(busy?.contains(status)).toBe(false);
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("shows a plain error with Retry, never the raw error, and recovers on retry", async () => {
    profileStore.save(E2E_PROFILE);
    const user = userEvent.setup();
    const real = fixture.client();
    const load = vi
      .fn<SnapshotClient["load"]>()
      .mockRejectedValueOnce(new SnapshotError("network"))
      .mockImplementation((plan, loadLocale, signal) => real.load(plan, loadLocale, signal));
    renderMatches(locale, { load });

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("heading").textContent).toBe(texts(locale).states.error.title);
    expect(alert.textContent).not.toMatch(/SnapshotError|network|Error|stack/i);
    expect(screen.queryByText(texts(locale).lead)).toBeNull();

    await user.click(screen.getByRole("button", { name: texts(locale).states.error.retry }));
    await waitFor(() => expect(screen.getAllByRole("article").length).toBeGreaterThan(0));
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("My Matches: data states", () => {
  it.each(
    LOCALES,
  )("says no programs are published yet when the catalogue is empty (%s)", async (locale) => {
    profileStore.save(E2E_PROFILE);
    const bundle = await loadedBundle(locale);
    renderMatches(locale, bundleClient({ ...bundle, programs: [], hasPrograms: false }));
    const title = await screen.findByRole("heading", {
      name: texts(locale).states.noPrograms.title,
    });
    expect(title).toBeTruthy();
    expect(screen.queryByText(texts(locale).lead)).toBeNull();
    expect(screen.queryByRole("article")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the error state, not a crash, when the bundle has programs but no core", async () => {
    profileStore.save(E2E_PROFILE);
    const bundle = await loadedBundle("en");
    renderMatches("en", bundleClient({ ...bundle, core: undefined }));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("heading").textContent).toBe(texts("en").states.error.title);
    expect(alert.textContent).not.toMatch(/core|buildMatchesView/);
  });

  it.each(
    LOCALES,
  )("says the filters hide every program, opens the panel and offers Clear (%s)", async (locale) => {
    const bundle = await loadedBundle(locale);
    // Every fixture program is outside a destination nobody published.
    profileStore.save(E2E_PROFILE);
    writeMatchFilters(window.localStorage, {
      ...E2E_FILTERS,
      destinations: ["XZ"],
    });
    renderMatches(locale, bundleClient(bundle));

    const total = bundle.programs.flatMap((shard) => shard.programs).length;
    const title = createTranslator({
      locale,
      messages: catalogs[locale],
      namespace: "matches.states.noMatches",
    })("title", { n: total, count: String(total) });
    await screen.findByRole("heading", { name: title });
    expect(screen.queryByRole("article")).toBeNull();
    const panel = [...document.querySelectorAll("details")].find((element) =>
      element.textContent?.includes(texts(locale).filters.toggle),
    );
    expect(panel?.open).toBe(true);
    expect(
      screen.getAllByRole("button", { name: texts(locale).filters.clear }).length,
    ).toBeGreaterThan(0);
  });
});

it("applies the stored match filters", async () => {
  profileStore.save(E2E_PROFILE);
  writeMatchFilters(window.localStorage, E2E_FILTERS);
  const bundle = await loadedBundle();
  const load = vi.fn<SnapshotClient["load"]>(async () => bundle);
  renderMatches("en", { load });
  await waitFor(() => expect(screen.getAllByRole("article").length).toBeGreaterThan(0));
  expect(document.querySelector(`article[data-slug="${E2E_SLUGS.private}"]`)).toBeNull();
  expect(load).toHaveBeenCalledTimes(1);
});
