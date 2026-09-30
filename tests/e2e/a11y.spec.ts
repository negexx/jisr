import type { Page } from "@playwright/test";

import { expectNoSeriousViolations } from "./support/a11y";
import { E2E_PROFILE, E2E_SLUGS } from "./support/fixture-data";
import { expect, test } from "./support/fixtures";
import { E2E_LOCALES } from "./support/locales";
import { card, openMatches } from "./support/matches";
import { translatorFor } from "./support/messages";
import { JOURNEY_FORM, ProfileFormDriver } from "./support/profile-form";
import { seedProfile } from "./support/seed";
import { MANIFEST_URL, readManifest, withoutProgramShards } from "./support/snapshot";

type Stop = { id: string; order: number; top: number; left: number; right: number };

// Where keyboard focus is now: the element's place in the document and its box on the page.
async function focusedStop(page: Page): Promise<Stop> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (el === null || el === document.body) {
      return { id: "body", order: -1, top: 0, left: 0, right: 0 };
    }
    const box = el.getBoundingClientRect();
    return {
      id: el.id || el.getAttribute("name") || (el.textContent ?? "").trim().slice(0, 30),
      order: Array.from(document.querySelectorAll("*")).indexOf(el),
      top: box.top + window.scrollY,
      left: box.left + window.scrollX,
      right: box.right + window.scrollX,
    };
  });
}

