import type { Page } from "@playwright/test";
import {
  announcement,
  COMPARE_NAMES,
  comparedNames,
  differencesSwitch,
  expectCompareLoaded,
  FIVE_SAVED,
  GONE_SLUG,
  markedRows,
  openCompare,
  openPicker,
  PICKER,
  pickerBox,
  pickerSummary,
  ROW_IDS,
  rowSection,
  serveTwinOfOk,
  summaryText,
  TWIN_NAME,
  TWIN_SLUG,
  visibleRows,
} from "./support/compare";
import { E2E_PROFILE, E2E_SLUGS, SAVED_KEY } from "./support/fixture-data";
import { expect, test } from "./support/fixtures";
import { E2E_LOCALES } from "./support/locales";
import { openMatches } from "./support/matches";
import { startsWith, translatorFor } from "./support/messages";
import { expectNavBadge, openPlan, savedItem, seedSaved } from "./support/plan";
import { seedProfile } from "./support/seed";

const OK = E2E_SLUGS.ok;
const CHECK = E2E_SLUGS.check;
const FOUNDATION = E2E_SLUGS.foundation;
const STALE = E2E_SLUGS.stale;
const FAIL = E2E_SLUGS.fail;
const FR_ONLY = E2E_SLUGS.frOnly;

async function storedKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => Object.keys(window.localStorage).sort());
}

async function savedSlugs(page: Page): Promise<string[]> {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), SAVED_KEY);
  if (raw === null) return [];
  const parsed: { items: Array<{ slug: string }> } = JSON.parse(raw);
  return parsed.items.map((item) => item.slug);
}

function names(...slugs: Array<keyof typeof COMPARE_NAMES>): string[] {
  return slugs.map((slug) => COMPARE_NAMES[slug]);
}

