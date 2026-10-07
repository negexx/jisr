import type { Page } from "@playwright/test";

import { expectNoSeriousViolations } from "./support/a11y";
import { E2E_PROFILE, E2E_SCHOLARSHIP_SLUGS } from "./support/fixture-data";
import { expect, test } from "./support/fixtures";
import { E2E_LOCALES } from "./support/locales";
import { translatorFor } from "./support/messages";
import { seedProfile } from "./support/seed";

const cardOf = (page: Page, slug: string) => page.locator(`#scholarship-${slug}`);

for (const { locale } of E2E_LOCALES) {
  const t = translatorFor(locale);

  test.describe(`scholarships (${locale})`, () => {
    test("lists the scholarships under their country with one h1 and no serious a11y violation", async ({
      page,
    }, testInfo) => {
      await page.goto(`/${locale}/scholarships`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("scholarshipsPage.title"));
      for (const slug of Object.values(E2E_SCHOLARSHIP_SLUGS))
        await expect(cardOf(page, slug)).toBeVisible();
      await expectNoSeriousViolations(page, `scholarships ${locale}`, testInfo);
    });

    test("shows no horizontal scroll and a reachable header at phone width", async ({ page }) => {
      await page.setViewportSize({ width: 343, height: 800 });
      const nav = page.getByRole("navigation", { name: t("nav.label") });
      for (const path of ["", "/profile", "/matches", "/scholarships", "/plan"]) {
        await page.goto(`/${locale}${path}`);
        // Measure after the client leaves have rendered: the server placeholders are narrower than the final text.
        await expect(nav.getByRole("link", { name: t("nav.scholarships") })).toBeVisible();
        await page.waitForLoadState("networkidle");
        if (path === "/scholarships") {
          await expect(
            cardOf(page, E2E_SCHOLARSHIP_SLUGS.xaOnly).getByTestId("nationality-check"),
          ).not.toHaveAttribute("data-state", "placeholder");
        }
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(overflow, `${path} overflows`).toBeLessThanOrEqual(0);
      }
      await page.goto(`/${locale}/scholarships`);
      const link = nav.getByRole("link", { name: t("nav.scholarships") });
      const box = await link.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect((box?.x ?? -1) + (box?.width ?? 0)).toBeLessThanOrEqual(343);
      expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
    });

    test("the nationality line is neutral without a profile, then follows the seeded nationality", async ({
      page,
    }) => {
      await page.goto(`/${locale}/scholarships`);
      await expect(
        cardOf(page, E2E_SCHOLARSHIP_SLUGS.xaOnly).getByRole("link", {
          name: t("scholarshipsPage.nationality.noProfile"),
        }),
      ).toBeVisible();
      await seedProfile(page, E2E_PROFILE); // nationality XA
      await page.goto(`/${locale}/scholarships`);
      await expect(
        cardOf(page, E2E_SCHOLARSHIP_SLUGS.xaOnly).getByTestId("nationality-check"),
      ).toHaveAttribute("data-state", "open");
      await expect(
        cardOf(page, E2E_SCHOLARSHIP_SLUGS.xzOnly).getByTestId("nationality-check"),
      ).toHaveAttribute("data-state", "closed");
      await expect(
        cardOf(page, E2E_SCHOLARSHIP_SLUGS.open).getByTestId("nationality-check"),
      ).toHaveCount(0);
    });

    test("a fact verified long ago carries the stale mark and keeps its source", async ({
      page,
    }) => {
      await page.clock.setSystemTime(new Date("2027-06-15T10:00:00.000Z")); // past the 270-day volatile limit of 2026-09-01
      await page.goto(`/${locale}/scholarships`);
      const card = cardOf(page, E2E_SCHOLARSHIP_SLUGS.open);
      await expect(card.locator('[data-freshness="stale"]').first()).toBeVisible();
      await expect(card.locator('[data-slot="source-badge"]').first()).toBeVisible();
    });

    test("a whole-country scholarship shows the count and the My matches link when its programmes block opens", async ({
      page,
    }) => {
      await page.goto(`/${locale}/scholarships`);
      const block = cardOf(page, E2E_SCHOLARSHIP_SLUGS.open).getByTestId("scholarship-programmes");
      await block.locator("summary").click();
      const link = block.getByRole("link", { name: t("scholarshipsPage.programmes.matchesLink") });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", `/${locale}/matches`);
    });

    test("the card anchor scrolls to the card", async ({ page }) => {
      await page.goto(`/${locale}/scholarships#scholarship-${E2E_SCHOLARSHIP_SLUGS.xzOnly}`);
      await expect(cardOf(page, E2E_SCHOLARSHIP_SLUGS.xzOnly)).toBeInViewport();
      // Without the scroll the card could already sit in the first screen on a desktop viewport.
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    });
  });
}
