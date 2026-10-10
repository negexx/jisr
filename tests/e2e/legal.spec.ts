import { expectNoSeriousViolations } from "./support/a11y";
import { expect, test } from "./support/fixtures";
import { E2E_LOCALES } from "./support/locales";
import { translatorFor } from "./support/messages";

for (const { locale } of E2E_LOCALES) {
  const t = translatorFor(locale);

  test.describe(`legal pages (${locale})`, () => {
    test("the footer privacy link opens the notice with one h1 and no serious a11y violation", async ({
      page,
    }, testInfo) => {
      await page.goto(`/${locale}`);
      await page.getByRole("link", { name: t("footer.privacyLink") }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/privacy$`));
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByText("GoatCounter").first()).toBeVisible();
      await expect(page.getByText("Vercel").first()).toBeVisible();
      await expect(page.locator(`article a[href="/${locale}/terms"]`)).toBeVisible();
      await expectNoSeriousViolations(page, `privacy ${locale}`, testInfo);
    });

    test("the footer terms link opens the terms with one h1 and no serious a11y violation", async ({
      page,
    }, testInfo) => {
      await page.goto(`/${locale}`);
      await page.getByRole("link", { name: t("footer.termsLink") }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/terms$`));
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoSeriousViolations(page, `terms ${locale}`, testInfo);
    });
  });
}