for (const { locale } of E2E_LOCALES) {
  const t = translatorFor(locale);

  test.describe(`compare saved programs (${locale})`, () => {
    test.describe("with a saved profile", () => {
      test.beforeEach(async ({ page }) => {
        await seedProfile(page, E2E_PROFILE);
      });

      test("the plan page offers Compare with two saved programs and it opens /compare", async ({
        page,
      }) => {
        await seedSaved(page, [savedItem(OK), savedItem(CHECK)]);
        await openPlan(page, locale, t);
        await expect(page.getByText(t("plan.compare.hint"))).toHaveCount(0);
        await page.getByRole("link", { name: t("plan.compare.action"), exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`/${locale}/compare$`));
        await expectCompareLoaded(page, t);
        expect(await comparedNames(page, t)).toEqual(names(OK, CHECK));
      });

      test("the plan page with one saved program says what unlocks Compare and offers no link", async ({
        page,
      }) => {
        await seedSaved(page, [savedItem(OK)]);
        await openPlan(page, locale, t);
        await expect(page.getByText(t("plan.compare.hint"))).toBeVisible();
        await expect(page.getByRole("link", { name: t("plan.compare.action") })).toHaveCount(0);
      });

      test("the page opens with four selected and shows the seven topics with their sources", async ({
        page,
      }) => {
        await seedSaved(page, FIVE_SAVED);
        await openCompare(page, locale, t);

        expect(await comparedNames(page, t)).toEqual(names(OK, CHECK, FOUNDATION, STALE));
        await expect(pickerSummary(page)).toContainText(summaryText(t, 4, 5));

        expect(await visibleRows(page)).toEqual([...ROW_IDS]);
        for (const row of ROW_IDS) {
          await expect(
            rowSection(page, row).getByRole("heading", {
              level: 2,
              name: t(`compare.rows.${row}`),
            }),
          ).toBeVisible();
          // One cell per compared program, in the same order as the heads.
          await expect(rowSection(page, row).locator("li[data-slug]")).toHaveCount(4);
        }

        // Every topic that publishes a value carries its source badge; the scholarships and the
        // result topics list sources inside their own parts.
        const okCell = (row: (typeof ROW_IDS)[number]) =>
          rowSection(page, row).locator(`li[data-slug="${OK}"]`);
        // The cost lines, with their sources, sit in a disclosure under the total.
        await okCell("cost").locator("details > summary").click();
        for (const row of ["tuition", "cost", "language", "deadline", "application"] as const) {
          await expect(
            okCell(row).locator('[data-slot="source-badge"]').first(),
            `source badge in ${row}`,
          ).toBeVisible();
        }
        await expect(
          okCell("tuition").getByRole("link", { name: startsWith(t("sourceBadge.source")) }),
        ).toHaveAttribute("href", /^https:\/\//);
        await expect(page.getByText(t("compare.scholarships.caveat"))).toBeVisible();
        await expect(rowSection(page, "scholarships").locator("li[data-slug]")).toHaveCount(4);
      });

      test("swapping programs updates the grid and the status; the limits are explained", async ({
        page,
      }) => {
        await seedSaved(page, FIVE_SAVED);
        await openCompare(page, locale, t);
        await openPicker(page);

        // Four of five: the fifth waits, and the page says why.
        const limit = t("compare.picker.limit", { max: "4" });
        await expect(page.locator(PICKER).getByText(limit)).toBeVisible();
        await expect(pickerBox(page, FAIL)).toBeDisabled();
        await expect(pickerBox(page, FAIL)).not.toBeChecked();
        await expect(pickerBox(page, FAIL)).toHaveAccessibleDescription(limit);
        for (const slug of [OK, CHECK, FOUNDATION, STALE]) {
          await expect(pickerBox(page, slug)).toBeChecked();
          await expect(pickerBox(page, slug)).toBeEnabled();
        }

        // Untick one: a place is free, the grid loses that column and the status says how many.
        await pickerBox(page, STALE).uncheck();
        await expect(pickerSummary(page)).toContainText(summaryText(t, 3, 5));
        await expect(announcement(page, t("compare.picker.announce", { n: "3" }))).toBeAttached();
        expect(await comparedNames(page, t)).toEqual(names(OK, CHECK, FOUNDATION));
        await expect(page.locator(PICKER).getByText(limit)).toHaveCount(0);
        await expect(pickerBox(page, FAIL)).toBeEnabled();

        // Tick the waiting one: it joins in saved order.
        await pickerBox(page, FAIL).check();
        await expect(pickerSummary(page)).toContainText(summaryText(t, 4, 5));
        await expect(announcement(page, t("compare.picker.announce", { n: "4" }))).toBeAttached();
        expect(await comparedNames(page, t)).toEqual(names(OK, CHECK, FOUNDATION, FAIL));
        await expect(rowSection(page, "result").locator("li[data-slug]")).toHaveCount(4);
        await expect(pickerBox(page, STALE)).toBeDisabled();

        // Down to two: the last two cannot be unticked and the page says so.
        await pickerBox(page, CHECK).uncheck();
        await pickerBox(page, FOUNDATION).uncheck();
        await expect(pickerSummary(page)).toContainText(summaryText(t, 2, 5));
        expect(await comparedNames(page, t)).toEqual(names(OK, FAIL));
        const minimum = t("compare.picker.minimum", { min: "2" });
        await expect(page.locator(PICKER).getByText(minimum)).toBeVisible();
        await expect(pickerBox(page, OK)).toBeDisabled();
        await expect(pickerBox(page, FAIL)).toBeDisabled();
        await expect(pickerBox(page, OK)).toBeChecked();
        await expect(pickerBox(page, OK)).toHaveAccessibleDescription(minimum);
        await expect(rowSection(page, "result").locator("li[data-slug]")).toHaveCount(2);
      });

      test("Show only what differs hides equal topics and keeps the ones with an unknown value", async ({
        page,
      }) => {
        await seedSaved(page, [savedItem(OK), savedItem(FR_ONLY)]);
        await openCompare(page, locale, t);
        expect(await comparedNames(page, t)).toEqual(names(OK, FR_ONLY));

        // Both appear met, teach in French and are open to the same scholarships: the same. Every
        // other topic differs or is unknown on one side, and an unknown value never counts as the same.
        const same = ["result", "language", "scholarships"];
        const differing = ROW_IDS.filter((row) => !same.includes(row));
        expect(await visibleRows(page)).toEqual([...ROW_IDS]);
        expect(await markedRows(page)).toEqual(differing);
        const scholarships = await rowSection(page, "scholarships")
          .locator("li[data-slug]")
          .evaluateAll((cells) =>
            cells.map((cell) => Array.from(cell.querySelectorAll("a"), (a) => a.textContent)),
          );
        expect(scholarships[0]).toHaveLength(2);
        expect(scholarships[0]).toEqual(scholarships[1]);

        await differencesSwitch(page, t).check();
        expect(await visibleRows(page)).toEqual(differing);
        await expect(rowSection(page, "tuition")).toBeVisible();
        await expect(rowSection(page, "tuition")).toContainText(t("domain.cost.missingLine"));
        await expect(page.getByText(t("compare.differences.allSame"))).toHaveCount(0);

        await differencesSwitch(page, t).uncheck();
        expect(await visibleRows(page)).toEqual([...ROW_IDS]);
      });

      test("when nothing differs the switch says so instead of showing an empty page", async ({
        page,
      }) => {
        await serveTwinOfOk(page);
        await seedSaved(page, [savedItem(OK), savedItem(TWIN_SLUG)]);
        await openCompare(page, locale, t);
        expect(await comparedNames(page, t)).toEqual([COMPARE_NAMES[OK], TWIN_NAME]);

        expect(await visibleRows(page)).toEqual([...ROW_IDS]);
        expect(await markedRows(page)).toEqual([]);

        await differencesSwitch(page, t).check();
        await expect(page.getByText(t("compare.differences.allSame"))).toBeVisible();
        expect(await visibleRows(page)).toEqual([]);
        // The heads stay, so the student still sees what was compared.
        expect(await comparedNames(page, t)).toEqual([COMPARE_NAMES[OK], TWIN_NAME]);

        await differencesSwitch(page, t).uncheck();
        await expect(page.getByText(t("compare.differences.allSame"))).toHaveCount(0);
        expect(await visibleRows(page)).toEqual([...ROW_IDS]);
      });

      test("fewer than two saved programs: an empty state that leads to My matches", async ({
        page,
      }) => {
        await seedSaved(page, [savedItem(OK)]);
        await page.goto(`/${locale}/compare`);
        await expect(
          page.getByRole("heading", { level: 1, name: t("compare.title") }),
        ).toBeVisible();
        await expect(
          page.getByRole("heading", { level: 2, name: t("compare.empty.title") }),
        ).toBeVisible();
        await expect(page.locator("section[data-row]")).toHaveCount(0);
        await expect(page.locator(PICKER)).toHaveCount(0);

        await page.getByRole("link", { name: t("compare.empty.action") }).click();
        await expect(page).toHaveURL(new RegExp(`/${locale}/matches$`));
        expect(await savedSlugs(page)).toEqual([OK]);
      });

      test("nothing saved shows the same empty state", async ({ page }) => {
        await page.goto(`/${locale}/compare`);
        await expect(
          page.getByRole("heading", { level: 2, name: t("compare.empty.title") }),
        ).toBeVisible();
        await expect(page.getByRole("link", { name: t("compare.empty.action") })).toBeVisible();
      });

      test("a saved program the data no longer lists is greyed out and cannot be selected", async ({
        page,
      }) => {
        await seedSaved(page, [
          savedItem(OK),
          savedItem(CHECK),
          savedItem(GONE_SLUG, { country: "XB", field: "xx-test-field-cs" }),
        ]);
        await openCompare(page, locale, t);
        expect(await comparedNames(page, t)).toEqual(names(OK, CHECK));
        await expect(pickerSummary(page)).toContainText(summaryText(t, 2, 3));

        await openPicker(page);
        const row = page.locator(`${PICKER} li[data-slug="${GONE_SLUG}"]`);
        await expect(row).toContainText(t("compare.picker.missing"));
        await expect(row).toContainText(GONE_SLUG);
        await expect(pickerBox(page, GONE_SLUG)).toBeDisabled();
        await expect(pickerBox(page, GONE_SLUG)).not.toBeChecked();
        // It stays in the saved list: comparing never removes anything.
        expect(await savedSlugs(page)).toEqual([OK, CHECK, GONE_SLUG]);
      });

      test("two saved programs, only one of them in the data: the page explains why it cannot compare", async ({
        page,
      }) => {
        await seedSaved(page, [
          savedItem(OK),
          savedItem(GONE_SLUG, { country: "XB", field: "xx-test-field-cs" }),
        ]);
        await page.goto(`/${locale}/compare`);
        await expect(
          page.getByRole("heading", { level: 2, name: t("compare.notEnough.title") }),
        ).toBeVisible();
        await expect(page.locator("section[data-row]")).toHaveCount(0);
        await expect(page.locator(PICKER).getByText(t("compare.picker.missing"))).toBeVisible();
      });

      test("Clear my data empties the saved list and the page returns to the empty state", async ({
        page,
      }) => {
        await seedSaved(page, [savedItem(OK), savedItem(CHECK)]);
        await openCompare(page, locale, t);
        await expectNavBadge(page, t, 2);

        await page.getByRole("button", { name: t("clearData.trigger") }).click();
        const dialog = page.getByRole("alertdialog");
        await expect(dialog).toBeVisible();
        await dialog.getByRole("button", { name: t("clearData.confirm") }).click();
        await expect(dialog).toHaveCount(0);

        // Same page, no reload.
        await expect(
          page.getByRole("heading", { level: 2, name: t("compare.empty.title") }),
        ).toBeVisible();
        await expect(page.locator("section[data-row]")).toHaveCount(0);
        expect(await storedKeys(page)).toEqual([]);
      });

      test("from My matches the compare link appears with two saved programs and works", async ({
        page,
      }) => {
        await seedSaved(page, [savedItem(OK), savedItem(CHECK)]);
        await openMatches(page, locale, t);
        const link = page.getByRole("link", { name: t("matches.compare.link", { count: "2" }) });
        await expect(link).toBeVisible();
        await link.click();
        await expect(page).toHaveURL(new RegExp(`/${locale}/compare$`));
        await expectCompareLoaded(page, t);
        expect(await comparedNames(page, t)).toEqual(names(OK, CHECK));
      });

      test("My matches shows no compare link with one saved program", async ({ page }) => {
        await seedSaved(page, [savedItem(OK)]);
        await openMatches(page, locale, t);
        await expectNavBadge(page, t, 1);
        await expect(page.locator('a[href$="/compare"]')).toHaveCount(0);
      });

      test("a reload keeps the saved list and resets the selection to the default", async ({
        page,
      }) => {
        await seedSaved(page, FIVE_SAVED);
        await openCompare(page, locale, t);
        await openPicker(page);
        await pickerBox(page, STALE).uncheck();
        await pickerBox(page, FAIL).check();
        expect(await comparedNames(page, t)).toEqual(names(OK, CHECK, FOUNDATION, FAIL));

        await page.reload();
        await expectCompareLoaded(page, t);
        expect(await comparedNames(page, t)).toEqual(names(OK, CHECK, FOUNDATION, STALE));
        await expect(pickerSummary(page)).toContainText(summaryText(t, 4, 5));
        expect(await savedSlugs(page)).toEqual(FIVE_SAVED.map((item) => item.slug));
        expect(await storedKeys(page)).toContain(SAVED_KEY);
      });
    });

    test("without a profile the saved list is kept and the page asks for a profile", async ({
      page,
    }) => {
      await seedSaved(page, [savedItem(OK), savedItem(CHECK)]);
      await page.goto(`/${locale}/compare`);
      await expect(page.getByRole("heading", { level: 1, name: t("compare.title") })).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 2, name: t("compare.noProfile.title") }),
      ).toBeVisible();
      await expect(page.locator("section[data-row]")).toHaveCount(0);
      await expectNavBadge(page, t, 2);
      expect(await savedSlugs(page)).toEqual([OK, CHECK]);

      await page.getByRole("link", { name: t("compare.noProfile.action") }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/profile$`));
      expect(await savedSlugs(page)).toEqual([OK, CHECK]);
    });
  });
}
