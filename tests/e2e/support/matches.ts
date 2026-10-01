import { expect, type Page } from "@playwright/test";

import { E2E_EXPECTED, E2E_SLUGS } from "./fixture-data";
import type { E2eLocale } from "./locales";
import type { Translate } from "./messages";

export type GroupName = "ok" | "check" | "foundation" | "failed";
export const GROUP_NAMES: readonly GroupName[] = ["ok", "check", "foundation", "failed"];

// Slugs the matches page shows per group for E2E_PROFILE: the private program is hidden by the
// "public only" preference and is never matched, so it is in no group.
const HIDDEN = Object.keys(E2E_EXPECTED.hidden.E2E_PROFILE);

export function expectedSlugs(group: GroupName): string[] {
  return Object.entries(E2E_EXPECTED.programs)
    .filter(([slug, program]) => program.group === group && !HIDDEN.includes(slug))
    .map(([slug]) => slug);
}

export const HIDDEN_SLUGS: readonly string[] = HIDDEN;

export function groupTitle(t: Translate, group: GroupName): string {
  switch (group) {
    case "ok":
      return t("domain.status.satisfied");
    case "check":
      return t("domain.status.check");
    case "foundation":
      return t("matches.groups.foundation.title");
    case "failed":
      return t("domain.status.not_satisfied");
  }
}

export async function openMatches(page: Page, locale: E2eLocale, t: Translate): Promise<void> {
  await page.goto(`/${locale}/matches`);
  await expectMatchesLoaded(page, t);
}

// Results are on screen: the profile was read, the snapshot loaded and the view computed.
export async function expectMatchesLoaded(page: Page, t: Translate): Promise<void> {
  await expect(page.getByRole("heading", { level: 1, name: t("matches.title") })).toBeVisible();
  await expect(page.locator("article[data-slug]").first()).toBeVisible();
}

export function card(page: Page, slug: string) {
  return page.locator(`article[data-slug="${slug}"]`);
}

export { E2E_SLUGS };
