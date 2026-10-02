import { CHECKLIST_STEP_IDS } from "@/domain/types";

import { openPicker, pickerBox } from "./support/compare";
import { BASE_ORIGIN, E2E_SLUGS, PLAN_KEY, PROFILE_KEY, SAVED_KEY } from "./support/fixture-data";
import { expect, test } from "./support/fixtures";
import { E2E_LOCALES } from "./support/locales";
import { card, expectMatchesLoaded } from "./support/matches";
import { escapeRegExp, startsWith, translatorFor } from "./support/messages";
import {
  expectPlanLoaded,
  navLink,
  PROGRAM_NAMES,
  savedButton,
  saveFromCard,
  selectProgram,
  stepCheckbox,
  todoStepIds,
} from "./support/plan";
import { JOURNEY_FORM, ProfileFormDriver, type ProfileFormValues } from "./support/profile-form";
import { recordTraffic, type Traffic } from "./support/traffic";

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

// Whole tokens only: "1375" or "xz" inside a chunk or shard hash, or in a Next router value, is not
// the student's grade or nationality. A value counts when no letter or digit touches it.
function leaks(text: string): string[] {
  return PRIVATE_VALUES.filter((value) =>
    new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(value)}(?![A-Za-z0-9])`, "i").test(text),
  );
}

// What a request must not carry once the student has saved programs and ticked steps: a program
// slug or a checklist step id. Same whole-token rule as `leaks`.
const SAVED_VALUES: readonly string[] = [...Object.values(E2E_SLUGS), ...CHECKLIST_STEP_IDS];

function savedLeaks(text: string): string[] {
  return SAVED_VALUES.filter((value) =>
    new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(value)}(?![A-Za-z0-9])`, "i").test(text),
  );
}

// The shard files a page asked for, as sorted paths.
function shardFilesOf(traffic: Traffic): string[] {
  return traffic.requests
    .map((request) => new URL(request.url).pathname)
    .filter((pathname) => pathname.startsWith("/snapshots/s/"))
    .sort();
}

