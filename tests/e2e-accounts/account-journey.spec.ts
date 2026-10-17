import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { maskEmail } from "@/lib/auth/mask-email";

import { E2E_SLUGS } from "../e2e/support/fixture-data";
import { E2E_LOCALES } from "../e2e/support/locales";
import { card, expectMatchesLoaded } from "../e2e/support/matches";
import { escapeRegExp, startsWith, translatorFor } from "../e2e/support/messages";
import { expectNavBadge, saveButton, savedButton } from "../e2e/support/plan";
import {
  accountRowCount,
  addressFor,
  confirmSignInLink,
  type Device,
  exportStatus,
  fetchExport,
  guestSavedSlugs,
  localKeys,
  ORIGIN,
  openDevice,
  readMailLink,
  requestLink,
  savedSlugsOnServer,
  seedGuestData,
  shot,
  signInOnDevice,
} from "./support";

// The signed-in journey on a server whose accounts switch is on (playwright.accounts.config.ts):
// sign-up by magic link through the file transport, import, sync, report, export and deletion.
// Each locale is one serial chain on its own address; the two chains run in parallel.
const OK = E2E_SLUGS.ok;
const CHECK = E2E_SLUGS.check;
const FOUNDATION = E2E_SLUGS.foundation;

type StorageState = Awaited<ReturnType<Device["context"]["storageState"]>>;

