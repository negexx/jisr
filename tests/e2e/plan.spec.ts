import type { Page } from "@playwright/test";

import { E2E_PROFILE, E2E_SLUGS, PLAN_KEY, PROFILE_KEY, SAVED_KEY } from "./support/fixture-data";
import { expect, test } from "./support/fixtures";
import { E2E_LOCALES } from "./support/locales";
import { card, openMatches } from "./support/matches";
import { startsWith, translatorFor } from "./support/messages";
import {
  expectNavBadge,
  expectPlanLoaded,
  navLink,
  nextStep,
  openPlan,
  PROGRAM_NAMES,
  planHeading,
  saveButton,
  savedButton,
  savedItem,
  saveFromCard,
  seedSaved,
  selectMissingProgram,
  selectProgram,
  stepCheckbox,
  switcher,
  todoStepIds,
} from "./support/plan";
import { seedProfile } from "./support/seed";

async function storedValue(page: Page, key: string): Promise<string | null> {
  return page.evaluate((name) => window.localStorage.getItem(name), key);
}

async function storedKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => Object.keys(window.localStorage).sort());
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

const OK = E2E_SLUGS.ok;
const CHECK = E2E_SLUGS.check;

for (const { locale } of E2E_LOCALES) {
  const t = translatorFor(locale);

  test.describe(`save and plan (${locale})`, () => {
    test.describe("with a saved profile", () => {
      test.beforeEach(async ({ page }) => {
        await seedProfile(page, E2E_PROFILE);
      });

      test("saving two programs from My matches flips the buttons, counts them and survives a reload", async ({
        page,
      }) => {
        await openMatches(page, locale, t);
        await expect(navLink(page, t, "plan")).not.toContainText(
          t("nav.savedCount", { count: "1" }),
        );
        await expect(saveButton(card(page, OK), t)).toBeVisible();

        await saveFromCard(page, t, OK);
        await expectNavBadge(page, t, 1);
        await saveFromCard(page, t, CHECK);
        await expectNavBadge(page, t, 2);
        await expect(saveButton(card(page, E2E_SLUGS.stale), t)).toBeVisible();
        expect(await savedSlugs(page)).toEqual([OK, CHECK]);

        await page.reload();
        await expect(card(page, OK)).toBeVisible();
        await expect(savedButton(card(page, OK), t)).toBeVisible();
        await expect(savedButton(card(page, CHECK), t)).toBeVisible();
        await expect(saveButton(card(page, E2E_SLUGS.stale), t)).toBeVisible();
        await expectNavBadge(page, t, 2);
      });

      test("the plan switches between programs and a ticked step survives a reload", async ({
        page,
      }) => {
        await openMatches(page, locale, t);
        await saveFromCard(page, t, OK);
        await saveFromCard(page, t, CHECK);

        await navLink(page, t, "plan").click();
        await expect(page).toHaveURL(new RegExp(`/${locale}/plan$`));
        await expectPlanLoaded(page, t);
        await expect(planHeading(page)).toHaveText(PROGRAM_NAMES[OK]);
        await selectProgram(page, t, PROGRAM_NAMES[CHECK]);
        await selectProgram(page, t, PROGRAM_NAMES[OK]);

        const steps = await todoStepIds(page);
        expect(steps.length).toBeGreaterThan(1);
        const [first, second] = steps;
        if (first === undefined || second === undefined) throw new Error("fewer than two steps");

        await expect(nextStep(page)).toContainText(t(`domain.checklist.step.${first}.title`));
        await expect(stepCheckbox(page, t, first)).not.toBeChecked();
        await stepCheckbox(page, t, first).check();
        await expect(stepCheckbox(page, t, first)).toBeChecked();
        await expect(nextStep(page)).toContainText(t(`domain.checklist.step.${second}.title`));
        expect(await doneSteps(page, OK)).toEqual([first]);

        await page.reload();
        await expectPlanLoaded(page, t);
        await expect(planHeading(page)).toHaveText(PROGRAM_NAMES[OK]);
        await expect(stepCheckbox(page, t, first)).toBeChecked();
        await expect(stepCheckbox(page, t, second)).not.toBeChecked();
        await expect(nextStep(page)).toContainText(t(`domain.checklist.step.${second}.title`));

        // The other program's steps were not touched.
        await selectProgram(page, t, PROGRAM_NAMES[CHECK]);
        expect(await doneSteps(page, CHECK)).toEqual([]);
        await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(0);
      });

      test("unsaving from the program page removes it from the plan and forgets its ticks", async ({
        page,
      }) => {
        await openMatches(page, locale, t);
        await saveFromCard(page, t, OK);
        await saveFromCard(page, t, CHECK);

        await navLink(page, t, "plan").click();
        await expectPlanLoaded(page, t);
        const [first] = await todoStepIds(page);
        if (first === undefined) throw new Error("no steps");
        await stepCheckbox(page, t, first).check();
        expect(await doneSteps(page, OK)).toEqual([first]);

        await page.getByRole("link", { name: startsWith(t("plan.program.viewProgram")) }).click();
        await expect(page).toHaveURL(new RegExp(`/${locale}/programs/${OK}$`));
        await expect(savedButton(page, t)).toBeVisible();
        await savedButton(page, t).click();
        await expect(saveButton(page, t)).toBeVisible();
        await expectNavBadge(page, t, 1);

        await navLink(page, t, "plan").click();
        await expectPlanLoaded(page, t);
        await expect(planHeading(page)).toHaveText(PROGRAM_NAMES[CHECK]);
        // One program left: no switcher.
        await expect(switcher(page, t)).toHaveCount(0);
        expect(await savedSlugs(page)).toEqual([CHECK]);
        expect(await doneSteps(page, OK)).toEqual([]);
      });

      test("Clear my data empties the saved list, the plan and the profile", async ({ page }) => {
        await openMatches(page, locale, t);
        await saveFromCard(page, t, OK);
        await navLink(page, t, "plan").click();
        await expectPlanLoaded(page, t);
        const [first] = await todoStepIds(page);
        if (first === undefined) throw new Error("no steps");
        await stepCheckbox(page, t, first).check();
        expect(await storedKeys(page)).toEqual([PLAN_KEY, PROFILE_KEY, SAVED_KEY].sort());

        await page.getByRole("button", { name: t("clearData.trigger") }).click();
        const dialog = page.getByRole("alertdialog");
        await expect(dialog).toBeVisible();
        await dialog.getByRole("button", { name: t("clearData.confirm") }).click();
        await expect(dialog).toHaveCount(0);

        // Same page, no reload: the plan reacts to the data being gone.
        await expect(
          page.getByRole("heading", { level: 2, name: t("plan.empty.title") }),
        ).toBeVisible();
        await expect(planHeading(page)).toHaveCount(0);
        await expect(navLink(page, t, "plan")).not.toContainText(
          t("nav.savedCount", { count: "1" }),
        );
        expect(await storedKeys(page)).toEqual([]);
      });

      test("a saved program the data no longer lists is explained and can be removed", async ({
        page,
      }) => {
        const gone = "xx-test-prog-gone";
        await seedSaved(page, [
          savedItem(OK),
          savedItem(gone, { country: "XB", field: "xx-test-field-cs" }),
        ]);
        await openPlan(page, locale, t);
        await expect(planHeading(page)).toHaveText(PROGRAM_NAMES[OK]);

        await selectMissingProgram(page, t, gone);
        await expect(
          page.getByRole("heading", { level: 2, name: t("plan.missing.title") }),
        ).toBeVisible();
        await expect(page.getByText(t("plan.missing.description"))).toBeVisible();
        expect(await savedSlugs(page)).toEqual([OK, gone]);

        await page.getByRole("button", { name: t("plan.program.remove") }).click();
        await expect(page.getByRole("heading", { name: t("plan.missing.title") })).toHaveCount(0);
        await expect(planHeading(page)).toHaveText(PROGRAM_NAMES[OK]);
        await expect(switcher(page, t)).toHaveCount(0);
        expect(await savedSlugs(page)).toEqual([OK]);
      });

      test("the 13th save is refused with an alert and nothing is added", async ({ page }) => {
        const fillers = Array.from({ length: 12 }, (_, index) =>
          savedItem(`xx-test-filler-${String(index + 1).padStart(2, "0")}`, {
            country: "XB",
            field: "xx-test-field-cs",
          }),
        );
        await seedSaved(page, fillers);
        await openMatches(page, locale, t);
        await expectNavBadge(page, t, 12);

        const full = t("savedProgram.full", { max: "12" });
        const alert = page.getByRole("alert").filter({ hasText: full });
        await expect(alert).toHaveCount(0);
        await saveButton(card(page, OK), t).click();
        await expect(alert).toBeVisible();
        await expect(saveButton(card(page, OK), t)).toBeVisible();
        await expect(savedButton(card(page, OK), t)).toHaveCount(0);
        expect(await savedSlugs(page)).toHaveLength(12);
        expect(await savedSlugs(page)).not.toContain(OK);
        await expectNavBadge(page, t, 12);
      });
    });

    test("without a profile the saved list is kept and the plan asks for a profile", async ({
      page,
    }) => {
      await seedSaved(page, [savedItem(OK), savedItem(CHECK)]);
      await page.goto(`/${locale}/plan`);
      await expect(page.getByRole("heading", { level: 1, name: t("plan.title") })).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 2, name: t("plan.noProfile.title") }),
      ).toBeVisible();
      await expect(planHeading(page)).toHaveCount(0);
      await expectNavBadge(page, t, 2);
      expect(await savedSlugs(page)).toEqual([OK, CHECK]);

      await page.getByRole("link", { name: t("plan.noProfile.action") }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/profile$`));
      expect(await savedSlugs(page)).toEqual([OK, CHECK]);
    });
  });
}
