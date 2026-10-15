import type { Page } from "@playwright/test";

import type { ChecklistStepId } from "@/domain/types";

import {
  comparedNames,
  expectCompareLoaded,
  GONE_SLUG,
  openCompare,
  openPicker,
  PICKER,
  pickerBox,
  pickerSummary,
  programHeads,
  summaryText,
} from "./support/compare";
import { BASE_ORIGIN, E2E_PROFILE, E2E_SLUGS, PLAN_KEY, SAVED_KEY } from "./support/fixture-data";
import { expect, test } from "./support/fixtures";
import { E2E_LOCALES } from "./support/locales";
import { card, openMatches } from "./support/matches";
import { escapeRegExp, startsWith, translatorFor } from "./support/messages";
import {
  expectNavBadge,
  expectPlanLoaded,
  openPlan,
  openSwitcher,
  PROGRAM_NAMES,
  planHeading,
  saveButton,
  savedButton,
  savedItem,
  seedSaved,
  selectMissingProgram,
  stepCheckbox,
  switcher,
  todoStepIds,
} from "./support/plan";
import { seedProfile } from "./support/seed";
import { recordTraffic } from "./support/traffic";

const OK = E2E_SLUGS.ok;
const CHECK = E2E_SLUGS.check;
const FOUNDATION = E2E_SLUGS.foundation;
// The fixture program that was renamed: its record lists this slug under formerSlugs.
const FORMER = "xx-test-prog-old-ok";
const NEVER_EXISTED = "xx-test-prog-never-existed";
// Country and field of the renamed program: what the plan page uses to pick its shard.
const OK_SHARD = { country: "XB", field: "xx-test-field-cs" } as const;
// Every program lists the documents step as a to-do, so it is always on the plan; the specs tick
// it under the old slug as a student would have before the rename.
const TICKED_BEFORE_RENAME: ChecklistStepId = "documents";

async function storedValue(page: Page, key: string): Promise<string | null> {
  return page.evaluate((name) => window.localStorage.getItem(name), key);
}

async function savedSlugs(page: Page): Promise<string[]> {
  const raw = await storedValue(page, SAVED_KEY);
  if (raw === null) return [];
  const parsed: { items: Array<{ slug: string }> } = JSON.parse(raw);
  return parsed.items.map((item) => item.slug);
}

async function doneSteps(page: Page, slug: string): Promise<string[]> {
  const raw = await storedValue(page, PLAN_KEY);
  if (raw === null) return [];
  const parsed: { done: Record<string, string[]> } = JSON.parse(raw);
  return parsed.done[slug] ?? [];
}

// Like seedSaved: written before every document, and only when the key is absent.
async function seedTicks(page: Page, done: Record<string, ChecklistStepId[]>): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value);
    },
    [PLAN_KEY, JSON.stringify({ schemaVersion: 1, done })] as const,
  );
}

// The locale of an unknown path is unknown, so src/app/global-not-found.tsx answers in all three
// languages, French first, each block with its own lang. empty-and-errors.spec.ts holds the whole
// contract; this is enough to tell that page from a rendered program.
async function expectGlobalNotFound(page: Page): Promise<void> {
  const fr = translatorFor("fr");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(fr("notFound.title"));
  const blocks = page.locator("main section");
  await expect(blocks).toHaveCount(3);
  const languages = await blocks.evaluateAll((sections) =>
    sections.map((section) => section.getAttribute("lang")),
  );
  expect(languages).toEqual(["fr", "en", "ar"]);
}

