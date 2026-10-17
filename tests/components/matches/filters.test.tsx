// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { displayNumber } from "@/components/matches/display-number";
import { lookupName } from "@/components/profile/display-names";
import type { CoreShard } from "@/data-schema/snapshot";
import type { AppLocale } from "@/i18n/routing";
import { readMatchFilters, writeMatchFilters } from "@/lib/matches/filter-store";
import { EMPTY_MATCH_FILTERS } from "@/lib/matches/filters";
import { profileStore } from "@/lib/profile/store";
import type { SnapshotBundle } from "@/lib/snapshot/client";
import { shardsForMatches } from "@/lib/snapshot/plan";
import { E2E_FILTERS, E2E_NOW, E2E_PROFILE } from "../../fixtures/e2e/profiles";
import { forbidConsole } from "../../lib/profile/no-console";
import { expectNoPhysicalDirection, LOCALES } from "../trust-helpers";
import { bundleClient, catalogs, renderMatches, withFixtureClient } from "./helpers";

forbidConsole();

const fixture = withFixtureClient();

const FIELD_CS = "xx-test-field-cs";
const PROGRAM_PRIVATE = "xx-test-prog-private";
const PROGRAM_ENG = "xx-test-prog-check";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${E2E_NOW}T10:00:00Z`));
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
  profileStore.clear();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function loadedBundle(locale: AppLocale): Promise<SnapshotBundle> {
  return fixture.client().load((manifest) => shardsForMatches(E2E_PROFILE, manifest), locale);
}

function coreOf(bundle: SnapshotBundle): CoreShard {
  if (bundle.core === undefined) throw new Error("the fixture bundle has no core shard");
  return bundle.core;
}

function articleSlugs(container: HTMLElement): string[] {
  return [...container.querySelectorAll("article[data-slug]")].map(
    (element) => element.getAttribute("data-slug") ?? "",
  );
}

// The disclosure control of the filter panel, found the same way the hidden-programs disclosure is:
// by the copy it shows, so a second <details> on the page cannot confuse the test.
function panelSummary(container: HTMLElement, locale: AppLocale): HTMLElement {
  const toggle = catalogs[locale].matches.filters.toggle;
  const found = [...container.querySelectorAll("summary")].find((element) =>
    element.textContent?.includes(toggle),
  );
  if (found === undefined) throw new Error("no filter panel summary");
  return found;
}

function clearButton(locale: AppLocale): HTMLElement {
  const [first] = screen.getAllByRole("button", { name: catalogs[locale].matches.filters.clear });
  if (first === undefined) throw new Error("no Clear filters button");
  return first;
}

describe.each(LOCALES)("My Matches: the filter panel (%s)", (locale) => {
  const t = catalogs[locale].matches.filters;

  it("shows every eligible program and no summary when no filter is set", async () => {
    profileStore.save(E2E_PROFILE);
    const bundle = await loadedBundle(locale);
    const { container } = renderMatches(locale, bundleClient(bundle));
    await waitFor(() => expect(articleSlugs(container).length).toBeGreaterThan(0));
    const total = bundle.programs.flatMap((shard) => shard.programs).length;
    expect(articleSlugs(container)).toHaveLength(total);
    expect(container.querySelector("aside")).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("narrows the list from the panel and writes the choice to the URL and the store", async () => {
    profileStore.save(E2E_PROFILE);
    const bundle = await loadedBundle(locale);
    const user = userEvent.setup();
    const { container } = renderMatches(locale, bundleClient(bundle));
    await waitFor(() => expect(articleSlugs(container)).toContain(PROGRAM_ENG));

    await user.click(panelSummary(container, locale));
    const label = lookupName(coreOf(bundle), bundle.text, "field", FIELD_CS).label;
    await user.click(screen.getByRole("checkbox", { name: label }));

    await waitFor(() => expect(articleSlugs(container)).not.toContain(PROGRAM_ENG));
    expect(articleSlugs(container)).toContain(PROGRAM_PRIVATE);
    expect(window.location.search).toBe(`?field=${FIELD_CS}`);
    // The panel's summary now names the active filter and offers Clear.
    expect(screen.getByRole("button", { name: t.clear })).toBeTruthy();
  });

  it("choosing an institution type hides the private program and writes the URL", async () => {
    profileStore.save(E2E_PROFILE);
    const bundle = await loadedBundle(locale);
    const user = userEvent.setup();
    const { container } = renderMatches(locale, bundleClient(bundle));
    await waitFor(() => expect(articleSlugs(container)).toContain(PROGRAM_PRIVATE));

    await user.click(panelSummary(container, locale));
    await user.click(screen.getByRole("radio", { name: t.institution.public }));

    await waitFor(() => expect(articleSlugs(container)).not.toContain(PROGRAM_PRIVATE));
    expect(window.location.search).toBe("?type=public");
  });

  it("adds a budget without hiding a program and writes it to the URL", async () => {
    profileStore.save(E2E_PROFILE);
    const bundle = await loadedBundle(locale);
    const user = userEvent.setup();
    const { container } = renderMatches(locale, bundleClient(bundle));
    await waitFor(() => expect(articleSlugs(container).length).toBeGreaterThan(0));
    const before = articleSlugs(container);

    await user.click(panelSummary(container, locale));
    await user.type(screen.getByRole("textbox", { name: t.budget.amount.label }), "900");

    await waitFor(() => expect(window.location.search).toContain("budget=90000-EUR-month"));
    expect(articleSlugs(container)).toEqual(before);
  });

  it("seeds from a deep link, which wins over the stored choice", async () => {
    profileStore.save(E2E_PROFILE);
    writeMatchFilters(window.localStorage, E2E_FILTERS);
    window.history.replaceState(null, "", `/?field=${FIELD_CS}`);
    const bundle = await loadedBundle(locale);
    const { container } = renderMatches(locale, bundleClient(bundle));

    await waitFor(() => expect(articleSlugs(container)).not.toContain(PROGRAM_ENG));
    // The stored institution filter is not applied: the URL alone seeded the view.
    expect(articleSlugs(container)).toContain(PROGRAM_PRIVATE);
  });

  it("drops an unknown slug in a deep link instead of crashing", async () => {
    profileStore.save(E2E_PROFILE);
    window.history.replaceState(null, "", "/?field=not%20a%20slug&dest=France&type=charity");
    const bundle = await loadedBundle(locale);
    const { container } = renderMatches(locale, bundleClient(bundle));

    const total = bundle.programs.flatMap((shard) => shard.programs).length;
    await waitFor(() => expect(articleSlugs(container)).toHaveLength(total));
  });

  it("drops a well-formed slug the catalogue does not know, once the bundle is loaded", async () => {
    profileStore.save(E2E_PROFILE);
    window.history.replaceState(null, "", "/?field=old-removed-field&lang=zz&dest=QQ");
    const bundle = await loadedBundle(locale);
    const { container } = renderMatches(locale, bundleClient(bundle));

    const total = bundle.programs.flatMap((shard) => shard.programs).length;
    await waitFor(() => expect(articleSlugs(container)).toHaveLength(total));
    expect(window.location.search).toBe("");
    expect(readMatchFilters(window.localStorage)).toEqual(EMPTY_MATCH_FILTERS);
  });

  it("offers Clear filters when the filters hide every program, and Clear restores the list", async () => {
    profileStore.save(E2E_PROFILE);
    writeMatchFilters(window.localStorage, { ...EMPTY_MATCH_FILTERS, destinations: ["XZ"] });
    const bundle = await loadedBundle(locale);
    const user = userEvent.setup();
    const { container } = renderMatches(locale, bundleClient(bundle));

    const total = bundle.programs.flatMap((shard) => shard.programs).length;
    const title = createTranslator({
      locale,
      messages: catalogs[locale],
      namespace: "matches.states.noMatches",
    })("title", { n: total, count: displayNumber(total, locale) });
    await screen.findByRole("heading", { name: title });
    expect(articleSlugs(container)).toHaveLength(0);

    await user.click(clearButton(locale));
    await waitFor(() => expect(articleSlugs(container)).toHaveLength(total));
    expect(window.location.search).toBe("");
  });

  it("uses no physical direction utility in the panel or the summary", async () => {
    profileStore.save(E2E_PROFILE);
    writeMatchFilters(window.localStorage, E2E_FILTERS);
    const bundle = await loadedBundle(locale);
    const { container } = renderMatches(locale, bundleClient(bundle));
    await waitFor(() => expect(articleSlugs(container).length).toBeGreaterThan(0));
    expectNoPhysicalDirection(container);
  });
});