function decoded(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

// Build output under /_next/static/ is the same for every visitor and not request data.
function urlLeaks(url: URL): string[] {
  if (url.pathname.startsWith("/_next/static/")) return [];
  return leaks(decoded(`${url.pathname}${url.search}${url.hash}`));
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
        expect(urlLeaks(url), `values in ${url.pathname}`).toEqual([]);
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

      // Referer, router state and every other request header, not only the URL.
      for (const { url, headers } of await traffic.requestHeaders()) {
        expect(Object.keys(headers).map((name) => name.toLowerCase())).not.toContain("cookie");
        for (const [name, value] of Object.entries(headers)) {
          expect(leaks(decoded(value)), `${name} header of ${url}`).toEqual([]);
        }
      }

      for (const response of await traffic.responses()) {
        const names = response.headers.map((header) => header.name.toLowerCase());
        expect(names, `headers of ${response.url}`).not.toContain("set-cookie");
      }

      for (const message of traffic.consoleMessages) {
        expect(leaks(message.text), `console ${message.type}`).toEqual([]);
      }
    });

    test("saving programs and ticking steps adds no request, cookie or browser storage beyond the snapshot shards", async ({
      page,
      context,
    }) => {
      const traffic = recordTraffic(page);
      const form = new ProfileFormDriver(page, locale);
      const OK = E2E_SLUGS.ok;
      const CHECK = E2E_SLUGS.check;

      await page.goto(`/${locale}`);
      await page.getByRole("link", { name: startsWith(t("home.cta")) }).click();
      await expect(form.nationality()).toBeVisible();
      await form.fillToReview(PRIVATE_FORM);
      await form.submit();
      await expectMatchesLoaded(page, t);
      await saveFromCard(page, t, OK);
      await saveFromCard(page, t, CHECK);

      // A full load of the plan page: its island fetches the shards of the saved programs.
      const beforePlan = traffic.requests.length;
      await page.goto(`/${locale}/plan`);
      await expectPlanLoaded(page, t);
      const [first] = await todoStepIds(page);
      if (first === undefined) throw new Error("the plan has no steps");
      await stepCheckbox(page, t, first).check();
      await selectProgram(page, t, PROGRAM_NAMES[CHECK]);
      await selectProgram(page, t, PROGRAM_NAMES[OK]);
      await expect(stepCheckbox(page, t, first)).toBeChecked();

      // Storage: exactly the three keys of this app, nothing in the other browser stores.
      const storage = await page.evaluate(async () => ({
        localKeys: Object.keys(window.localStorage).sort(),
        sessionKeys: Object.keys(window.sessionStorage),
        cookie: document.cookie,
        databases: (await indexedDB.databases()).map((database) => database.name),
        caches: await caches.keys(),
      }));
      expect(storage.localKeys).toEqual([PLAN_KEY, PROFILE_KEY, SAVED_KEY].sort());
      expect(storage.sessionKeys).toEqual([]);
      expect(storage.databases).toEqual([]);
      expect(storage.caches).toEqual([]);
      expect(storage.cookie).toBe("");
      expect(await context.cookies()).toEqual([]);
      expect(context.serviceWorkers()).toEqual([]);

      // Phase 1: everything since the plan page was loaded.
      const planRequests = traffic.requests.slice(beforePlan);
      expect(planRequests.length).toBeGreaterThan(0);
      const shardFiles: string[] = [];
      for (const request of planRequests) {
        const url = new URL(request.url);
        expect(url.origin, `origin of ${url.pathname}`).toBe(BASE_ORIGIN);
        expect(request.method, `method of ${url.pathname}`).toBe("GET");
        expect(request.postData, `body of ${url.pathname}`).toBeNull();
        const text = decoded(`${url.pathname}${url.search}${url.hash}`);
        if (url.pathname.startsWith("/snapshots/")) {
          // Shard names are reference data ("scholarships.XB" is also a step id), so a shard path
          // must match the published pattern exactly and hold no program slug.
          expect(url.pathname).toMatch(SNAPSHOT_PATH);
          expect(url.search).toBe("");
          expect(
            savedLeaks(text).filter((value) => !CHECKLIST_STEP_IDS.some((id) => id === value)),
            `program slug in ${url.pathname}`,
          ).toEqual([]);
          expect(leaks(text), `values in ${url.pathname}`).toEqual([]);
          shardFiles.push(url.pathname);
        } else if (url.pathname.startsWith("/_next/static/")) {
          // Build output, the same for every visitor.
        } else {
          // The plan page itself and the header's links (Next prefetches them): same-locale routes
          // of the app, never an API or a third party.
          const routes = ["", "/profile", "/matches", "/plan"].map((route) => `/${locale}${route}`);
          expect(routes, `unexpected request ${url.pathname}`).toContain(url.pathname);
          expect(savedLeaks(text), `saved values in ${url.pathname}`).toEqual([]);
          expect(leaks(text), `values in ${url.pathname}`).toEqual([]);
        }
      }
      // The shard names reveal the country and field of each saved program (the privacy note in
      // architecture.md), and nothing finer.
      for (const shard of ["programs.XB.xx-test-field-cs", "programs.XB.xx-test-field-eng"]) {
        expect(
          shardFiles.some((file) => file.startsWith(`/snapshots/s/${shard}.`)),
          `shard ${shard} requested`,
        ).toBe(true);
      }
      const planHeaders = (await traffic.requestHeaders()).slice(beforePlan);
      for (const { url, headers } of planHeaders) {
        expect(Object.keys(headers).map((name) => name.toLowerCase())).not.toContain("cookie");
        for (const [name, value] of Object.entries(headers)) {
          const text = decoded(value);
          expect(savedLeaks(text), `${name} header of ${url}`).toEqual([]);
          expect(leaks(text), `${name} header of ${url}`).toEqual([]);
        }
      }

      // Phase 2: the program page. Its own path is the one place a slug may appear.
      const beforeProgram = traffic.requests.length;
      await page.getByRole("link", { name: startsWith(t("plan.program.viewProgram")) }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/programs/${OK}$`));
      await expect(savedButton(page, t)).toBeVisible();
      await navLink(page, t, "plan").click();
      await expectPlanLoaded(page, t);
      for (const request of traffic.requests.slice(beforeProgram)) {
        const url = new URL(request.url);
        expect(url.origin).toBe(BASE_ORIGIN);
        expect(request.method).toBe("GET");
        expect(request.postData).toBeNull();
        if (url.pathname.startsWith("/_next/static/")) continue;
        const text = decoded(`${url.pathname}${url.search}${url.hash}`);
        if (url.pathname !== `/${locale}/programs/${OK}`) {
          expect(savedLeaks(text), `saved values in ${url.pathname}`).toEqual([]);
        }
        expect(leaks(text), `values in ${url.pathname}`).toEqual([]);
      }

      for (const response of await traffic.responses()) {
        const names = response.headers.map((header) => header.name.toLowerCase());
        expect(names, `headers of ${response.url}`).not.toContain("set-cookie");
      }
      for (const message of traffic.consoleMessages) {
        expect(leaks(message.text), `console ${message.type}`).toEqual([]);
        expect(savedLeaks(message.text), `console ${message.type}`).toEqual([]);
      }
    });

    test("comparing saved programs sends no program slug anywhere and stores nothing new", async ({
      page,
      context,
      browser,
    }) => {
      const traffic = recordTraffic(page);
      const form = new ProfileFormDriver(page, locale);
      const OK = E2E_SLUGS.ok;
      const CHECK = E2E_SLUGS.check;
      const FOUNDATION = E2E_SLUGS.foundation;

      await page.goto(`/${locale}`);
      await page.getByRole("link", { name: startsWith(t("home.cta")) }).click();
      await expect(form.nationality()).toBeVisible();
      await form.fillToReview(PRIVATE_FORM);
      await form.submit();
      await expectMatchesLoaded(page, t);
      await saveFromCard(page, t, OK);
      await saveFromCard(page, t, CHECK);
      await saveFromCard(page, t, FOUNDATION);

      const keysBefore = await page.evaluate(() => Object.keys(window.localStorage).sort());
      expect(keysBefore).toEqual([PROFILE_KEY, SAVED_KEY].sort());
      const savedBefore = await page.evaluate((key) => window.localStorage.getItem(key), SAVED_KEY);

      // A full load of the compare page, then a swap: untick one program and tick it again.
      const beforeCompare = traffic.requests.length;
      await page.goto(`/${locale}/compare`);
      await expect(page.getByRole("heading", { level: 1, name: t("compare.title") })).toBeVisible();
      await expect(page.locator("section[data-row]").first()).toBeVisible();
      await openPicker(page);
      await pickerBox(page, FOUNDATION).uncheck();
      await expect(page.locator('section[data-row="result"] li[data-slug]')).toHaveCount(2);
      await pickerBox(page, FOUNDATION).check();
      await expect(page.locator('section[data-row="result"] li[data-slug]')).toHaveCount(3);

      // Storage: the same keys with the same saved list, nothing in the other browser stores.
      const storage = await page.evaluate(async () => ({
        localKeys: Object.keys(window.localStorage).sort(),
        sessionKeys: Object.keys(window.sessionStorage),
        cookie: document.cookie,
        databases: (await indexedDB.databases()).map((database) => database.name),
        caches: await caches.keys(),
      }));
      expect(storage.localKeys).toEqual(keysBefore);
      expect(await page.evaluate((key) => window.localStorage.getItem(key), SAVED_KEY)).toBe(
        savedBefore,
      );
      expect(storage.sessionKeys).toEqual([]);
      expect(storage.databases).toEqual([]);
      expect(storage.caches).toEqual([]);
      expect(storage.cookie).toBe("");
      expect(await context.cookies()).toEqual([]);
      expect(context.serviceWorkers()).toEqual([]);

      const compareRequests = traffic.requests.slice(beforeCompare);
      expect(compareRequests.length).toBeGreaterThan(0);
      for (const request of compareRequests) {
        const url = new URL(request.url);
        expect(url.origin, `origin of ${url.pathname}`).toBe(BASE_ORIGIN);
        expect(request.method, `method of ${url.pathname}`).toBe("GET");
        expect(request.postData, `body of ${url.pathname}`).toBeNull();
        const text = decoded(`${url.pathname}${url.search}${url.hash}`);
        if (url.pathname.startsWith("/snapshots/")) {
          expect(url.pathname).toMatch(SNAPSHOT_PATH);
          expect(url.search).toBe("");
          expect(
            savedLeaks(text).filter((value) => !CHECKLIST_STEP_IDS.some((id) => id === value)),
            `program slug in ${url.pathname}`,
          ).toEqual([]);
          expect(leaks(text), `values in ${url.pathname}`).toEqual([]);
        } else if (url.pathname.startsWith("/_next/static/")) {
          // Build output, the same for every visitor.
        } else {
          const routes = ["", "/profile", "/matches", "/plan", "/compare"].map(
            (route) => `/${locale}${route}`,
          );
          expect(routes, `unexpected request ${url.pathname}`).toContain(url.pathname);
          expect(savedLeaks(text), `saved values in ${url.pathname}`).toEqual([]);
          expect(leaks(text), `values in ${url.pathname}`).toEqual([]);
        }
      }
      const compareHeaders = (await traffic.requestHeaders()).slice(beforeCompare);
      for (const { url, headers } of compareHeaders) {
        expect(Object.keys(headers).map((name) => name.toLowerCase())).not.toContain("cookie");
        for (const [name, value] of Object.entries(headers)) {
          const text = decoded(value);
          expect(savedLeaks(text), `${name} header of ${url}`).toEqual([]);
          expect(leaks(text), `${name} header of ${url}`).toEqual([]);
        }
      }
      for (const response of await traffic.responses()) {
        const names = response.headers.map((header) => header.name.toLowerCase());
        expect(names, `headers of ${response.url}`).not.toContain("set-cookie");
      }
      for (const message of traffic.consoleMessages) {
        expect(leaks(message.text), `console ${message.type}`).toEqual([]);
        expect(savedLeaks(message.text), `console ${message.type}`).toEqual([]);
      }

      // The same shards as the plan page asks for with this saved list: two fresh browser contexts
      // with the same storage, so neither is helped by what the other has cached.
      const storageState = await context.storageState();
      async function shardsOfFreshVisit(route: "/plan" | "/compare"): Promise<string[]> {
        const fresh = await browser.newContext({ baseURL: BASE_ORIGIN, storageState });
        try {
          const freshPage = await fresh.newPage();
          const freshTraffic = recordTraffic(freshPage);
          await freshPage.goto(`/${locale}${route}`);
          if (route === "/plan") await expectPlanLoaded(freshPage, t);
          else await expect(freshPage.locator("section[data-row]").first()).toBeVisible();
          await freshPage.waitForLoadState("networkidle");
          return shardFilesOf(freshTraffic);
        } finally {
          await fresh.close();
        }
      }
      const planShards = await shardsOfFreshVisit("/plan");
      const compareShards = await shardsOfFreshVisit("/compare");
      expect(planShards.length).toBeGreaterThan(0);
      expect(compareShards).toEqual(planShards);
      // Country and field of each saved program are all the shard names reveal.
      for (const shard of [
        "programs.XB.xx-test-field-cs",
        "programs.XB.xx-test-field-eng",
        "programs.XC.xx-test-field-cs",
      ]) {
        expect(
          compareShards.some((file) => file.startsWith(`/snapshots/s/${shard}.`)),
          `shard ${shard} requested`,
        ).toBe(true);
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
