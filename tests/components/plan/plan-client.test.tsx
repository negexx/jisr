// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppLocale } from "@/i18n/routing";
import { PLAN_KEY } from "@/lib/plan/progress";
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
  PROGRAMS,
  planEntries,
  renderPlan,
  seedProfile,
  seedSaved,
  stepTitle,
  VERSION,
  withFixtureClient,
} from "./helpers";

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
  savedStore.reload();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function progressText(locale: AppLocale, done: number, total: number): string {
  return createTranslator({ locale, messages: catalogs[locale], namespace: "plan.switcher" })(
    "progress",
    { done: String(done), total: String(total) },
  );
}

function skippedHeading(locale: AppLocale, count: number): string {
  return createTranslator({ locale, messages: catalogs[locale], namespace: "plan.steps" })(
    "skippedHeading",
    { count: String(count) },
  );
}

function storedDone(): Record<string, string[]> {
  const raw = window.localStorage.getItem(PLAN_KEY);
  return raw === null ? {} : JSON.parse(raw).done;
}

function storedSlugs(): string[] {
  const raw = window.localStorage.getItem(SAVED_KEY);
  return raw === null ? [] : JSON.parse(raw).items.map((item: { slug: string }) => item.slug);
}

function programHeading(name: string) {
  return screen.findByRole("heading", { level: 2, name });
}

describe.each(LOCALES)("My plan: states (%s)", (locale) => {
  const t = catalogs[locale].plan;

  it("shows a skeleton and one polite status region while the plan loads", () => {
    seedProfile();
    seedSaved(PROGRAMS.ok);
    const { container } = renderPlan(locale, fixture.client());
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    const outputs = container.querySelectorAll("output");
    expect(outputs).toHaveLength(1);
    expect(outputs[0]?.textContent).toBe(t.loading);
  });

  it("shows the empty state with a link to My matches when nothing is saved", async () => {
    seedProfile();
    renderPlan(locale, fixture.client());
    expect(await screen.findByRole("heading", { level: 2, name: t.empty.title })).toBeTruthy();
    expect(screen.getByRole("link", { name: t.empty.action }).getAttribute("href")).toBe(
      `/${locale}/matches`,
    );
    expect(screen.queryByText(t.lead)).toBeNull();
  });

  it("asks for a profile when programs are saved but there is no profile, and keeps the list", async () => {
    seedSaved(PROGRAMS.ok);
    const before = window.localStorage.getItem(SAVED_KEY);
    renderPlan(locale, fixture.client());
    expect(await screen.findByRole("heading", { level: 2, name: t.noProfile.title })).toBeTruthy();
    expect(screen.getByRole("link", { name: t.noProfile.action }).getAttribute("href")).toBe(
      `/${locale}/profile`,
    );
    expect(window.localStorage.getItem(SAVED_KEY)).toBe(before);
  });

  it("shows an alert with Retry when the snapshot cannot be loaded", async () => {
    const user = userEvent.setup();
    seedProfile();
    seedSaved(PROGRAMS.ok);
    const real = fixture.client();
    const load = vi
      .fn<SnapshotClient["load"]>()
      .mockRejectedValueOnce(new SnapshotError("network"))
      .mockImplementation((plan, loadLocale, signal) => real.load(plan, loadLocale, signal));
    renderPlan(locale, { load });

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("heading").textContent).toBe(t.error.title);
    expect(alert.textContent).not.toMatch(/SnapshotError|network|stack/i);
    await user.click(screen.getByRole("button", { name: t.error.retry }));
    const { programs } = await planEntries(real, locale, [PROGRAMS.ok]);
    expect(await programHeading(programs[0]?.name ?? "")).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows a standing notice when this device cannot keep the list", async () => {
    seedProfile();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    // Saving fails to persist: the store keeps the list in memory and reports storage unavailable.
    savedStore.update((current) => ({
      ...current,
      items: [{ ...PROGRAMS.ok, snapshotVersion: VERSION, savedAt: E2E_NOW }],
    }));
    renderPlan(locale, fixture.client());
    expect(await screen.findByText(t.storage.notice, { normalizer: (text) => text })).toBeTruthy();
    const { programs } = await planEntries(fixture.client(), locale, [PROGRAMS.ok]);
    expect(await programHeading(programs[0]?.name ?? "")).toBeTruthy();
  });

  it("shows no storage notice when the device keeps the list", async () => {
    seedProfile();
    seedSaved(PROGRAMS.ok);
    renderPlan(locale, fixture.client());
    const { programs } = await planEntries(fixture.client(), locale, [PROGRAMS.ok]);
    await programHeading(programs[0]?.name ?? "");
    expect(screen.queryByText(t.storage.notice, { normalizer: (text) => text })).toBeNull();
  });
});