for (const { locale, dir } of E2E_LOCALES) {
  test.describe
    .serial(`signed-in journey (${locale})`, () => {
      const t = translatorFor(locale);
      const email = addressFor(locale, "main");
      const matches = `/${locale}/matches`;
      // Set by the sign-up test, used by every later one: a device that is signed in.
      let signedInState: StorageState;

      test("IS-1 sign-up: consent and age are required, then the link signs the student in", async ({
        browser,
      }, testInfo) => {
        const device = await openDevice(browser);
        const { page } = device;
        await seedGuestData(page, locale, [OK]);

        // The way in is the account menu, which remembers where the student was.
        await page.goto(matches);
        await expectMatchesLoaded(page, t);
        await page.getByRole("button", { name: t("account.signIn") }).click();
        await expect(page).toHaveURL(new RegExp(`/${locale}/sign-in\\?return=`));
        await expect(page.locator("html")).toHaveAttribute("dir", dir);
        await shot(page, testInfo, `01-sign-in-${locale}`);

        // Unticked boxes block the request: both reasons are shown and nothing is sent (IS-1/IS-4).
        const actionCalls: string[] = [];
        page.on("request", (request) => {
          if (request.method() === "POST" && request.headers()["next-action"] !== undefined) {
            actionCalls.push(request.url());
          }
        });
        await page.getByLabel(startsWith(t("signup.email.label"))).fill(email);
        await page.getByRole("button", { name: t("signup.submit"), exact: true }).click();
        await expect(page.getByText(t("signup.errors.consentRequired"))).toBeVisible();
        await expect(page.getByText(t("signup.errors.ageRequired"))).toBeVisible();
        expect(actionCalls).toHaveLength(0);
        await shot(page, testInfo, `02-unticked-boxes-${locale}`);

        const since = Date.now();
        await requestLink(page, t, email);
        await expect(page.getByText(email)).toBeVisible();
        await shot(page, testInfo, `03-check-inbox-${locale}`);

        const link = await readMailLink(email, "magic-link", since);
        expect(link.pathname).toBe(`/${locale}/sign-in/confirm`);
        await confirmSignInLink(page, t, link);

        // IS-2: the landing names the account and asks BEFORE anything is imported.
        const confirmTitle = page.getByRole("heading", {
          name: new RegExp(escapeRegExp(maskEmail(email))),
        });
        await expect(confirmTitle).toBeVisible();
        await expect(confirmTitle).not.toContainText(email);
        await expect(page.getByRole("button", { name: t("welcome.confirm.add") })).toBeVisible();
        const before = await fetchExport(page);
        expect(before.profile).toBeNull();
        expect(before.savedPrograms).toHaveLength(0);
        expect(before.consent.consentVersion).not.toBeNull();
        await shot(page, testInfo, `04-welcome-confirmation-${locale}`);

        // An empty account takes the device's data without asking again, and the student lands
        // back where they came from.
        await page.getByRole("button", { name: t("welcome.confirm.add") }).click();
        await expect(page).toHaveURL(new RegExp(`${matches}$`));
        await expectMatchesLoaded(page, t);
        await expect(savedButton(card(page, OK), t)).toBeVisible();
        await expectNavBadge(page, t, 1);
        const after = await fetchExport(page);
        expect(after.profile).not.toBeNull();
        expect(after.savedPrograms.map((item) => item.slug)).toEqual([OK]);
        expect(await localKeys(page)).toContain("jisr.auth");
        expect(await guestSavedSlugs(page)).toEqual([]);
        await shot(page, testInfo, `05-imported-${locale}`);

        signedInState = await device.context.storageState();
        await device.context.close();
      });

      test("IS-2 an account that already holds data: keep, then replace, never merged", async ({
        browser,
      }, testInfo) => {
        // Device B has its own guest data; the account holds [ok].
        const deviceB = await openDevice(browser);
        await seedGuestData(deviceB.page, locale, [CHECK]);
        await signInOnDevice(deviceB, t, locale, email, matches);
        await deviceB.page.getByRole("button", { name: t("welcome.confirm.add") }).click();

        const dialog = deviceB.page.getByRole("alertdialog");
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText(maskEmail(email));
        await shot(deviceB.page, testInfo, `06-replace-prompt-${locale}`);

        // Keep: the account is untouched, the device's data stays on it.
        await dialog.getByRole("button", { name: t("welcome.import.keep") }).click();
        await expect(deviceB.page).toHaveURL(new RegExp(`${matches}$`));
        expect(await savedSlugsOnServer(deviceB.page)).toEqual([OK]);
        expect(await guestSavedSlugs(deviceB.page)).toEqual([CHECK]);
        await deviceB.context.close();

        // Replace: device C's data becomes the account's data.
        const deviceC = await openDevice(browser);
        await seedGuestData(deviceC.page, locale, [FOUNDATION]);
        await signInOnDevice(deviceC, t, locale, email, matches);
        await deviceC.page.getByRole("button", { name: t("welcome.confirm.add") }).click();
        const replaceDialog = deviceC.page.getByRole("alertdialog");
        await expect(replaceDialog).toBeVisible();
        await replaceDialog.getByRole("button", { name: t("welcome.import.replace") }).click();
        await expect(deviceC.page).toHaveURL(new RegExp(`${matches}$`));
        expect(await savedSlugsOnServer(deviceC.page)).toEqual([FOUNDATION]);
        expect(await guestSavedSlugs(deviceC.page)).toEqual([]);
        await shot(deviceC.page, testInfo, `07-replaced-${locale}`);
        await deviceC.context.close();
      });

      test("IS-3 re-login on a fresh device shows what was saved elsewhere", async ({
        browser,
      }, testInfo) => {
        const device = await openDevice(browser);
        const { page } = device;
        await signInOnDevice(device, t, locale, email, matches);
        // No guest data on this device: no confirmation, straight back to the matches.
        await expect(page).toHaveURL(new RegExp(`${matches}$`));
        await expectMatchesLoaded(page, t);
        await expect(savedButton(card(page, FOUNDATION), t)).toBeVisible();
        await expect(saveButton(card(page, OK), t)).toBeVisible();
        await expectNavBadge(page, t, 1);
        await shot(page, testInfo, `08-fresh-device-${locale}`);
        signedInState = await device.context.storageState();
        await device.context.close();
      });

      test("IS-3 a save reaches the server; a failed save is undone and says so", async ({
        browser,
      }, testInfo) => {
        const { context, page } = await openDevice(browser, signedInState);
        await page.goto(matches);
        await expectMatchesLoaded(page, t);

        await saveButton(card(page, OK), t).click();
        await expect(savedButton(card(page, OK), t)).toBeVisible();
        await expect.poll(() => savedSlugsOnServer(page)).toEqual([FOUNDATION, OK].sort());

        // The next save never reaches the server: the Server Action request fails.
        await context.route("**/*", async (route) => {
          const request = route.request();
          if (request.method() === "POST" && request.headers()["next-action"] !== undefined) {
            await route.abort("failed");
            return;
          }
          await route.continue();
        });
        await saveButton(card(page, CHECK), t).click();
        await expect(page.getByText(t("accountSync.failed"))).toBeVisible();
        // The pre-state is shown again and the server never saw the program.
        await expect(saveButton(card(page, CHECK), t)).toBeVisible();
        await expectNavBadge(page, t, 2);
        await shot(page, testInfo, `09-save-rolled-back-${locale}`);
        await context.unroute("**/*");
        expect(await savedSlugsOnServer(page)).toEqual([FOUNDATION, OK].sort());

        // A reload reads the account: the failed save is not there.
        await page.reload();
        await expectMatchesLoaded(page, t);
        await expect(saveButton(card(page, CHECK), t)).toBeVisible();
        signedInState = await context.storageState();
        await context.close();
      });

      test("IS-8 a signed-in student reports an outdated fact and the report is in the export", async ({
        browser,
      }, testInfo) => {
        const { context, page } = await openDevice(browser, signedInState);
        await page.goto(matches);
        await expectMatchesLoaded(page, t);
        const report = card(page, OK)
          .getByRole("button", { name: startsWith(t("reportOutdated.button")) })
          .first();
        await report.click();
        await expect(
          card(page, OK).getByRole("button", { name: startsWith(t("reportOutdated.reported")) }),
        ).toBeVisible();
        await shot(page, testInfo, `10-reported-${locale}`);

        const doc = await fetchExport(page);
        expect(doc.feedbackReports).toHaveLength(1);
        expect(doc.feedbackReports[0]?.record).toBe(`programs/${OK}`);
        await context.close();
      });

      test("IS-5 the account page downloads the data as a JSON file", async ({
        browser,
      }, testInfo) => {
        const { context, page } = await openDevice(browser, signedInState);
        await page.goto(`/${locale}/account`);
        await expect(page.locator("html")).toHaveAttribute("dir", dir);
        await expect(page.getByText(email).first()).toBeVisible();
        const [download] = await Promise.all([
          page.waitForEvent("download"),
          page.getByRole("button", { name: t("accountPage.export.button") }).click(),
        ]);
        expect(download.suggestedFilename()).toMatch(/^jisr-export-\d{4}-\d{2}-\d{2}\.json$/);
        const file = testInfo.outputPath(download.suggestedFilename());
        await download.saveAs(file);
        const doc = JSON.parse(await readFile(file, "utf8"));
        expect(doc.format).toBe("jisr-account-export");
        expect(doc.account.email).toBe(email);
        expect(doc.savedPrograms.map((item: { slug: string }) => item.slug).sort()).toEqual(
          [FOUNDATION, OK].sort(),
        );
        expect(doc.feedbackReports).toHaveLength(1);
        await expect(page.getByText(t("accountPage.export.done"))).toBeVisible();
        await testInfo.attach(`export-${locale}.json`, {
          path: file,
          contentType: "application/json",
        });
        await shot(page, testInfo, `11-account-page-${locale}`);
        await context.close();
      });

      test("IS-5 deletion: the emailed link asks for a confirmation, then everything is erased", async ({
        browser,
      }, testInfo) => {
        const { context, page } = await openDevice(browser, signedInState);
        await page.goto(`/${locale}/account`);
        const since = Date.now();
        await page.getByRole("button", { name: t("accountPage.delete.button") }).click();
        await expect(
          page.getByRole("heading", { name: t("accountPage.delete.sent.title") }),
        ).toBeVisible();
        await shot(page, testInfo, `12-check-your-email-${locale}`);
        // Nothing is deleted by asking.
        expect(await accountRowCount(email)).toBe(1);

        const link = await readMailLink(email, "delete-account", since);
        expect(link.pathname).toBe(`/${locale}/account/delete`);
        // The token rides the fragment, never the query string (it would reach request logs).
        expect(link.search).toBe("");
        expect(link.hash.startsWith("#token=")).toBe(true);

        // Opening the link deletes nothing; the button does.
        await page.goto(link.toString());
        const confirm = page.getByRole("button", { name: t("accountDelete.confirm") });
        await expect(confirm).toBeVisible();
        expect(await accountRowCount(email)).toBe(1);
        expect(page.url().includes("token")).toBe(false);
        expect((await localKeys(page)).length).toBeGreaterThan(0);
        await shot(page, testInfo, `13-delete-confirm-${locale}`);
        await confirm.click();
        await expect(
          page.getByRole("heading", { name: t("accountDelete.deleted.title") }),
        ).toBeVisible();
        await shot(page, testInfo, `14-deleted-${locale}`);

        // Erased: the rows, the session cookie and every jisr.* key on this device.
        expect(await accountRowCount(email)).toBe(0);
        const cookies = await context.cookies(ORIGIN);
        expect(cookies.filter((cookie) => cookie.name.includes("session"))).toEqual([]);
        expect(await localKeys(page)).toEqual([]);
        expect(await exportStatus(page)).toBe(401);
        await context.close();
      });
    });
}

// Ruling Q19: a magic link opened in a browser that did not ask for it still signs in (cross-device
// keeps working), but the landing withholds this device's data: the victim of a look-alike-address
// link cannot upload their profile to the attacker's account.
for (const locale of ["fr", "ar"] as const) {
  test(`IS-6 a link opened in another browser signs in but never offers the import (${locale})`, async ({
    browser,
  }, testInfo) => {
    const t = translatorFor(locale);
    const email = addressFor(locale, "other-browser");
    const asker = await openDevice(browser);
    const since = Date.now();
    await asker.page.goto(`/${locale}/sign-in?return=%2F${locale}%2Fplan`);
    await requestLink(asker.page, t, email);
    const link = await readMailLink(email, "magic-link", since);
    await asker.context.close();

    const other = await openDevice(browser);
    await seedGuestData(other.page, locale, [OK]);
    await confirmSignInLink(other.page, t, link);

    await expect(
      other.page.getByRole("heading", { name: t("welcome.otherBrowser.title") }),
    ).toBeVisible();
    await expect(other.page.getByRole("button", { name: t("welcome.confirm.add") })).toHaveCount(0);
    await shot(other.page, testInfo, `15-other-browser-${locale}`);
    await other.context.close();
  });
}
