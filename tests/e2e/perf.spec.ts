import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { Page, Response } from "@playwright/test";
import { test as unpinned } from "@playwright/test";

import { initialScriptPaths, measureRoute } from "../../scripts/perf/measure";
import { E2E_PROFILE, E2E_SLUGS } from "./support/fixture-data";
import { expect, test } from "./support/fixtures";
import { ADR_TARGET_KB, JS_BUDGET_KB } from "./support/js-budget";
import { E2E_LOCALES, type E2eLocale } from "./support/locales";
import { card } from "./support/matches";
import { ProfileFormDriver } from "./support/profile-form";
import { seedProfile } from "./support/seed";

// ADR 0004: a shard over 300 KB gzipped is a build failure; the browser must see the same limit.
const SHARD_LIMIT_BYTES = 300 * 1024;
const ZOD_MARKERS = ["ZodError", "_zod"] as const;
const PERF_LOG = path.resolve("test-results", "perf.jsonl");
// Transferred bytes (Next's own gzip) against the build's gzip -6 of the same files: same files, so close.
const CROSS_CHECK_TOLERANCE = 0.05;
// Node's compression middleware leaves bodies under 1 KB as they are.
const COMPRESSION_THRESHOLD_BYTES = 1024;

type PageCase = {
  name: string;
  route: (locale: E2eLocale) => string;
  seeded: boolean;
  ready: (page: Page, locale: E2eLocale) => Promise<void>;
  // Link targets the page must not prefetch (matched against the pathname of `_rsc` fetches).
  notPrefetched?: RegExp;
};

const PAGES: readonly PageCase[] = [
  {
    name: "home",
    route: (locale) => `/${locale}`,
    seeded: false,
    ready: async (page) => {
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    },
  },
  {
    name: "profile",
    route: (locale) => `/${locale}/profile`,
    seeded: false,
    ready: async (page, locale) => {
      await expect(new ProfileFormDriver(page, locale).nationality()).toBeVisible();
    },
  },
  {
    name: "matches",
    route: (locale) => `/${locale}/matches`,
    seeded: true,
    notPrefetched: /\/programs\//,
    ready: async (page) => {
      await expect(card(page, E2E_SLUGS.ok)).toBeVisible();
    },
  },
  {
    name: "program",
    route: (locale) => `/${locale}/programs/${E2E_SLUGS.ok}`,
    seeded: true,
    ready: async (page) => {
      await expect(page.locator('[data-slot="personal-result"]')).toHaveAttribute(
        "data-group",
        "ok",
      );
    },
  },
];

type Script = {
  path: string;
  bytes: number;
  decodedBytes: number;
  encoding: string | undefined;
  body: string;
};

async function scriptOf(response: Response): Promise<Script> {
  const sizes = await response.request().sizes();
  const decoded = await response.body();
  return {
    path: new URL(response.url()).pathname,
    bytes: sizes.responseBodySize,
    decodedBytes: decoded.length,
    encoding: (await response.allHeaders())["content-encoding"],
    body: decoded.toString("utf8"),
  };
}

// Next's router fetches route payloads with an `_rsc` query parameter; up to network idle on a page
// that was just loaded, those are prefetches for the pages its links lead to.
function isRscFetch(response: Response): boolean {
  const type = response.request().resourceType();
  return (type === "fetch" || type === "xhr") && new URL(response.url()).searchParams.has("_rsc");
}

function kb(bytes: number): number {
  return Math.round((bytes / 1024) * 10) / 10;
}

