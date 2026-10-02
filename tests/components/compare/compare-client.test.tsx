// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppLocale } from "@/i18n/routing";
import { MAX_COMPARE, MIN_COMPARE } from "@/lib/constants";
import { COMPARE_ROWS } from "@/lib/journey/compare-view";
import { PROFILE_KEY } from "@/lib/profile/storage";
import { profileStore } from "@/lib/profile/store";
import { SAVED_KEY } from "@/lib/saved/saved";
import { savedStore } from "@/lib/saved/store";
import type { SnapshotClient } from "@/lib/snapshot/client";
import { SnapshotError } from "@/lib/snapshot/errors";
import { E2E_NOW } from "../../fixtures/e2e/profiles";
import { forbidConsole } from "../../lib/profile/no-console";
import { expectNoPhysicalDirection, LOCALES } from "../trust-helpers";
import {
  catalogs,
  compareView,
  REFS,
  renderCompare,
  seedAll,
  seedProfile,
  seedSaved,
  VERSION,
  withFixtureClient,
} from "./helpers";

// The compute-error test makes the view builder throw once.
const builder = vi.hoisted(() => ({ fail: false }));
vi.mock("@/lib/journey/compare-view", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/journey/compare-view")>();
  return {
    ...actual,
    buildCompareView: (...args: Parameters<typeof actual.buildCompareView>) => {
      if (builder.fail) throw new Error("boom: secret profile value");
      return actual.buildCompareView(...args);
    },
  };
});

forbidConsole();

const fixture = withFixtureClient();

