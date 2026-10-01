import type { Page } from "@playwright/test";

import {
  DRAFT_KEY,
  E2E_EXPECTED,
  E2E_PROFILE,
  E2E_PROFILE_WITH_BUDGET,
  E2E_SLUGS,
  PROFILE_KEY,
  PROGRAM_SECTION_IDS,
} from "./support/fixture-data";
import { expect, test } from "./support/fixtures";
import { E2E_LOCALES, type E2eLocale } from "./support/locales";
import {
  card,
  expectedSlugs,
  expectMatchesLoaded,
  GROUP_NAMES,
  groupTitle,
  HIDDEN_SLUGS,
  openMatches,
} from "./support/matches";
import { escapeRegExp, startsWith, translatorFor } from "./support/messages";
import { rangeSeparator } from "./support/money";
import { JOURNEY_FORM, ProfileFormDriver } from "./support/profile-form";
import { seedProfile } from "./support/seed";

const OFFICIAL_WORDS = /official|officiel|رسمي|الرسمية/i;

async function storedKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => Object.keys(window.localStorage).sort());
}

async function storedValue(page: Page, key: string): Promise<string | null> {
  return page.evaluate((name) => window.localStorage.getItem(name), key);
}

for (const { locale, dir } of E2E_LOCALES) {
  const t = translatorFor(locale);

  test.describe(`journey (${locale})`, () => {
    test("a new student goes from the home page to a program and clears their data", async ({
      page,
    }) => {
      const form = new ProfileFormDriver(page, locale);

      await test.step("home: one heading and one way to start", async () => {
        await page.goto(`/${locale}`);
        await expect(page.locator("html")).toHaveAttribute("dir", dir);
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
        await expect(page.getByRole("link", { name: t("home.matchesCta") })).toHaveCount(0);
        await page.getByRole("link", { name: startsWith(t("home.cta")) }).click();
        await expect(page).toHaveURL(new RegExp(`/${locale}/profile$`));
      });

      await test.step("profile step 1: an out of range grade is explained and can be fixed", async () => {
        await expect(form.nationality()).toBeVisible();
        await form.fillBac({ ...JOURNEY_FORM, overall: "25" });
        await form.next().click();

        await expect(form.errorSummary()).toBeVisible();
        const expectedMessage = t("profile.errors.out_of_range.grade", { min: "0", max: "20" });
        const link = page.getByRole("link", { name: new RegExp(escapeRegExp(expectedMessage)) });
        await expect(link).toBeVisible();
        await link.click();
        await expect(form.overallGrade()).toBeFocused();
        await expect(form.overallGrade()).toHaveAccessibleDescription(
          new RegExp(escapeRegExp(expectedMessage)),
        );

        await form.overallGrade().fill(JOURNEY_FORM.overall);
        await form.advance("languages");
        await expect(form.errorSummary()).toHaveCount(0);
      });

      await test.step("profile step 2: certificates follow the language, unknown level is allowed", async () => {
        const certificate = form
          .languageRow("fr")
          .getByRole("combobox", { name: startsWith(t("profile.fields.certificate.label")) });
        await expect(certificate.locator('option[value="xx-test-cert-fr"]')).toHaveCount(1);
        await expect(certificate.locator('option[value="xx-test-cert-en"]')).toHaveCount(0);
        await form.fillLanguages(JOURNEY_FORM);
        await form.advance("preferences");
      });

      await test.step("profile steps 3 and 4 and the review", async () => {
        await form.fillPreferences(JOURNEY_FORM);
        await form.advance("budget");
        await form.advance("review");
        await expect(
          page.getByRole("heading", { level: 3, name: t("profile.review.saveTitle") }),
        ).toBeVisible();
      });

      await test.step("submit: matches open, and the profile is nowhere in the address", async () => {
        await form.submit();
        await expectMatchesLoaded(page, t);
        const url = new URL(page.url());
        expect(url.search).toBe("");
        expect(url.hash).toBe("");
        expect(url.pathname).toBe(`/${locale}/matches`);
        expect(await storedKeys(page)).toEqual([PROFILE_KEY]);
      });

      await test.step("matches: each fixture program sits in its group", async () => {
        for (const group of GROUP_NAMES) {
          for (const slug of expectedSlugs(group)) {
            await expect(card(page, slug)).toHaveAttribute("data-group", group);
          }
        }
        for (const slug of HIDDEN_SLUGS) await expect(card(page, slug)).toHaveCount(0);
      });

      await test.step("program page of a program that appears met", async () => {
        await card(page, E2E_SLUGS.ok).getByRole("link").first().click();
        await expect(page).toHaveURL(new RegExp(`/${locale}/programs/${E2E_SLUGS.ok}$`));
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.locator("html")).toHaveAttribute("dir", dir);
        await expect(page.locator('[data-slot="personal-result"]')).toHaveAttribute(
          "data-group",
          "ok",
        );
      });

      await test.step("switching language keeps the same program", async () => {
        const other: E2eLocale = locale === "fr" ? "ar" : "fr";
        await page
          .getByRole("navigation", { name: t("localeSwitcher.label") })
          .getByRole("link", { name: t(`localeSwitcher.names.${other}`) })
          .click();
        await expect(page).toHaveURL(new RegExp(`/${other}/programs/${E2E_SLUGS.ok}$`));
        await expect(page.locator("html")).toHaveAttribute("lang", other);
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      });

      await test.step("clear my data: the footer button empties the device", async () => {
        await page.goto(`/${locale}/matches`);
        await expectMatchesLoaded(page, t);
        await page.getByRole("button", { name: t("clearData.trigger") }).click();
        const dialog = page.getByRole("alertdialog");
        await expect(dialog).toBeVisible();
        await dialog.getByRole("button", { name: t("clearData.confirm") }).click();
        await expect(dialog).toHaveCount(0);

        await expect(
          page.getByRole("heading", { level: 2, name: t("matches.states.none.title") }),
        ).toBeVisible();
        await expect(page.getByRole("link", { name: t("matches.states.none.cta") })).toBeVisible();
        expect(await storedValue(page, PROFILE_KEY)).toBeNull();
        expect(await storedValue(page, DRAFT_KEY)).toBeNull();
        expect(await storedKeys(page)).toEqual([]);
      });
    });

    test.describe("with a saved profile", () => {
      test.beforeEach(async ({ page }) => {
        await seedProfile(page, E2E_PROFILE);
      });

      test("matches: groups, counts, hidden programs and the foundation explanation", async ({
        page,
      }) => {
        await openMatches(page, locale, t);

        for (const group of GROUP_NAMES) {
          const slugs = expectedSlugs(group);
          await expect(page.locator(`article[data-group="${group}"]`)).toHaveCount(slugs.length);
          await expect(
            page.getByRole("heading", {
              level: 2,
              name: `${groupTitle(t, group)} (${slugs.length})`,
            }),
          ).toBeVisible();
        }

        const failed = page.locator('section[data-group="failed"]');
        const failedDisclosure = failed.locator("details").first();
        const failedLabel = t("matches.groups.failed.show", { count: "1" });
        await expect(failedDisclosure).not.toHaveAttribute("open", "");
        await expect(failed.getByText(failedLabel)).toBeVisible();
        await expect(card(page, E2E_SLUGS.fail)).toBeHidden();
        await failed.getByText(failedLabel).click();
        await expect(card(page, E2E_SLUGS.fail)).toBeVisible();

        const hiddenSummary = t("matches.hidden.summary", { n: 1, count: "1" });
        const hidden = page.getByRole("region", { name: hiddenSummary });
        await expect(hidden.locator("details")).not.toHaveAttribute("open", "");
        await hidden.getByText(hiddenSummary).click();
        await expect(hidden.locator("details")).toHaveAttribute("open", "");
        await expect(hidden.getByText(t("domain.mismatch.institution_type"))).toBeVisible();
        await expect(card(page, E2E_SLUGS.private)).toHaveCount(0);

        const box = t("matches.groups.foundation.boxTitle");
        await expect(page.getByText(box)).toHaveCount(1);
        await expect(page.locator('section[data-group="foundation"]').getByText(box)).toBeVisible();
      });

      test("matches: cost ranges, the ten month note, partial totals and closed deadlines", async ({
        page,
      }) => {
        await openMatches(page, locale, t);

        const ok = card(page, E2E_SLUGS.ok);
        const total = ok.getByTestId("cost-total");
        await expect(total).toHaveCount(1);
        // A range: two amounts joined by the separator the app's own formatter uses.
        const separator = rangeSeparator(locale, "XTS");
        const ends = ((await total.textContent()) ?? "").split(separator);
        expect(ends).toHaveLength(2);
        for (const end of ends) expect(end).toMatch(/\d/);
        await expect(ok).toContainText(t("domain.cost.tenMonthNote", { months: "10" }));
        await expect(ok.getByTestId("cost-partial")).toHaveCount(0);

        for (const slug of E2E_EXPECTED.costs.incompleteFor) {
          await expect(card(page, slug).getByTestId("cost-partial")).toContainText(
            t("domain.cost.partialTotal"),
          );
        }
        await expect(card(page, E2E_SLUGS.check)).toContainText(t("domain.intake.closed"));
        await expect(card(page, E2E_SLUGS.check)).toHaveAttribute("data-group", "check");
      });

      test("matches: the stale program is never shown as appearing met", async ({ page }) => {
        await openMatches(page, locale, t);
        await expect(card(page, E2E_SLUGS.stale)).toHaveAttribute("data-group", "check");
        await expect(
          page
            .locator('section[data-group="ok"]')
            .locator(`article[data-slug="${E2E_SLUGS.stale}"]`),
        ).toHaveCount(0);
      });

      test("program page: sections, sources and the personal result", async ({ page }) => {
        await page.goto(`/${locale}/programs/${E2E_SLUGS.ok}`);
        await expect(page.locator("html")).toHaveAttribute("dir", dir);
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
        for (const id of PROGRAM_SECTION_IDS) {
          await expect(
            page.getByRole("region", { name: t(`program.sections.${id}`), exact: true }),
          ).toHaveCount(1);
        }

        const external = page.locator("main a[href^='http']");
        const links = await external.evaluateAll((anchors) =>
          anchors.map((anchor) => ({
            href: anchor.getAttribute("href") ?? "",
            rel: (anchor.getAttribute("rel") ?? "").split(/\s+/),
          })),
        );
        expect(links.length).toBeGreaterThan(0);
        for (const link of links) {
          expect(link.href.startsWith("https://")).toBe(true);
          expect(link.rel).toEqual(expect.arrayContaining(["noopener", "noreferrer"]));
        }

        const result = page.locator('[data-slot="personal-result"]');
        await expect(result).toHaveAttribute("data-group", "ok");
        await expect(result.getByText(t("domain.status.satisfied"), { exact: true })).toBeVisible();
        await expect(result.getByTestId("route-text")).toHaveText(t("domain.route.direct"));
        await expect(result.locator('[data-slot="budget-fit"]')).toHaveCount(0);
        for (const fit of ["within", "straddles", "above", "unknown"]) {
          await expect(page.getByText(t(`domain.budgetFit.${fit}`))).toHaveCount(0);
        }
      });

      test("program page: aging and stale facts are flagged in neutral words", async ({ page }) => {
        await page.goto(`/${locale}/programs/${E2E_SLUGS.stale}`);
        const banner = page.locator('output[data-freshness="stale"]');
        await expect(banner).toContainText(t("program.banner.stale"));
        await expect(banner).toContainText(t("program.banner.check"));
        expect(await banner.textContent()).not.toMatch(OFFICIAL_WORDS);
        await expect(page.locator('[data-slot="personal-result"]')).toHaveAttribute(
          "data-group",
          "check",
        );

        const nonOfficial = page.locator(
          '[data-slot="source-badge"]:has([data-kind="estimate"]), [data-slot="source-badge"]:has([data-kind="guidance"])',
        );
        const texts = await nonOfficial.allTextContents();
        expect(texts.length).toBeGreaterThan(0);
        for (const text of texts) expect(text).not.toMatch(OFFICIAL_WORDS);

        await page.goto(`/${locale}/programs/${E2E_SLUGS.foundation}`);
        await expect(page.locator('output[data-freshness="aging"]')).toContainText(
          t("program.banner.aging"),
        );
      });

      test("a returning visitor sees the link to their matches and an editable form", async ({
        page,
      }) => {
        await page.goto(`/${locale}`);
        const matchesLink = page.getByRole("link", { name: t("home.matchesCta") });
        await expect(matchesLink).toBeVisible();
        await matchesLink.click();
        await expect(page).toHaveURL(new RegExp(`/${locale}/matches$`));
        await expectMatchesLoaded(page, t);
        await expect(
          page.getByRole("heading", { level: 2, name: t("matches.states.none.title") }),
        ).toHaveCount(0);

        const form = new ProfileFormDriver(page, locale);
        await form.open();
        await expect(
          page.getByRole("heading", { level: 1, name: t("profile.title.edit") }),
        ).toBeVisible();
        await expect(form.nationality()).toHaveValue(E2E_PROFILE.nationality);
        await expect(form.overallGrade()).toHaveValue(/14/);
        await expect(form.credentialCountry()).toHaveValue(E2E_PROFILE.credential.country);
      });
    });
    test.describe("with a budget in the currency of the fixture costs", () => {
      // The form only offers EUR and MAD, so a budget that can be compared with the XTS costs of
      // the fixture can only come from storage.
      test.beforeEach(async ({ page }) => {
        await seedProfile(page, E2E_PROFILE_WITH_BUDGET);
      });

      test("the budget is compared with the estimate and never hides a program", async ({
        page,
      }) => {
        await openMatches(page, locale, t);
        for (const group of GROUP_NAMES) {
          await expect(page.locator(`article[data-group="${group}"]`)).toHaveCount(
            expectedSlugs(group).length,
          );
        }
        const fits = ["within", "straddles", "above"].map((fit) => t(`domain.budgetFit.${fit}`));
        const fit = new RegExp(fits.map(escapeRegExp).join("|"));
        await expect(card(page, E2E_SLUGS.ok)).toContainText(fit);

        await page.goto(`/${locale}/programs/${E2E_SLUGS.ok}`);
        const budgetFit = page.locator('[data-slot="budget-fit"]');
        await expect(budgetFit).toBeVisible();
        await expect(budgetFit).toContainText(fit);
        await expect(budgetFit).toContainText(t("program.personal.budgetNote"));
      });
    });
  });
}
