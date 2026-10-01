import { expect, test } from "@playwright/test";

const LOCALES = [
  { locale: "fr", dir: "ltr" },
  { locale: "ar", dir: "rtl" },
] as const;

for (const { locale, dir } of LOCALES) {
  test(`/${locale} sets lang and dir and renders an h1`, async ({ page }) => {
    await page.goto(`/${locale}`);
    const html = page.locator("html");
    await expect(html).toHaveAttribute("lang", locale);
    await expect(html).toHaveAttribute("dir", dir);
    await expect(page.locator("h1")).toHaveCount(1);
  });
}
