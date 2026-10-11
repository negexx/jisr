import { expectNoSeriousViolations } from "./support/a11y";
import { expect, test } from "./support/fixtures";
import { E2E_LOCALES } from "./support/locales";
import { translatorFor } from "./support/messages";

for (const { locale } of E2E_LOCALES) {
  const t = translatorFor(locale);

  test.describe(`guides (${locale})`, () => {
    test("the footer guides link opens the hub and the overview guide with one h1 and no serious a11y violation", async ({
      page,
    }, testInfo) => {
      await page.goto(`/${locale}`);
      await page.getByRole("link", { name: t("footer.guidesLink") }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/guides$`));
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByText(t("guides.studying-in-europe.title")).first()).toBeVisible();

      await page
        .getByRole("link", { name: t("guides.studying-in-europe.title") })
        .first()
        .click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/guides/studying-in-europe$`));
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoSeriousViolations(page, `guide studying-in-europe ${locale}`, testInfo);
    });
  });
}
