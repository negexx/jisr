import { BASE_ORIGIN, E2E_SLUGS, PROFILE_KEY } from "./support/fixture-data";
import { expect, test } from "./support/fixtures";
import { E2E_LOCALES } from "./support/locales";
import { card, expectMatchesLoaded } from "./support/matches";
import { escapeRegExp, startsWith, translatorFor } from "./support/messages";
import { JOURNEY_FORM, ProfileFormDriver, type ProfileFormValues } from "./support/profile-form";
import { recordTraffic } from "./support/traffic";

// Distinctive values, typed in the form: the grade in the way a student writes it, and a
// nationality that is neither the country of the Bac nor a destination, so its code cannot appear
// in a shard name for another reason.
const PRIVATE_FORM: ProfileFormValues = { ...JOURNEY_FORM, nationality: "XZ", overall: "13,75" };
const PRIVATE_VALUES = [
  "13,75",
  "13.75",
  "1375",
  "XZ",
  PRIVATE_FORM.frenchCertificate ?? "",
  PRIVATE_FORM.credentialType,
  PRIVATE_FORM.track,
  PRIVATE_FORM.credentialCountry === PRIVATE_FORM.nationality ? "" : PRIVATE_FORM.nationality,
  ...PRIVATE_FORM.subjects.map((row) => row.subject),
].filter((value) => value !== "");

const SNAPSHOT_PATH = /^\/snapshots\/(manifest\.json|s\/[A-Za-z0-9.-]+\.[0-9a-f]{12}\.json)$/;

function leaks(text: string): string[] {
  return PRIVATE_VALUES.filter((value) => text.toLowerCase().includes(value.toLowerCase()));
}

for (const { locale } of E2E_LOCALES) {
  const t = translatorFor(locale);

  test.describe(`privacy (${locale})`, () => {
    test("nothing the student types leaves the device or shows up in a request, a cookie or the console", async ({
      page,
      context,
    }) => {
      const traffic = recordTraffic(page);
      const form = new ProfileFormDriver(page, locale);

      await page.goto(`/${locale}`);
      await page.getByRole("link", { name: startsWith(t("home.cta")) }).click();
      await expect(form.nationality()).toBeVisible();
      await form.fillToReview(PRIVATE_FORM);
      await form.submit();
      await expectMatchesLoaded(page, t);
      await card(page, E2E_SLUGS.ok).getByRole("link").first().click();
      await expect(page).toHaveURL(new RegExp(`/programs/${E2E_SLUGS.ok}$`));
      await expect(page.locator('[data-slot="personal-result"]')).toHaveAttribute(
        "data-group",
        "ok",
      );
      await page.getByRole("button", { name: t("clearData.trigger") }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await page.getByRole("button", { name: t("clearData.cancel") }).click();
      await expect(page.getByRole("alertdialog")).toHaveCount(0);

      // The profile is in place while we look at storage.
      const storage = await page.evaluate(() => ({
        localKeys: Object.keys(window.localStorage),
        sessionKeys: Object.keys(window.sessionStorage),
        cookie: document.cookie,
      }));
      expect(storage.localKeys).toContain(PROFILE_KEY);
      for (const key of storage.localKeys) expect(key.startsWith("jisr.")).toBe(true);
      expect(storage.sessionKeys).toEqual([]);
      expect(storage.cookie).toBe("");
      expect(await context.cookies()).toEqual([]);
      expect(context.serviceWorkers()).toEqual([]);
      expect(
        await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
      ).toBe(0);

      const requests = traffic.requests;
      expect(requests.length).toBeGreaterThan(0);

      for (const request of requests) {
        const url = new URL(request.url);
        expect(url.origin, `origin of ${url.pathname}`).toBe(BASE_ORIGIN);
        expect(request.method, `method of ${url.pathname}`).toBe("GET");
        expect(request.postData, `body of ${url.pathname}`).toBeNull();
        expect(leaks(decodeURIComponent(`${url.pathname}${url.search}${url.hash}`))).toEqual([]);
        if (url.pathname.startsWith("/snapshots/")) {
          expect(url.pathname).toMatch(SNAPSHOT_PATH);
          expect(url.search).toBe("");
        }
      }
      expect(
        requests.some((request) => new URL(request.url).pathname.startsWith("/snapshots/s/")),
      ).toBe(true);
      expect([...new Set(requests.map((request) => new URL(request.url).host))]).toEqual([
        new URL(BASE_ORIGIN).host,
      ]);

      for (const response of await traffic.responses()) {
        const names = response.headers.map((header) => header.name.toLowerCase());
        expect(names, `headers of ${response.url}`).not.toContain("set-cookie");
      }

      for (const message of traffic.consoleMessages) {
        expect(leaks(message.text), `console ${message.type}`).toEqual([]);
      }
    });

    test("the static HTML of a program page holds nothing that depends on the student", async ({
      request,
    }) => {
      const response = await request.get(`/${locale}/programs/${E2E_SLUGS.ok}`);
      expect(response.status()).toBe(200);
      expect(response.headers()["set-cookie"]).toBeUndefined();
      const html = await response.text();

      expect(html).toContain("<h1");
      expect(html).not.toContain('data-slot="personal-result"');
      const personal = [
        t("domain.status.hint.satisfied"),
        t("domain.status.hint.check"),
        t("domain.status.hint.not_satisfied"),
        t("domain.route.direct"),
        t("domain.route.foundation"),
        t("domain.budgetFit.within"),
        t("domain.budgetFit.straddles"),
        t("domain.budgetFit.above"),
        t("domain.budgetFit.unknown"),
        t("program.personal.budgetNote"),
      ];
      // The page ships the client leaves' message catalogue inside script tags, so only the markup counts.
      const markup = html.replace(/<script[\s\S]*?<\/script>/g, "");
      expect(markup.length).toBeLessThan(html.length);
      const normalised = markup
        .replaceAll("&#x27;", "'")
        .replaceAll("&amp;", "&")
        .replaceAll("&quot;", '"');
      for (const sentence of personal) {
        expect(normalised, sentence).not.toMatch(new RegExp(escapeRegExp(sentence)));
      }
      // Slugs and country codes are reference data and may appear; what only the student knows may not.
      expect(html).not.toMatch(/13[.,]75/);
    });
  });
}