describe.each(LOCALES)("My plan: a saved program (%s)", (locale) => {
  const t = catalogs[locale].plan;

  it("shows the first program as the h2, the todo steps in a list and the rest collapsed", async () => {
    seedProfile();
    seedSaved(PROGRAMS.ok, PROGRAMS.stale);
    const { container } = renderPlan(locale, fixture.client());
    const { programs } = await planEntries(fixture.client(), locale, [PROGRAMS.ok, PROGRAMS.stale]);
    const entry = programs[0];
    if (entry === undefined) throw new Error("no entry");
    expect(await programHeading(entry.name)).toBeTruthy();

    const todo = entry.steps.filter((s) => s.status === "todo");
    const skipped = entry.steps.filter((s) => s.status === "skipped");
    expect(todo.length + skipped.length).toBe(10);
    expect(skipped.length).toBeGreaterThan(0);
    const list = container.querySelector<HTMLElement>('ol[data-slot="steps"]');
    if (list === null) throw new Error("no steps list");
    expect(list.querySelectorAll(":scope > li")).toHaveLength(todo.length);
    for (const step of todo) {
      expect(within(list).getByRole("checkbox", { name: stepTitle(locale, step.id) })).toBeTruthy();
    }
    expect(screen.getByText(t.lead)).toBeTruthy();

    const details = container.querySelector<HTMLDetailsElement>(
      "details[data-slot='skipped-steps']",
    );
    if (details === null) throw new Error("no skipped steps disclosure");
    expect(details.open).toBe(false);
    expect(within(details).getByText(skippedHeading(locale, skipped.length))).toBeTruthy();
    expect(details.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    expectNoPhysicalDirection(container);
  });

  it("loads every saved destination: a saved program that exists is never shown as missing", async () => {
    const user = userEvent.setup();
    seedProfile();
    seedSaved(PROGRAMS.ok, PROGRAMS.foundation, PROGRAMS.gone);
    const { container } = renderPlan(locale, fixture.client());
    const { programs } = await planEntries(fixture.client(), locale, [
      PROGRAMS.ok,
      PROGRAMS.foundation,
      PROGRAMS.gone,
    ]);
    const foundation = programs.find((p) => p.slug === PROGRAMS.foundation.slug);
    if (foundation === undefined) throw new Error("the destination XC program must be in the data");
    await programHeading(programs[0]?.name ?? "");

    const nav = screen.getByRole("navigation", { name: t.switcher.label });
    // Exactly one saved slug is absent from the loaded shards: the one that is not in the data.
    expect(within(nav).getAllByText(t.switcher.missing)).toHaveLength(1);

    await user.click(within(nav).getByRole("button", { name: new RegExp(foundation.name) }));
    expect(await programHeading(foundation.name)).toBeTruthy();
    // The institution comes from the XC institutions shard, not from the slug fallback.
    expect(foundation.institutionName).not.toBe("xx-test-inst-pub-c");
    expect(container.textContent).toContain(foundation.institutionName);
    expect(screen.queryByText(t.missing.title)).toBeNull();
  });

  it("shows the no-longer-in-our-data card for a missing slug and Remove forgets its ticks", async () => {
    const user = userEvent.setup();
    seedProfile();
    seedSaved(PROGRAMS.gone, PROGRAMS.ok);
    window.localStorage.setItem(
      PLAN_KEY,
      JSON.stringify({
        schemaVersion: 1,
        done: { [PROGRAMS.gone.slug]: ["documents"], [PROGRAMS.ok.slug]: ["documents"] },
      }),
    );
    renderPlan(locale, fixture.client());

    expect(await screen.findByRole("heading", { level: 2, name: t.missing.title })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: t.program.remove }));

    await waitFor(() => expect(storedSlugs()).toEqual([PROGRAMS.ok.slug]));
    expect(storedDone()).toEqual({ [PROGRAMS.ok.slug]: ["documents"] });
    const { programs } = await planEntries(fixture.client(), locale, [PROGRAMS.ok]);
    expect(await programHeading(programs[0]?.name ?? "")).toBeTruthy();
  });
});

