import { expect, type Locator, type Page } from "@playwright/test";

import type { SavedProgram } from "@/lib/saved/saved";

import { E2E_NOW, E2E_SLUGS, SAVED_KEY } from "./fixture-data";
import type { E2eLocale } from "./locales";
import { card } from "./matches";
import { escapeRegExp, startsWith, type Translate } from "./messages";

// Program names of the e2e fixture (plain strings in the data, not copy).
export const PROGRAM_NAMES = {
  [E2E_SLUGS.ok]: "XX Test Programme OK",
  [E2E_SLUGS.check]: "XX Test Programme Check",
  [E2E_SLUGS.foundation]: "XX Test Programme Foundation",
} as const;

// A version that no snapshot has: the plan page does not read it, so a seeded list does not need
// the real one.
const SEEDED_VERSION = "abcdef012345";

// Country and field are what the plan page uses to pick the program shard to load.
const SHARD_OF: Record<string, { country: string; field: string }> = {
  [E2E_SLUGS.ok]: { country: "XB", field: "xx-test-field-cs" },
  [E2E_SLUGS.check]: { country: "XB", field: "xx-test-field-eng" },
  [E2E_SLUGS.foundation]: { country: "XC", field: "xx-test-field-cs" },
};

export function savedItem(slug: string, shard?: { country: string; field: string }): SavedProgram {
  const where = shard ?? SHARD_OF[slug] ?? { country: "XB", field: "xx-test-field-cs" };
  return { slug, ...where, snapshotVersion: SEEDED_VERSION, savedAt: E2E_NOW };
}

// Like seedProfile: written before every document, and only when the key is absent.
export async function seedSaved(page: Page, items: readonly SavedProgram[]): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value);
    },
    [SAVED_KEY, JSON.stringify({ schemaVersion: 1, items })] as const,
  );
}

export function saveButton(scope: Page | Locator, t: Translate): Locator {
  return scope.getByRole("button", { name: startsWith(t("savedProgram.save")) });
}

export function savedButton(scope: Page | Locator, t: Translate): Locator {
  return scope.getByRole("button", { name: startsWith(t("savedProgram.saved")) });
}

// Saves a program from its match card and waits for the button to say so.
export async function saveFromCard(page: Page, t: Translate, slug: string): Promise<void> {
  await saveButton(card(page, slug), t).click();
  await expect(savedButton(card(page, slug), t)).toBeVisible();
}

export function navLink(page: Page, t: Translate, item: "plan" | "matches" | "profile") {
  return page
    .getByRole("navigation", { name: t("nav.label") })
    .getByRole("link", { name: startsWith(t(`nav.${item}`)) });
}

export async function expectNavBadge(page: Page, t: Translate, count: number): Promise<void> {
  await expect(navLink(page, t, "plan")).toContainText(
    t("nav.savedCount", { count: String(count) }),
  );
}

export function planHeading(page: Page): Locator {
  return page.locator('[data-slot="plan-heading"]');
}

// The plan island has settled on a program: its heading (and the plan below it) is on screen.
export async function expectPlanLoaded(page: Page, t: Translate): Promise<void> {
  await expect(page.getByRole("heading", { level: 1, name: t("plan.title") })).toBeVisible();
  await expect(planHeading(page)).toBeVisible();
}

export async function openPlan(page: Page, locale: E2eLocale, t: Translate): Promise<void> {
  await page.goto(`/${locale}/plan`);
  await expectPlanLoaded(page, t);
}

export function switcher(page: Page, t: Translate): Locator {
  return page.getByRole("navigation", { name: t("plan.switcher.label") });
}

// A phone shows the list inside a closed disclosure, a desktop as an open rail.
export async function openSwitcher(page: Page, t: Translate): Promise<void> {
  const rail = switcher(page, t);
  const summary = rail.locator("summary");
  if (await summary.isVisible()) {
    if ((await rail.locator("details").getAttribute("open")) === null) await summary.click();
  }
  await expect(rail.getByRole("list")).toBeVisible();
}

export async function selectProgram(page: Page, t: Translate, name: string): Promise<void> {
  await openSwitcher(page, t);
  await switcher(page, t)
    .getByRole("button", { name: new RegExp(escapeRegExp(name)) })
    .click();
  await expect(planHeading(page)).toHaveText(name);
}

// A saved program missing from the data has no name: its switcher button shows the slug.
export async function selectMissingProgram(page: Page, t: Translate, slug: string): Promise<void> {
  await openSwitcher(page, t);
  await switcher(page, t)
    .getByRole("button", { name: new RegExp(escapeRegExp(slug)) })
    .click();
}

// The step ids of the visible plan, in order: the checkboxes the student can tick.
export async function todoStepIds(page: Page): Promise<string[]> {
  return page
    .locator('ol[data-slot="steps"] > li[data-step]')
    .evaluateAll((items) => items.map((item) => item.getAttribute("data-step") ?? ""));
}

export function stepCheckbox(page: Page, t: Translate, id: string): Locator {
  return page.getByRole("checkbox", { name: t(`domain.checklist.step.${id}.title`), exact: true });
}

export function nextStep(page: Page): Locator {
  return page.locator('[data-slot="next-step"]');
}
