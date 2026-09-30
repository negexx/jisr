// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MatchesClient } from "@/components/matches/matches-client";
import type { Profile } from "@/data-schema/profile";
import type { AppLocale } from "@/i18n/routing";
import { PROFILE_KEY } from "@/lib/profile/storage";
import { profileStore } from "@/lib/profile/store";
import type { SnapshotBundle, SnapshotClient } from "@/lib/snapshot/client";
import { SnapshotError } from "@/lib/snapshot/errors";
import { shardsForMatches } from "@/lib/snapshot/plan";
import { E2E_NOW, E2E_PROFILE, E2E_PROFILE_XB_ONLY } from "../../fixtures/e2e/profiles";
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
    expect(screen.queryByRole("article")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each(
    LOCALES,
  )("says the chosen fields have no programs yet, with an edit link (%s)", async (locale) => {
    profileStore.save(E2E_PROFILE);
    const bundle = await loadedBundle(locale);
    renderMatches(locale, bundleClient({ ...bundle, programs: [], hasPrograms: true }));
    await screen.findByRole("heading", { name: texts(locale).states.noProgramsForFields.title });
    const links = screen.getAllByRole("link", { name: texts(locale).summary.edit });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link.getAttribute("href")).toBe(`/${locale}/profile`);
    expect(screen.queryByRole("article")).toBeNull();
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
  )("says every program is hidden by the preferences and opens the hidden list (%s)", async (locale) => {
    const bundle = await loadedBundle(locale);
    // Every fixture program is outside a destination nobody published.
    const profile = { ...E2E_PROFILE_XB_ONLY, destinations: ["XZ"] };
    profileStore.save(profile);
    renderMatches(locale, bundleClient(bundle));

    const total = bundle.programs.flatMap((shard) => shard.programs).length;
    await screen.findByRole("heading", { name: new RegExp(String(total)) });
    expect(screen.queryByRole("article")).toBeNull();
    const details = document.querySelector("details");
    expect(details?.open).toBe(true);
    expect(
      screen.getAllByRole("link", { name: texts(locale).summary.edit }).length,
    ).toBeGreaterThan(0);
  });
});

it("re-renders the results when the profile changes without reloading the shards", async () => {
  profileStore.save(E2E_PROFILE);
  const bundle = await loadedBundle();
  const load = vi.fn<SnapshotClient["load"]>(async () => bundle);
  renderMatches("en", { load });
  await waitFor(() => expect(screen.getAllByRole("article").length).toBeGreaterThan(0));
  const before = screen.getAllByRole("article").length;
  act(() => {
    profileStore.save({ ...E2E_PROFILE, institutionType: "any" });
  });
  await waitFor(() => expect(screen.getAllByRole("article").length).toBeGreaterThan(before));
  expect(load).toHaveBeenCalledTimes(1);
});