beforeEach(() => {
  builder.fail = false;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${E2E_NOW}T10:00:00Z`));
});

afterEach(() => {
  cleanup();
  profileStore.clear();
  window.localStorage.clear();
  savedStore.reload();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function tr(locale: AppLocale, namespace: string, key: string, values?: Record<string, string>) {
  const translate = createTranslator({
    locale,
    messages: catalogs[locale],
    namespace: namespace as never,
  }) as unknown as (key: string, values?: Record<string, string>) => string;
  return translate(key, values);
}

function rowSections(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>("section[data-row]")];
}

async function shown(container: HTMLElement) {
  await waitFor(() => expect(rowSections(container).length).toBeGreaterThan(0));
}

function comparedSlugs(container: HTMLElement): string[] {
  const first = container.querySelector<HTMLElement>("section[data-row]");
  return [...(first?.querySelectorAll<HTMLElement>(":scope > ul > li") ?? [])].map(
    (li) => li.dataset.slug ?? "",
  );
}

function storedKeys(): string[] {
  return Object.keys(window.localStorage).sort();
}

describe.each(LOCALES)("Compare: states (%s)", (locale) => {
  const t = catalogs[locale].compare;

  it("shows a skeleton and one polite status region while loading", () => {
    seedAll(REFS.ok, REFS.stale);
    const { container } = renderCompare(locale, fixture.client());
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    const outputs = container.querySelectorAll("output");
    expect(outputs).toHaveLength(1);
    expect(outputs[0]?.textContent).toBe(t.loading);
  });

  it.each([
    ["nothing", []],
    ["one program", [REFS.ok]],
  ])("shows the same empty state with a link to My matches for %s", async (_name, refs) => {
    seedProfile();
    seedSaved(...refs);
    const requested = fixture.requests.length;
    renderCompare(locale, fixture.client());
    expect(await screen.findByRole("heading", { level: 2, name: t.empty.title })).toBeTruthy();
    expect(screen.getByRole("link", { name: t.empty.action }).getAttribute("href")).toBe(
      `/${locale}/matches`,
    );
    expect(screen.queryByText(t.lead, { normalizer: (text) => text })).toBeNull();
    // Nothing to compare: no shard is fetched.
    expect(fixture.requests.length).toBe(requested);
  });

  it("asks for a profile when programs are saved but there is no profile, and keeps the list", async () => {
    seedSaved(REFS.ok, REFS.stale);
    const before = window.localStorage.getItem(SAVED_KEY);
    renderCompare(locale, fixture.client());
    expect(await screen.findByRole("heading", { level: 2, name: t.noProfile.title })).toBeTruthy();
    expect(screen.getByRole("link", { name: t.noProfile.action }).getAttribute("href")).toBe(
      `/${locale}/profile`,
    );
    expect(window.localStorage.getItem(SAVED_KEY)).toBe(before);
  });

  it("tells the student an unreadable saved profile was cleared, and dismisses the notice", async () => {
    const user = userEvent.setup();
    seedSaved(REFS.ok, REFS.stale);
    window.localStorage.setItem(PROFILE_KEY, "{not json");
    renderCompare(locale, fixture.client());
    expect(await screen.findByText(t.reset.notice, { normalizer: (text) => text })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: t.noProfile.title })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: t.reset.dismiss }));
    expect(screen.queryByText(t.reset.notice, { normalizer: (text) => text })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: t.noProfile.title })).toBeTruthy();
  });

  it("shows an alert with Retry when the snapshot cannot be loaded", async () => {
    const user = userEvent.setup();
    seedAll(REFS.ok, REFS.stale);
    const real = fixture.client();
    const load = vi
      .fn<SnapshotClient["load"]>()
      .mockRejectedValueOnce(new SnapshotError("network"))
      .mockImplementation((plan, loadLocale, signal) => real.load(plan, loadLocale, signal));
    const { container } = renderCompare(locale, { load });

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("heading").textContent).toBe(t.error.title);
    expect(alert.textContent).not.toMatch(/SnapshotError|network|stack/i);
    await user.click(screen.getByRole("button", { name: t.error.retry }));
    await shown(container);
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows an error without Retry, and no internal message, when the comparison cannot be computed", async () => {
    builder.fail = true;
    seedAll(REFS.ok, REFS.stale);
    renderCompare(locale, fixture.client());
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("heading").textContent).toBe(t.error.title);
    expect(within(alert).queryByRole("button")).toBeNull();
    expect(document.body.textContent).not.toMatch(/boom|secret/);
  });

  it("shows a standing notice when this device cannot keep the list", async () => {
    seedProfile();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    savedStore.update((current) => ({
      ...current,
      items: [REFS.ok, REFS.stale].map((ref) => ({
        ...ref,
        snapshotVersion: VERSION,
        savedAt: E2E_NOW,
      })),
    }));
    const { container } = renderCompare(locale, fixture.client());
    expect(await screen.findByText(t.storage.notice, { normalizer: (text) => text })).toBeTruthy();
    await shown(container);
  });

  it("shows no storage notice when the device keeps the list", async () => {
    seedAll(REFS.ok, REFS.stale);
    const { container } = renderCompare(locale, fixture.client());
    await shown(container);
    expect(screen.queryByText(t.storage.notice, { normalizer: (text) => text })).toBeNull();
  });

  it("says fewer than 2 saved programs are in the data, and still lists the missing ones greyed out", async () => {
    seedAll(REFS.ok, REFS.gone);
    const { container } = renderCompare(locale, fixture.client());
    expect(await screen.findByRole("heading", { level: 2, name: t.notEnough.title })).toBeTruthy();
    expect(container.querySelector("section[data-row]")).toBeNull();
    expect(screen.queryByText(t.lead, { normalizer: (text) => text })).toBeNull();
    const gone = container.querySelector<HTMLElement>(`[data-slug="${REFS.gone.slug}"]`);
    if (gone === null) throw new Error("the missing program is not listed");
    const box = within(gone).getByRole<HTMLInputElement>("checkbox");
    expect(box.disabled).toBe(true);
    expect(box.checked).toBe(false);
    expect(container.querySelector("details")?.open).toBe(true);
    // Nothing is being compared: no "Comparing 1 of 2" and no "keep at least 2" line.
    const picker = container.querySelector("details")?.textContent ?? "";
    expect(picker).not.toContain(
      tr(locale, "compare.picker", "summary", { selected: "1", total: "2" }),
    );
    expect(picker).not.toContain(tr(locale, "compare.picker", "minimum", { min: "2" }));
  });
});

describe.each(LOCALES)("Compare: the comparison (%s)", (locale) => {
  const t = catalogs[locale].compare;

  it("shows the lead, the picker, the switch and one section per row for the saved programs", async () => {
    seedAll(REFS.ok, REFS.stale, REFS.fail);
    const { container } = renderCompare(locale, fixture.client());
    await shown(container);
    expect(screen.getByText(t.lead, { normalizer: (text) => text })).toBeTruthy();
    expect(rowSections(container)).toHaveLength(COMPARE_ROWS.length);
    expect(comparedSlugs(container)).toEqual([REFS.ok.slug, REFS.stale.slug, REFS.fail.slug]);
    // Order in the DOM: picker, then the switch, then the grid.
    const picker = container.querySelector("details");
    const toggle = screen.getByRole("checkbox", { name: t.differences.label });
    const grid = container.querySelector("[data-slot='compare-grid']");
    if (picker === null || grid === null) throw new Error("picker or grid missing");
    expect(picker.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(toggle.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelectorAll("[aria-busy='true']")).toHaveLength(0);
    expectNoPhysicalDirection(container);
  });

  it("compares the first four saved programs by default and leaves the rest unticked", async () => {
    seedAll(REFS.ok, REFS.stale, REFS.fail, REFS.check, REFS.private);
    const { container } = renderCompare(locale, fixture.client());
    await shown(container);
    expect(comparedSlugs(container)).toEqual([
      REFS.ok.slug,
      REFS.stale.slug,
      REFS.fail.slug,
      REFS.check.slug,
    ]);
    const fifth = container.querySelector<HTMLElement>(`[data-slug="${REFS.private.slug}"] input`);
    expect((fifth as HTMLInputElement).checked).toBe(false);
    expect((fifth as HTMLInputElement).disabled).toBe(true);
    expect(
      screen.getByText(tr(locale, "compare.picker", "limit", { max: String(MAX_COMPARE) })),
    ).toBeTruthy();
    const summary = container.querySelector("summary");
    expect(summary?.textContent).toContain(
      tr(locale, "compare.picker", "summary", { selected: "4", total: "5" }),
    );
  });

  it("swaps a program in and out, keeps the saved order and announces the number compared", async () => {
    const user = userEvent.setup();
    seedAll(REFS.ok, REFS.stale, REFS.fail, REFS.check, REFS.private);
    const { container } = renderCompare(locale, fixture.client());
    await shown(container);
    const all = [REFS.ok, REFS.stale, REFS.fail, REFS.check, REFS.private];
    const view = await compareView(
      fixture.client(),
      locale,
      all,
      all.map((ref) => ref.slug),
    );
    const nameOf = (slug: string) => view.programs.find((p) => p.slug === slug)?.name ?? "";
    const checkName = nameOf(REFS.check.slug);

    await user.click(screen.getByRole("checkbox", { name: new RegExp(checkName) }));
    await waitFor(() =>
      expect(comparedSlugs(container)).toEqual([REFS.ok.slug, REFS.stale.slug, REFS.fail.slug]),
    );
    const status = container.querySelector("output.sr-only");
    expect(status?.textContent).toContain(tr(locale, "compare.picker", "announce", { n: "3" }));
    // The freed place goes to the fifth program, in saved order.
    await user.click(screen.getByRole("checkbox", { name: new RegExp(nameOf(REFS.private.slug)) }));
    await waitFor(() =>
      expect(comparedSlugs(container)).toEqual([
        REFS.ok.slug,
        REFS.stale.slug,
        REFS.fail.slug,
        REFS.private.slug,
      ]),
    );
    expect(status?.textContent).toContain(tr(locale, "compare.picker", "announce", { n: "4" }));
    expect(container.querySelectorAll("output.sr-only")).toHaveLength(1);
  });

  it("never goes below the minimum: the ticked boxes are disabled and say why", async () => {
    seedAll(REFS.ok, REFS.stale);
    const { container } = renderCompare(locale, fixture.client());
    await shown(container);
    const boxes = [
      ...container.querySelectorAll<HTMLInputElement>("details input[type='checkbox']"),
    ];
    expect(boxes).toHaveLength(2);
    for (const box of boxes) {
      expect(box.checked).toBe(true);
      expect(box.disabled).toBe(true);
    }
    expect(
      screen.getByText(tr(locale, "compare.picker", "minimum", { min: String(MIN_COMPARE) })),
    ).toBeTruthy();
  });

  it("loads every saved destination once: a saved program that exists is never missing, and selecting reloads nothing", async () => {
    const user = userEvent.setup();
    seedAll(REFS.ok, REFS.foundation, REFS.gone, REFS.stale, REFS.fail);
    const { container } = renderCompare(locale, fixture.client());
    await shown(container);
    const gone = container.querySelector<HTMLElement>(`[data-slug="${REFS.gone.slug}"]`);
    expect(gone?.textContent).toContain(t.picker.missing);
    // Exactly one saved slug is absent from the loaded shards; the XC program is present.
    expect(container.querySelectorAll("details [data-slug]")).toHaveLength(5);
    const foundation = container.querySelector<HTMLElement>(
      `details [data-slug="${REFS.foundation.slug}"]`,
    );
    expect(foundation?.textContent).not.toContain(t.picker.missing);
    expect(comparedSlugs(container)).toContain(REFS.foundation.slug);
    expect(comparedSlugs(container)).not.toContain(REFS.gone.slug);

    const requests = fixture.requests.length;
    const box = container.querySelector<HTMLInputElement>(
      `details [data-slug="${REFS.fail.slug}"] input`,
    );
    if (box === null) throw new Error("no fail checkbox");
    await user.click(box);
    await user.click(box);
    expect(fixture.requests.length).toBe(requests);
  });

  it("stores nothing: no new key, no cookie, no slug outside the saved list", async () => {
    const user = userEvent.setup();
    seedAll(REFS.ok, REFS.stale, REFS.fail);
    const { container } = renderCompare(locale, fixture.client());
    await shown(container);
    const before = storedKeys();
    const savedBefore = window.localStorage.getItem(SAVED_KEY);
    const box = container.querySelector<HTMLInputElement>(
      `details [data-slug="${REFS.fail.slug}"] input`,
    );
    if (box === null) throw new Error("no fail checkbox");
    await user.click(box);
    await user.click(screen.getByRole("checkbox", { name: t.differences.label }));
    expect(storedKeys()).toEqual(before);
    expect(window.localStorage.getItem(SAVED_KEY)).toBe(savedBefore);
    expect(window.localStorage.getItem(PROFILE_KEY)).not.toBeNull();
    expect(document.cookie).toBe("");
    expect(window.location.href).not.toContain(REFS.ok.slug);
  });

  it("hides the rows that are equal when the switch is on, and keeps the differing ones marked", async () => {
    const user = userEvent.setup();
    seedAll(REFS.ok, REFS.stale, REFS.fail);
    const { container } = renderCompare(locale, fixture.client());
    await shown(container);
    const view = await compareView(
      fixture.client(),
      locale,
      [REFS.ok, REFS.stale, REFS.fail],
      [REFS.ok.slug, REFS.stale.slug, REFS.fail.slug],
    );
    const differing = COMPARE_ROWS.filter((id) => view.differs[id]);
    expect(
      container.querySelectorAll("[data-slot='differs-marker']"),
      "markers show with the switch off",
    ).toHaveLength(differing.length);
    const toggle = screen.getByRole<HTMLInputElement>("checkbox", { name: t.differences.label });
    expect(toggle.checked).toBe(false);
    await user.click(toggle);
    expect(rowSections(container).map((s) => s.dataset.row)).toEqual(differing);
    expect(toggle.checked).toBe(true);
    await user.click(toggle);
    expect(rowSections(container)).toHaveLength(COMPARE_ROWS.length);
  });

  it("never shows a stale program as met, and shows the deadline as DD/MM/YYYY with Latin digits", async () => {
    seedAll(REFS.ok, REFS.stale);
    const { container } = renderCompare(locale, fixture.client());
    await shown(container);
    const result = container.querySelector<HTMLElement>("section[data-row='result']");
    const stale = result?.querySelector<HTMLElement>(`li[data-slug="${REFS.stale.slug}"]`);
    expect(stale?.querySelector('[data-group="ok"]')).toBeNull();
    expect(container.textContent).not.toMatch(/[٠-٩۰-۹]/u);
    expect(container.textContent).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it("makes no ranking claim", async () => {
    seedAll(REFS.ok, REFS.stale, REFS.fail);
    const { container } = renderCompare(locale, fixture.client());
    await shown(container);
    expect(container.textContent).not.toMatch(
      /\b(best|cheapest|recommended|meilleur|moins cher|recommandé)\b|الأفضل|الأرخص|موصى/iu,
    );
  });
});