for (const { locale, dir } of E2E_LOCALES) {
  const t = translatorFor(locale);

  test.describe(`slug aliases (${locale})`, () => {
    test("the old address answers with a redirect to the current page", async ({ request }) => {
      const response = await request.get(`/${locale}/programs/${FORMER}`, { maxRedirects: 0 });

      // A real HTTP redirect, never a rendered copy of the page (ADR 0013, decision 10): 307 today,
      // 308 once a rename has lived through a data cycle.
      expect([307, 308]).toContain(response.status());
      const target = new URL(response.headers().location ?? "", BASE_ORIGIN);
      expect(target.pathname).toBe(`/${locale}/programs/${OK}`);
      expect(target.search).toBe("");
    });

    test("a browser that opens the old address ends on the current page in the same language", async ({
      page,
    }) => {
      const response = await page.goto(`/${locale}/programs/${FORMER}`);

      await expect(page).toHaveURL(new RegExp(`/${locale}/programs/${OK}$`));
      expect(response?.request().redirectedFrom()?.url()).toBe(
        `${BASE_ORIGIN}/${locale}/programs/${FORMER}`,
      );
      expect(response?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("html")).toHaveAttribute("dir", dir);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(PROGRAM_NAMES[OK]);
    });

    test("a slug that never existed is still the 404 page, while the old slug resolves", async ({
      page,
    }) => {
      await page.goto(`/${locale}/programs/${FORMER}`);
      await expect(page).toHaveURL(new RegExp(`/${locale}/programs/${OK}$`));

      const unknown = await page.goto(`/${locale}/programs/${NEVER_EXISTED}`);
      expect(unknown?.status()).toBe(404);
      expect(unknown?.request().redirectedFrom()).toBeNull();
      await expectGlobalNotFound(page);
      expect(await page.content()).not.toContain(NEVER_EXISTED);
    });

    test.describe("with a saved profile", () => {
      test.beforeEach(async ({ page }) => {
        await seedProfile(page, E2E_PROFILE);
      });

      test("My matches shows a program saved under the old slug as saved", async ({ page }) => {
        await seedSaved(page, [savedItem(FORMER, OK_SHARD)]);
        await openMatches(page, locale, t);

        await expect(card(page, OK)).toHaveCount(1);
        await expect(card(page, FORMER)).toHaveCount(0);
        await expect(savedButton(card(page, OK), t)).toBeVisible();
        await expect(saveButton(card(page, CHECK), t)).toBeVisible();
        await expectNavBadge(page, t, 1);
        expect(await savedSlugs(page)).toEqual([FORMER]);
      });

      test("the plan opens a program saved under the old slug, with the steps ticked under it", async ({
        page,
      }) => {
        const traffic = recordTraffic(page);
        await seedSaved(page, [savedItem(FORMER, OK_SHARD)]);
        await seedTicks(page, { [FORMER]: [TICKED_BEFORE_RENAME] });
        await openPlan(page, locale, t);

        await expect(planHeading(page)).toHaveText(PROGRAM_NAMES[OK]);
        await expect(page.getByRole("heading", { name: t("plan.missing.title") })).toHaveCount(0);
        await expectNavBadge(page, t, 1);

        const steps = await todoStepIds(page);
        expect(steps).toContain(TICKED_BEFORE_RENAME);
        const other = steps.find((id) => id !== TICKED_BEFORE_RENAME);
        if (other === undefined) throw new Error("the plan has only one step");
        await expect(stepCheckbox(page, t, TICKED_BEFORE_RENAME)).toBeChecked();
        await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(1);

        // A step ticked now is kept under the slug the program was saved with, not the current one.
        await stepCheckbox(page, t, other).check();
        expect([...(await doneSteps(page, FORMER))].sort()).toEqual(
          [TICKED_BEFORE_RENAME, other].sort(),
        );
        expect(await doneSteps(page, OK)).toEqual([]);

        await page.reload();
        await expectPlanLoaded(page, t);
        await expect(planHeading(page)).toHaveText(PROGRAM_NAMES[OK]);
        await expect(stepCheckbox(page, t, TICKED_BEFORE_RENAME)).toBeChecked();
        await expect(stepCheckbox(page, t, other)).toBeChecked();

        // A signed-out visitor makes no call of their own: only GETs, never the account API.
        for (const request of traffic.requests) {
          expect(request.method, `method of ${request.url}`).toBe("GET");
          expect(new URL(request.url).pathname, `path of ${request.url}`).not.toMatch(/^\/api\//);
        }
      });

      test("View program leads through the old address to the current page, where it can be unsaved", async ({
        page,
      }) => {
        await seedSaved(page, [savedItem(FORMER, OK_SHARD)]);
        await seedTicks(page, { [FORMER]: [TICKED_BEFORE_RENAME] });
        await openPlan(page, locale, t);

        // The link keeps the slug the program was saved under; the redirect does the rest.
        const view = page.getByRole("link", { name: startsWith(t("plan.program.viewProgram")) });
        await expect(view).toHaveAttribute("href", new RegExp(`/programs/${FORMER}$`));
        await view.click();
        await expect(page).toHaveURL(new RegExp(`/${locale}/programs/${OK}$`));
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(PROGRAM_NAMES[OK]);
        await expect(savedButton(page, t)).toBeVisible();

        await savedButton(page, t).click();
        await expect(saveButton(page, t)).toBeVisible();
        expect(await savedSlugs(page)).toEqual([]);
        expect(await doneSteps(page, FORMER)).toEqual([]);
      });

      test("Compare lists a program saved under the old slug and still greys out one that is gone", async ({
        page,
      }) => {
        // Three programs that resolve, so none of them is held by the two-program minimum.
        await seedSaved(page, [
          savedItem(FORMER, OK_SHARD),
          savedItem(CHECK),
          savedItem(FOUNDATION),
          savedItem(GONE_SLUG, OK_SHARD),
        ]);
        await openCompare(page, locale, t);
        await expect
          .poll(() => comparedNames(page, t))
          .toEqual([PROGRAM_NAMES[OK], PROGRAM_NAMES[CHECK], PROGRAM_NAMES[FOUNDATION]]);
        await expect(pickerSummary(page)).toContainText(summaryText(t, 3, 4));

        await openPicker(page);
        const renamed = page.locator(`${PICKER} li[data-slug="${FORMER}"]`);
        await expect(renamed).toContainText(PROGRAM_NAMES[OK]);
        await expect(renamed).not.toContainText(t("compare.picker.missing"));
        await expect(pickerBox(page, FORMER)).toBeChecked();
        await expect(pickerBox(page, FORMER)).toBeEnabled();
        const gone = page.locator(`${PICKER} li[data-slug="${GONE_SLUG}"]`);
        await expect(gone).toContainText(t("compare.picker.missing"));
        await expect(pickerBox(page, GONE_SLUG)).toBeDisabled();
        expect(await savedSlugs(page)).toEqual([FORMER, CHECK, FOUNDATION, GONE_SLUG]);

        await programHeads(page, t)
          .getByRole("link", { name: PROGRAM_NAMES[OK], exact: true })
          .click();
        await expect(page).toHaveURL(new RegExp(`/${locale}/programs/${OK}$`));
      });

      test("a program saved under both its old and its current slug is shown once", async ({
        page,
      }) => {
        await seedSaved(page, [savedItem(FORMER, OK_SHARD), savedItem(OK), savedItem(CHECK)]);
        await openPlan(page, locale, t);
        await expect(planHeading(page)).toHaveText(PROGRAM_NAMES[OK]);
        await openSwitcher(page, t);
        await expect(switcher(page, t).getByRole("listitem")).toHaveCount(2);

        await page.goto(`/${locale}/compare`);
        await expectCompareLoaded(page, t);
        await expect
          .poll(() => comparedNames(page, t))
          .toEqual([PROGRAM_NAMES[OK], PROGRAM_NAMES[CHECK]]);
        await expect(pickerSummary(page)).toContainText(summaryText(t, 2, 2));
      });

      test("a program saved under the old slug is told apart from one the data no longer lists", async ({
        page,
      }) => {
        await seedSaved(page, [savedItem(FORMER, OK_SHARD), savedItem(GONE_SLUG, OK_SHARD)]);
        await openPlan(page, locale, t);
        await expect(planHeading(page)).toHaveText(PROGRAM_NAMES[OK]);

        // The renamed program is listed by its name, the vanished one by its slug.
        await openSwitcher(page, t);
        await expect(
          switcher(page, t).getByRole("button", {
            name: new RegExp(escapeRegExp(PROGRAM_NAMES[OK])),
          }),
        ).toBeVisible();
        await expect(switcher(page, t)).not.toContainText(FORMER);

        await selectMissingProgram(page, t, GONE_SLUG);
        await expect(
          page.getByRole("heading", { level: 2, name: t("plan.missing.title") }),
        ).toBeVisible();
        await expect(page.getByText(t("plan.missing.description"))).toBeVisible();
        expect(await savedSlugs(page)).toEqual([FORMER, GONE_SLUG]);

        await page.getByRole("button", { name: t("plan.program.remove") }).click();
        await expect(page.getByRole("heading", { name: t("plan.missing.title") })).toHaveCount(0);
        await expect(planHeading(page)).toHaveText(PROGRAM_NAMES[OK]);
        await expect(switcher(page, t)).toHaveCount(0);
        expect(await savedSlugs(page)).toEqual([FORMER]);
      });
    });
  });
}