test.describe("JavaScript per page (ratchet, not the ADR target)", () => {
  test.describe.configure({ mode: "parallel" });

  for (const { locale } of E2E_LOCALES) {
    for (const pageCase of PAGES) {
      const route = pageCase.route(locale);

      test(`${route}`, async ({ page }, testInfo) => {
        if (pageCase.seeded) await seedProfile(page, E2E_PROFILE);

        const scriptResponses: Response[] = [];
        const rscResponses: Response[] = [];
        page.on("response", (response) => {
          const request = response.request();
          if (request.resourceType() === "script") scriptResponses.push(response);
          else if (isRscFetch(response)) rscResponses.push(response);
        });

        const document = await page.goto(route);
        if (document === null) throw new Error(`no document response for ${route}`);
        const referenced = new Set(initialScriptPaths(await document.text()));
        await pageCase.ready(page, locale);
        await page.waitForLoadState("networkidle");

        const scripts = await Promise.all(scriptResponses.map(scriptOf));
        expect(scripts.length).toBeGreaterThan(0);
        for (const script of scripts) {
          if (script.decodedBytes > COMPRESSION_THRESHOLD_BYTES) {
            expect(script.encoding, `content-encoding of ${script.path}`).toBe("gzip");
          }
          for (const marker of ZOD_MARKERS) {
            expect(script.body, `${marker} in ${script.path}`).not.toContain(marker);
          }
        }

        // "initial": the scripts the HTML itself asks for, what Next calls First Load JS and what
        // ADR 0004 budgets. "untilIdle": everything fetched up to network idle, which also counts
        // the chunks the app prefetches for the pages its links lead to.
        const initial = scripts
          .filter((script) => referenced.has(script.path))
          .reduce((sum, script) => sum + script.bytes, 0);
        const untilIdle = scripts.reduce((sum, script) => sum + script.bytes, 0);
        // Not scripts, so not in the ratchet: the RSC payloads Next fetches for the link targets.
        const rscPrefetch = (
          await Promise.all(
            rscResponses.map(
              async (response) => (await response.request().sizes()).responseBodySize,
            ),
          )
        ).reduce((sum, bytes) => sum + bytes, 0);
        const budget = JS_BUDGET_KB[route];
        if (budget === undefined) throw new Error(`no ratchet budget for ${route}`);
        const fromBuild = measureRoute(".next", route).totalGzipBytes;

        const row = {
          project: testInfo.project.name,
          route,
          initialKb: kb(initial),
          untilIdleKb: kb(untilIdle),
          rscPrefetchKb: kb(rscPrefetch),
          rscPrefetchRequests: rscResponses.length,
          buildKb: kb(fromBuild),
          initialGapKb: kb(initial - ADR_TARGET_KB * 1024),
          untilIdleGapKb: kb(untilIdle - ADR_TARGET_KB * 1024),
          ratchetInitialKb: budget.initial,
          ratchetUntilIdleKb: budget.untilIdle,
        };
        console.log(`perf ${JSON.stringify(row)}`);
        mkdirSync(path.dirname(PERF_LOG), { recursive: true });
        appendFileSync(PERF_LOG, `${JSON.stringify(row)}\n`);

        expect(
          Math.abs(initial - fromBuild) / fromBuild,
          "browser vs build measurement",
        ).toBeLessThan(CROSS_CHECK_TOLERANCE);
        expect(
          initial / 1024,
          `${route} initial JS (ratchet ${budget.initial} KB)`,
        ).toBeLessThanOrEqual(budget.initial);
        expect(
          untilIdle / 1024,
          `${route} JS until idle (ratchet ${budget.untilIdle} KB)`,
        ).toBeLessThanOrEqual(budget.untilIdle);
        const { notPrefetched } = pageCase;
        if (notPrefetched !== undefined) {
          const prefetched = rscResponses.map((response) => new URL(response.url()).pathname);
          expect(prefetched.filter((pathname) => notPrefetched.test(pathname))).toEqual([]);
        }
      });
    }
  }
});

test.describe("snapshot delivery", () => {
  for (const { locale } of E2E_LOCALES) {
    test(`shard size and cache headers (${locale})`, async ({ page }) => {
      await seedProfile(page, E2E_PROFILE);
      const responses: Response[] = [];
      page.on("response", (response) => {
        if (new URL(response.url()).pathname.startsWith("/snapshots/")) responses.push(response);
      });

      await page.goto(`/${locale}/matches`);
      await expect(card(page, E2E_SLUGS.ok)).toBeVisible();

      const shards = responses.filter((response) => response.url().includes("/snapshots/s/"));
      const manifests = responses.filter((response) => response.url().endsWith("/manifest.json"));
      expect(shards.length).toBeGreaterThan(0);
      expect(manifests).toHaveLength(1);

      for (const shard of shards) {
        const { responseBodySize } = await shard.request().sizes();
        expect(responseBodySize, shard.url()).toBeLessThanOrEqual(SHARD_LIMIT_BYTES);
        const cacheControl = (await shard.allHeaders())["cache-control"] ?? "";
        expect(cacheControl, shard.url()).toContain("immutable");
        expect(cacheControl, shard.url()).toContain("max-age=31536000");
      }
      for (const manifest of manifests) {
        expect((await manifest.allHeaders())["cache-control"]).toBe("no-cache");
      }
    });
  }
});

// The pinned clock replaces `performance`, which resource timing needs, so this one runs unpinned:
// caching does not depend on the date.
unpinned.describe("snapshot caching", () => {
  for (const { locale } of E2E_LOCALES) {
    unpinned(
      `a second visit to the matches reads the manifest again but no shard (${locale})`,
      async ({ page }) => {
        await seedProfile(page, E2E_PROFILE);
        await page.goto(`/${locale}/matches`);
        await expect(card(page, E2E_SLUGS.ok)).toBeVisible();
        await page.waitForLoadState("networkidle");

        await page.goto(`/${locale}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await page.goto(`/${locale}/matches`);
        await expect(card(page, E2E_SLUGS.ok)).toBeVisible();
        await page.waitForLoadState("networkidle");

        const entries = await page.evaluate(() =>
          performance
            .getEntriesByType("resource")
            .filter((entry) => entry.name.includes("/snapshots/"))
            .map((entry) => ({
              name: new URL(entry.name).pathname,
              transferSize: (entry as PerformanceResourceTiming).transferSize,
            })),
        );
        const shardEntries = entries.filter((entry) => entry.name.startsWith("/snapshots/s/"));
        const manifestEntries = entries.filter(
          (entry) => entry.name === "/snapshots/manifest.json",
        );
        expect(shardEntries.length).toBeGreaterThan(0);
        // transferSize 0 means the bytes came from the HTTP cache, not from the network.
        for (const entry of shardEntries) expect(entry.transferSize, entry.name).toBe(0);
        expect(manifestEntries).toHaveLength(1);
        expect(manifestEntries[0]?.transferSize).toBeGreaterThan(0);
      },
    );
  }
});
