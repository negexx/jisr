import type { Page, Request } from "@playwright/test";

import { E2E_PROFILE, E2E_SLUGS } from "./support/fixture-data";
import { expect, test } from "./support/fixtures";
import { E2E_LOCALES } from "./support/locales";
import { card, expectMatchesLoaded, openMatches } from "./support/matches";
import { translatorFor } from "./support/messages";
import { JOURNEY_FORM, ProfileFormDriver } from "./support/profile-form";
import { blockLocalStorage, seedProfile } from "./support/seed";
import {
  MANIFEST_URL,
  readManifest,
  shardPath,
  withCorruptedStringValue,
  withoutProgramShards,
} from "./support/snapshot";

// The program shard every E2E_PROFILE match needs (destination XB, computer science).
const PROGRAM_SHARD = "programs.XB.xx-test-field-cs";

// What a student must never read on the page: internals of a failed fetch or integrity check.
const RAW_ERROR_TEXT =
  /snapshot|integrity|sha-?256|SnapshotError|TypeError|undefined|\b500\b|\b404\b/i;

function isShardRequest(request: Request): boolean {
  return new URL(request.url()).pathname.startsWith("/snapshots/s/");
}

async function expectNoRawErrorText(page: Page): Promise<void> {
  const text = (await page.locator("main").textContent()) ?? "";
  expect(text).not.toMatch(RAW_ERROR_TEXT);
}

for (const { locale } of E2E_LOCALES) {
  const t = translatorFor(locale);

  test.describe(`empty and failing data (${locale})`, () => {
    test.describe("with a saved profile", () => {
      test.describe.configure({ mode: "parallel" });

      test.beforeEach(async ({ page }) => {
        await seedProfile(page, E2E_PROFILE);
      });

      test("an empty catalogue says the data is still being verified", async ({ page }) => {
        const manifest = withoutProgramShards(await readManifest(page));
        await page.route(MANIFEST_URL, (route) => route.fulfill({ json: manifest }));

        await page.goto(`/${locale}/matches`);
        await expect(
          page.getByRole("heading", { level: 2, name: t("matches.states.noPrograms.title") }),
        ).toBeVisible();
        await expect(page.getByText(t("matches.states.noPrograms.description"))).toBeVisible();
        await expect(page.locator("article[data-slug]")).toHaveCount(0);
        await expect(
          page.getByRole("button", { name: t("matches.states.error.retry") }),
        ).toHaveCount(0);
      });

      test("a missing shard makes the page read the manifest again, once, and still show results", async ({
        page,
      }) => {
        const real = await readManifest(page);
        const entry = real.shards[PROGRAM_SHARD];
        if (entry === undefined) throw new Error(`${PROGRAM_SHARD} is not in the fixture manifest`);
        const missingFile = "s/programs.XB.xx-test-field-cs.000000000000.json";
        // The first manifest points one program shard at a file the server does not have, as a
        // manifest left over from the previous deploy would.
        const outdated = {
          ...real,
          snapshotVersion: "0123456789ab",
          shards: { ...real.shards, [PROGRAM_SHARD]: { ...entry, file: missingFile } },
        };

        let manifestReads = 0;
        await page.route(MANIFEST_URL, (route) => {
          manifestReads += 1;
          return route.fulfill({ json: manifestReads === 1 ? outdated : real });
        });
        const shardRequests: Array<{ path: string; afterManifestRead: number }> = [];
        page.on("request", (request) => {
          if (isShardRequest(request)) {
            shardRequests.push({
              path: new URL(request.url()).pathname,
              afterManifestRead: manifestReads,
            });
          }
        });

        await openMatches(page, locale, t);
        await expect(card(page, E2E_SLUGS.ok)).toBeVisible();

        expect(manifestReads).toBe(2);
        const missing = shardRequests.filter((request) => request.path.endsWith(missingFile));
        expect(missing).toEqual([{ path: `/snapshots/${missingFile}`, afterManifestRead: 1 }]);

        // One snapshot version. The HTTP cache is off while a route is active, so a shard read
        // again after the second manifest was fetched again for that manifest, not reused: every
        // shard the first attempt read (except the missing one) is read again, and every shard
        // read after the second manifest is a file that manifest lists.
        const realFiles = new Set(
          Object.values(real.shards).map((shard) => `/snapshots/${shard.file}`),
        );
        const pathsAt = (read: number) =>
          new Set(
            shardRequests
              .filter((request) => request.afterManifestRead === read)
              .map((r) => r.path),
          );
        const first = [...pathsAt(1)].filter((file) => !file.endsWith(missingFile));
        const rebuilt = pathsAt(2);
        expect(first.length).toBeGreaterThan(0);
        for (const path of first) expect(rebuilt.has(path), `${path} read again`).toBe(true);
        for (const path of rebuilt)
          expect(realFiles.has(path), `${path} is in the manifest`).toBe(true);
        expect(rebuilt.has(shardPath(real, PROGRAM_SHARD))).toBe(true);
      });

      test("a corrupted shard shows an error with Retry, which recovers once the data is right", async ({
        page,
      }) => {
        const real = await readManifest(page);
        const url = `**${shardPath(real, PROGRAM_SHARD)}`;
        await page.route(url, async (route) => {
          const response = await route.fetch();
          const bytes = withCorruptedStringValue(await response.body());
          await route.fulfill({ response, body: bytes });
        });

        await page.goto(`/${locale}/matches`);
        await expect(
          page.getByRole("heading", { level: 2, name: t("matches.states.error.title") }),
        ).toBeVisible();
        await expectNoRawErrorText(page);
        const retry = page.getByRole("button", { name: t("matches.states.error.retry") });
        await expect(retry).toBeVisible();
        await expect(page.locator("article[data-slug]")).toHaveCount(0);

        await page.unroute(url);
        await retry.click();
        await expectMatchesLoaded(page, t);
        await expect(card(page, E2E_SLUGS.ok)).toBeVisible();
      });

      test("a failing manifest shows an error with Retry and no technical text", async ({
        page,
      }) => {
        await page.route(MANIFEST_URL, (route) =>
          route.fulfill({ status: 500, contentType: "text/plain", body: "internal trace 500" }),
        );

        await page.goto(`/${locale}/matches`);
        await expect(
          page.getByRole("heading", { level: 2, name: t("matches.states.error.title") }),
        ).toBeVisible();
        await expect(page.getByText(t("matches.states.error.description"))).toBeVisible();
        await expectNoRawErrorText(page);
        const retry = page.getByRole("button", { name: t("matches.states.error.retry") });

        await page.unroute(MANIFEST_URL);
        await retry.click();
        await expectMatchesLoaded(page, t);
      });
    });

    test("blocked storage: the form warns, and the student still reaches their matches", async ({
      page,
    }) => {
      await blockLocalStorage(page);
      const form = new ProfileFormDriver(page, locale);
      await form.open();
      await expect(page.getByText(t("profile.notices.storage"))).toBeVisible();

      await form.fillToReview(JOURNEY_FORM);
      await form.submit();
      await expectMatchesLoaded(page, t);
      await expect(card(page, E2E_SLUGS.ok)).toHaveAttribute("data-group", "ok");
    });

    test("an unknown program is a 404, not a server error", async ({ page }) => {
      const response = await page.goto(`/${locale}/programs/xx-no-such-program`);
      expect(response?.status()).toBe(404);
    });
  });
}
