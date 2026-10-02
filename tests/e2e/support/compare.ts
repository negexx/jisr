import { createHash } from "node:crypto";
import { expect, type Locator, type Page } from "@playwright/test";

import type { ProgramsShard } from "@/data-schema/snapshot";

import { E2E_SLUGS } from "./fixture-data";
import type { E2eLocale } from "./locales";
import { escapeRegExp, type Translate } from "./messages";
import { PROGRAM_NAMES, savedItem } from "./plan";
import { MANIFEST_URL, readManifest, shardPath } from "./snapshot";

// Program names of the e2e fixture beyond the three in PROGRAM_NAMES (plain strings in the data).
export const COMPARE_NAMES = {
  ...PROGRAM_NAMES,
  [E2E_SLUGS.stale]: "XX Test Programme Stale",
  [E2E_SLUGS.fail]: "XX Test Programme Fail",
  [E2E_SLUGS.frOnly]: "XX Test Programme French Only",
} as const;

export const GONE_SLUG = "xx-test-prog-gone";
export const TWIN_SLUG = "xx-test-prog-twin";
export const TWIN_NAME = "XX Test Programme Twin";

// The seven topics in display order (ids are structure, headings come from the catalogue).
export const ROW_IDS = [
  "result",
  "tuition",
  "cost",
  "language",
  "deadline",
  "scholarships",
  "application",
] as const;
export type RowId = (typeof ROW_IDS)[number];

// Saved programs that exist in the e2e data, in a fixed order: the first four are the default
// selection, the fifth waits for a free place.
export const FIVE_SAVED = [
  E2E_SLUGS.ok,
  E2E_SLUGS.check,
  E2E_SLUGS.foundation,
  E2E_SLUGS.stale,
  E2E_SLUGS.fail,
].map((slug) => savedItem(slug));

export const PICKER = '[data-slot="compare-picker"]';

export async function openCompare(page: Page, locale: E2eLocale, t: Translate): Promise<void> {
  await page.goto(`/${locale}/compare`);
  await expectCompareLoaded(page, t);
}

// The island has settled on a comparison: the programs' heads and the first topic are on screen.
export async function expectCompareLoaded(page: Page, t: Translate): Promise<void> {
  await expect(page.getByRole("heading", { level: 1, name: t("compare.title") })).toBeVisible();
  await expect(programHeads(page, t)).toBeVisible();
}

export function programHeads(page: Page, t: Translate): Locator {
  return page.getByRole("list", { name: t("compare.cells.programLabel"), exact: true });
}

// Names of the programs being compared, left to right.
export async function comparedNames(page: Page, t: Translate): Promise<string[]> {
  const names = await programHeads(page, t).getByRole("link").allInnerTexts();
  return names.map((name) => name.trim());
}

export function rowSection(page: Page, row: RowId): Locator {
  return page.locator(`section[data-row="${row}"]`);
}

export async function visibleRows(page: Page): Promise<string[]> {
  return page
    .locator("section[data-row]")
    .evaluateAll((sections) => sections.map((s) => s.getAttribute("data-row") ?? ""));
}

export async function markedRows(page: Page): Promise<string[]> {
  return page
    .locator("section[data-row]")
    .evaluateAll((sections) =>
      sections
        .filter((s) => s.querySelector('[data-slot="differs-marker"]') !== null)
        .map((s) => s.getAttribute("data-row") ?? ""),
    );
}

export function pickerSummary(page: Page): Locator {
  return page.locator(`${PICKER} > summary`);
}

// A phone starts with the list closed, a desktop with it open.
export async function openPicker(page: Page): Promise<void> {
  const details = page.locator(PICKER);
  if ((await details.getAttribute("open")) === null) await pickerSummary(page).click();
  await expect(details).toHaveAttribute("open", "");
}

export function pickerBox(page: Page, slug: string): Locator {
  return page.locator(`${PICKER} li[data-slug="${slug}"] input[type="checkbox"]`);
}

export function summaryText(t: Translate, selected: number, total: number): string {
  return t("compare.picker.summary", { selected: String(selected), total: String(total) });
}

export function differencesSwitch(page: Page, t: Translate): Locator {
  return page.getByRole("checkbox", { name: t("compare.differences.label"), exact: true });
}

// The polite status the island keeps for the whole life of the page.
export function announcement(page: Page, text: string): Locator {
  return page.getByRole("status").filter({ hasText: text });
}

export function nameRegExp(slug: keyof typeof COMPARE_NAMES): RegExp {
  return new RegExp(`^${escapeRegExp(COMPARE_NAMES[slug])}$`);
}

// Serves a copy of the OK program under another slug and name from the program shard it lives in,
// with the manifest's length and SHA-256 recomputed, so the integrity check still passes. The twin
// has the same value in every topic, which no pair of fixture programs has (unknown values never
// count as the same), and it is what lets the "nothing differs" state be shown.
export async function serveTwinOfOk(page: Page): Promise<void> {
  const manifest = await readManifest(page);
  const name = "programs.XB.xx-test-field-cs";
  const entry = manifest.shards[name];
  if (entry === undefined) throw new Error(`shard ${name} is not in the manifest`);
  const shard: ProgramsShard = await (await page.request.get(shardPath(manifest, name))).json();
  const ok = shard.programs.find((program) => program.slug === E2E_SLUGS.ok);
  if (ok === undefined) throw new Error("the OK program is not in its shard");
  const changed: ProgramsShard = {
    ...shard,
    programs: [...shard.programs, { ...ok, slug: TWIN_SLUG, name: TWIN_NAME }],
  };
  const body = Buffer.from(JSON.stringify(changed));
  const next = {
    ...manifest,
    shards: {
      ...manifest.shards,
      [name]: {
        ...entry,
        bytes: body.length,
        sha256: createHash("sha256").update(body).digest("hex"),
      },
    },
  };
  await page.route(MANIFEST_URL, (route) => route.fulfill({ json: next }));
  await page.route(`**/snapshots/${entry.file}`, (route) =>
    route.fulfill({ body, contentType: "application/json" }),
  );
}