for (const { locale, dir } of E2E_LOCALES) {
  const t = translatorFor(locale);

  test.describe(`accessibility scans (${locale})`, () => {
    test("home", async ({ page }, testInfo) => {
      await page.goto(`/${locale}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoSeriousViolations(page, `home ${locale}`, testInfo);
    });

    test("profile: every step, the review and the errors", async ({ page }, testInfo) => {
      const form = new ProfileFormDriver(page, locale);
      await form.open();
      await expectNoSeriousViolations(page, `profile step 1 ${locale}`, testInfo);

      await form.next().click();
      await expect(form.errorSummary()).toBeVisible();
      await expectNoSeriousViolations(page, `profile errors shown ${locale}`, testInfo);

      await form.fillBac(JOURNEY_FORM);
      await expectNoSeriousViolations(page, `profile step 1 filled ${locale}`, testInfo);
      await form.advance("languages");
      await form.fillLanguages(JOURNEY_FORM);
      await expectNoSeriousViolations(page, `profile step 2 ${locale}`, testInfo);
      await form.advance("preferences");
      await form.fillPreferences(JOURNEY_FORM);
      await expectNoSeriousViolations(page, `profile step 3 ${locale}`, testInfo);
      await form.advance("budget");
      await expectNoSeriousViolations(page, `profile step 4 ${locale}`, testInfo);
      await form.advance("review");
      await expectNoSeriousViolations(page, `profile review ${locale}`, testInfo);
    });

    test.describe("with a saved profile", () => {
      test.beforeEach(async ({ page }) => {
        await seedProfile(page, E2E_PROFILE);
      });

      test("matches with results", async ({ page }, testInfo) => {
        await openMatches(page, locale, t);
        await expectNoSeriousViolations(page, `matches results ${locale}`, testInfo);
        await page.locator('section[data-group="failed"] > details > summary').click();
        await page
          .getByRole("region", { name: t("matches.hidden.summary", { n: 1, count: "1" }) })
          .getByText(t("matches.hidden.summary", { n: 1, count: "1" }))
          .click();
        await expectNoSeriousViolations(
          page,
          `matches results, disclosures open ${locale}`,
          testInfo,
        );
      });

      test("matches: empty catalogue", async ({ page }, testInfo) => {
        const manifest = withoutProgramShards(await readManifest(page));
        await page.route(MANIFEST_URL, (route) => route.fulfill({ json: manifest }));
        await page.goto(`/${locale}/matches`);
        await expect(
          page.getByRole("heading", { level: 2, name: t("matches.states.noPrograms.title") }),
        ).toBeVisible();
        await expectNoSeriousViolations(page, `matches empty catalogue ${locale}`, testInfo);
      });

      test("matches: error state", async ({ page }, testInfo) => {
        await page.route(MANIFEST_URL, (route) => route.fulfill({ status: 500, body: "" }));
        await page.goto(`/${locale}/matches`);
        await expect(
          page.getByRole("heading", { level: 2, name: t("matches.states.error.title") }),
        ).toBeVisible();
        await expectNoSeriousViolations(page, `matches error ${locale}`, testInfo);
      });

      test("program pages: appears met, and stale", async ({ page }, testInfo) => {
        await page.goto(`/${locale}/programs/${E2E_SLUGS.ok}`);
        await expect(page.locator('[data-slot="personal-result"]')).toHaveAttribute(
          "data-group",
          "ok",
        );
        await expectNoSeriousViolations(page, `program ok ${locale}`, testInfo);

        await page.goto(`/${locale}/programs/${E2E_SLUGS.stale}`);
        await expect(page.locator('output[data-freshness="stale"]')).toBeVisible();
        await expect(page.locator('[data-slot="personal-result"]')).toHaveAttribute(
          "data-group",
          "check",
        );
        await expectNoSeriousViolations(page, `program stale ${locale}`, testInfo);
      });
    });

    test("matches: no profile", async ({ page }, testInfo) => {
      await page.goto(`/${locale}/matches`);
      await expect(
        page.getByRole("heading", { level: 2, name: t("matches.states.none.title") }),
      ).toBeVisible();
      await expectNoSeriousViolations(page, `matches no profile ${locale}`, testInfo);
    });
  });

  test.describe(`keyboard and motion (${locale})`, () => {
    test("the skip link is the first tab stop and moves focus to the main content", async ({
      page,
    }) => {
      await page.goto(`/${locale}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.keyboard.press("Tab");
      const skip = page.getByRole("link", { name: t("shell.skipToContent") });
      await expect(skip).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.locator("main")).toBeFocused();
    });

    test("profile step 1: tab order follows the page and the reading direction", async ({
      page,
    }) => {
      const form = new ProfileFormDriver(page, locale);
      await form.open();
      await page.getByRole("button", { name: t("profile.fields.subjects.add") }).click();
      await expect(page.locator("form [tabindex]:not([tabindex='-1'])")).toHaveCount(0);

      await form.nationality().focus();
      const stops = [await focusedStop(page)];
      for (let press = 0; press < 40; press += 1) {
        await page.keyboard.press("Tab");
        stops.push(await focusedStop(page));
        if ((await form.next().evaluate((el) => el === document.activeElement)) === true) break;
      }
      await expect(form.next()).toBeFocused();
      expect(stops.length).toBeGreaterThanOrEqual(8);

      const readingPairs = stops.slice(1).map((stop, index) => ({ before: stops[index], stop }));
      for (const { before, stop } of readingPairs) {
        if (before === undefined) continue;
        expect(stop.order, `${before.id} then ${stop.id}`).toBeGreaterThan(before.order);
        const sameRow = Math.abs(stop.top - before.top) < 6;
        if (sameRow) {
          // Side by side: the next stop is further along in the reading direction.
          if (dir === "rtl")
            expect(stop.right, `${before.id} then ${stop.id}`).toBeLessThan(before.left);
          else expect(stop.left, `${before.id} then ${stop.id}`).toBeGreaterThan(before.right);
        } else {
          expect(stop.top, `${before.id} then ${stop.id}`).toBeGreaterThan(before.top);
        }
      }
    });

    test("after Next, focus is on the heading of the new step", async ({ page }) => {
      const form = new ProfileFormDriver(page, locale);
      await form.open();
      await form.fillBac(JOURNEY_FORM);
      await form.advance("languages");
      await expect(form.stepHeading("languages")).toBeFocused();
    });

    test("the clear-data dialog traps focus and gives it back", async ({ page }) => {
      await page.goto(`/${locale}`);
      const trigger = page.getByRole("button", { name: t("clearData.trigger") });
      await trigger.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toBeVisible();

      for (let press = 0; press < 5; press += 1) {
        await page.keyboard.press("Tab");
        const inside = await page.evaluate(
          () => document.activeElement?.closest('[role="alertdialog"]') !== null,
        );
        expect(inside, `focus after ${press + 1} tabs`).toBe(true);
      }
      await page.keyboard.press("Shift+Tab");
      expect(
        await page.evaluate(() => document.activeElement?.closest('[role="alertdialog"]') !== null),
      ).toBe(true);

      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });

    test.describe("with a saved profile", () => {
      test.beforeEach(async ({ page }) => {
        await seedProfile(page, E2E_PROFILE);
      });

      test("disclosures open and close with Enter and Space", async ({ page }) => {
        await openMatches(page, locale, t);
        const hiddenSummary = t("matches.hidden.summary", { n: 1, count: "1" });
        const summaries = [
          page.locator('section[data-group="failed"] > details > summary'),
          page.getByRole("region", { name: hiddenSummary }).locator("details > summary"),
        ];
        for (const summary of summaries) {
          const details = summary.locator("xpath=..");
          await summary.focus();
          await page.keyboard.press("Enter");
          await expect(details).toHaveAttribute("open", "");
          await page.keyboard.press("Space");
          await expect(details).not.toHaveAttribute("open", "");
          await page.keyboard.press("Space");
          await expect(details).toHaveAttribute("open", "");
        }
      });

      test("with reduced motion nothing is animating once the page has loaded", async ({
        page,
      }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        const running = () =>
          page.evaluate(() => document.getAnimations().map((animation) => animation.playState));

        await page.goto(`/${locale}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(await running()).toEqual([]);

        const form = new ProfileFormDriver(page, locale);
        await form.open();
        expect(await running()).toEqual([]);

        await openMatches(page, locale, t);
        await expect(card(page, E2E_SLUGS.ok)).toBeVisible();
        expect(await running()).toEqual([]);

        await page.getByRole("button", { name: t("clearData.trigger") }).click();
        await expect(page.getByRole("alertdialog")).toBeVisible();
        expect((await running()).filter((state) => state === "running")).toEqual([]);
      });
    });
  });
}
