import { expect, test } from "@playwright/test";

import { E2E_SLUGS } from "../e2e/support/fixture-data";
import { E2E_LOCALES } from "../e2e/support/locales";
import { card } from "../e2e/support/matches";
import { translatorFor } from "../e2e/support/messages";
import {
  addressFor,
  confirmSignInLink,
  openDevice,
  readMailLink,
  requestLink,
  resetRequestThrottles,
  seedGuestData,
  shot,
} from "./support";

test.beforeEach(async () => {
  await resetRequestThrottles();
});

// A signed-in account menu ("My account" + "Sign out") must leave the nav on ONE row at desktop
// width: the four items used to wrap, dropping "My plan" under the logo. The screenshots recorded
// here are the fr and ar (RTL) visual record for the header and the sign-in page.
for (const { locale } of E2E_LOCALES) {
  test(`header stays on one row signed in (${locale})`, async ({ browser }, testInfo) => {
    const t = translatorFor(locale);
    const email = addressFor(locale, "header");
    const device = await openDevice(browser);
    const { page } = device;

    await seedGuestData(page, locale, [E2E_SLUGS.ok]);
    await page.goto(`/${locale}/matches`);
    await expect(card(page, E2E_SLUGS.ok)).toBeVisible();
    await page.getByRole("button", { name: t("account.signIn") }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/sign-in\\?return=`));
    await shot(page, testInfo, `sign-in-${locale}-desktop`);
    await page.setViewportSize({ width: 375, height: 800 });
    await shot(page, testInfo, `sign-in-${locale}-phone`);
    await page.setViewportSize({ width: 1280, height: 800 });

    const since = Date.now();
    await requestLink(page, t, email);
    const link = await readMailLink(email, "magic-link", since);
    await confirmSignInLink(page, t, link);
    await page.getByRole("button", { name: t("welcome.confirm.add") }).click();
    await expect(card(page, E2E_SLUGS.ok)).toBeVisible();

    const header = page.locator("header");
    const logo = header.getByRole("link", { name: t("shell.homeLink") }).locator("img");
    await expect(logo).toBeVisible();
    const logoBox = await logo.boundingBox();
    expect(logoBox, "logo box").not.toBeNull();
    expect(logoBox?.height ?? 0).toBeGreaterThanOrEqual(30);
    expect(logoBox?.height ?? 0).toBeLessThanOrEqual(40);
    // The image actually decoded, so a 404 on the asset fails here instead of in production.
    expect(await logo.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(
      0,
    );

    await expect(header.getByRole("link", { name: t("account.account") })).toBeVisible();
    await expect(header.getByRole("button", { name: t("account.signOut") })).toBeVisible();
    const nav = header.getByRole("navigation", { name: t("nav.label") });
    const rows = await nav
      .locator("ul > li > a")
      .evaluateAll((links) => links.map((link) => Math.round(link.getBoundingClientRect().top)));
    expect(rows, `nav link rows at 1280: ${rows.join(",")}`).toHaveLength(4);
    expect(new Set(rows).size, `nav links share one row: ${rows.join(",")}`).toBe(1);

    const navBox = await nav.locator("ul").boundingBox();
    const accountBox = await header.getByRole("link", { name: t("account.account") }).boundingBox();
    expect(navBox).not.toBeNull();
    expect(accountBox).not.toBeNull();
    if (navBox !== null && accountBox !== null) {
      const navCenter = navBox.y + navBox.height / 2;
      const accountCenter = accountBox.y + accountBox.height / 2;
      expect(Math.abs(navCenter - accountCenter)).toBeLessThanOrEqual(2);
    }

    const desktopOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(desktopOverflow, "no horizontal overflow at 1280").toBeLessThanOrEqual(1);
    await shot(page, testInfo, `signed-in-${locale}-desktop`);

    // Phone: the nav intentionally has its own row below the logo row and may wrap there.
    await page.setViewportSize({ width: 375, height: 800 });
    const navBoxPhone = await nav.locator("ul").boundingBox();
    expect(navBoxPhone).not.toBeNull();
    if (logoBox !== null && navBoxPhone !== null) {
      expect(navBoxPhone.y).toBeGreaterThanOrEqual(logoBox.y + logoBox.height - 1);
    }
    const phoneOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(phoneOverflow, "no horizontal overflow at 375").toBeLessThanOrEqual(1);
    await shot(page, testInfo, `signed-in-${locale}-phone`);

    await device.context.close();
  });
}