describe.each(LOCALES)("My plan: ticking steps (%s)", (locale) => {
  it("persists a tick, updates progress and moves the next step; skipped steps are not counted", async () => {
    const user = userEvent.setup();
    seedProfile();
    seedSaved(PROGRAMS.ok, PROGRAMS.stale);
    const { container } = renderPlan(locale, fixture.client());
    const { programs } = await planEntries(fixture.client(), locale, [PROGRAMS.ok, PROGRAMS.stale]);
    const entry = programs[0];
    if (entry === undefined) throw new Error("no entry");
    const todo = entry.steps.filter((s) => s.status === "todo");
    const [first, second] = todo;
    if (first === undefined || second === undefined) throw new Error("need two todo steps");
    await programHeading(entry.name);

    const nav = screen.getByRole("navigation", { name: catalogs[locale].plan.switcher.label });
    const activeButton = () => within(nav).getByRole("button", { current: true });
    const next = () => container.querySelector('[data-slot="next-step"]')?.textContent ?? "";
    expect(activeButton().textContent).toContain(progressText(locale, 0, todo.length));
    expect(next()).toContain(stepTitle(locale, first.id));

    const box = () =>
      screen.getByRole<HTMLInputElement>("checkbox", { name: stepTitle(locale, first.id) });
    await user.click(box());

    expect(storedDone()).toEqual({ [entry.slug]: [first.id] });
    expect(activeButton().textContent).toContain(progressText(locale, 1, todo.length));
    expect(next()).toContain(stepTitle(locale, second.id));
    expect(box().checked).toBe(true);

    await user.click(box());
    expect(storedDone()).toEqual({});
    expect(activeButton().textContent).toContain(progressText(locale, 0, todo.length));
  });
});

describe.each(LOCALES)("My plan: match status (%s)", (locale) => {
  it("shows the match group only through the shared badge, never green for a stale program", async () => {
    const user = userEvent.setup();
    seedProfile();
    seedSaved(PROGRAMS.ok, PROGRAMS.stale);
    const { container } = renderPlan(locale, fixture.client());
    const { programs } = await planEntries(fixture.client(), locale, [PROGRAMS.ok, PROGRAMS.stale]);
    const [ok, stale] = programs;
    if (ok === undefined || stale === undefined) throw new Error("need both programs");
    await programHeading(ok.name);
    expect(container.querySelector("section [data-group]")?.getAttribute("data-group")).toBe(
      ok.group,
    );

    const nav = screen.getByRole("navigation", { name: catalogs[locale].plan.switcher.label });
    await user.click(within(nav).getByRole("button", { name: new RegExp(stale.name) }));
    await programHeading(stale.name);
    const badge = container.querySelector("section [data-group]");
    expect(badge?.getAttribute("data-group")).toBe(stale.group);
    expect(stale.group).not.toBe("ok");
  });
});
