import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

import { CostProfileRecordSchema } from "@/data-schema/records/cost-profile";

import {
  auditCsv,
  drawBatch,
  findPrepared,
  parseAudit,
  sampleSheet,
} from "../../../scripts/import/audit";
import {
  buildProfile,
  isAllowedByRobots,
  loadCities,
  numbeoCityUrl,
  numbeoCountryUrl,
  numbeoFetch,
  runCosts,
} from "../../../scripts/import/costs";
import { cachePath, isCached } from "../../../scripts/import/http";
import { promoteApproved, stampVerified } from "../../../scripts/import/promote";
import {
  FOOD_BASKET,
  NUMBEO_USER_AGENT,
  parseNumbeoPage,
} from "../../../scripts/import/sources/numbeo";
import { listStaged, stageFile } from "../../../scripts/import/staging";

const row = (name: string, avg: string, low?: string, high?: string, symbol = "&#8364;"): string =>
  `<tr><td>${name} </td> <td style="text-align: right" class="priceValue "> <span class="first_currency">${symbol}${avg}</span></td>` +
  (low === undefined
    ? " </tr>"
    : ` <td class="priceBarTd "> <span class="barTextLeft"> ${low}</span><div class="barViewTd"></div><span class="barTextRight">${high}</span></td> </tr>`);

const HOUSING = "1 Bedroom Apartment Outside of City Centre";
const TRANSPORT = "Monthly Public Transport Pass (Regular Price)";

const cityFooter =
  "<div>This city had 1579 entries in the past 12 months by 246 different contributors. <br/>Last update: 3 October 2026</div>";
const countryFooter =
  "<div>This country had 9220 entries in the past 12 months by 981 different contributors. <br/>Last update: 5 October 2026</div>";

// Basket rows at low 1.00 / high 2.00: the food line is 36 to 72 (quantities add up to 36 units).
// `place` is the name in the h1 (a city page by default Paris); `symbol` the currency shown in the
// average cells. Pass `place: null` for a page without the heading.
function numbeoHtml(
  options: { footer?: string; skip?: string[]; place?: string | null; symbol?: string } = {},
): string {
  const skip = options.skip ?? [];
  const symbol = options.symbol ?? "&#8364;";
  const place = options.place === undefined ? "Paris" : options.place;
  const rows = [
    row(HOUSING, "640.50", "450.00", "1,065.00", symbol),
    row(TRANSPORT, "50.00", "30.00", "86.40", symbol),
    ...FOOD_BASKET.map((item) => row(item.name, "1.50", "1.00", "2.00", symbol)),
  ].filter((html) => !skip.some((name) => html.includes(`<td>${name} </td>`)));
  const heading =
    place === null
      ? ""
      : `<title>Cost of Living in ${place}. Oct 2026. Prices in ${place}</title><h1> Cost of Living in ${place}</h1>`;
  return `<html><head>${heading}</head><body><table class="data_wide_table new_data_table">${rows.join("\n")}</table>${options.footer ?? cityFooter}</body></html>`;
}

const franceHtml = () => numbeoHtml({ footer: countryFooter, place: "France" });
const hungaryHtml = () => numbeoHtml({ footer: countryFooter, place: "Hungary", symbol: "Ft" });
const budapestHtml = () => numbeoHtml({ place: "Budapest", symbol: "Ft" });
const gre = "Saint-Martin-d'Hères";
const greHtml = () => numbeoHtml({ place: gre });

const FOOD_UNITS = FOOD_BASKET.reduce((sum, item) => sum + item.quantity, 0);

let root: string;
let dataDir: string;
let stagingDir: string;

async function writeYaml(file: string, text: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
}

const institution = (slug: string, country: string, citySlug: string, cityName: string) =>
  writeYaml(
    path.join(dataDir, "institutions", `${slug}.yaml`),
    `slug: ${slug}\ncountry: ${country}\ncity:\n  slug: ${citySlug}\n  name: "${cityName}"\n`,
  );

const programme = (slug: string, inst: string, country: string, citySlug: string) =>
  writeYaml(
    path.join(dataDir, "programs", `${slug}.yaml`),
    `slug: ${slug}\ninstitution: ${inst}\ncountry: ${country}\ncity: ${citySlug}\n`,
  );

beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), "jisr-costs-"));
  dataDir = path.join(root, "data");
  stagingDir = path.join(root, "staging");
  await institution("fr-inst-paris", "FR", "paris", "Paris");
  await institution("fr-inst-gre", "FR", "saint-martin-d-heres", "Saint-Martin-d'Hères");
  await institution("nl-inst-hague", "NL", "s-gravenhage", "'s-Gravenhage");
  await institution("hu-inst-bp", "HU", "budapest", "Budapest");
  await programme("fr-p1", "fr-inst-paris", "FR", "paris");
  await programme("fr-p2", "fr-inst-paris", "FR", "paris");
  await programme("fr-p3", "fr-inst-gre", "FR", "saint-martin-d-heres");
  await programme("nl-p1", "nl-inst-hague", "NL", "s-gravenhage");
  await programme("hu-p1", "hu-inst-bp", "HU", "budapest");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("urls", () => {
  it("builds city urls with dashes for spaces and percent-encoded accents", () => {
    expect(numbeoCityUrl("Paris", "EUR")).toBe(
      "https://www.numbeo.com/cost-of-living/in/Paris?displayCurrency=EUR",
    );
    expect(numbeoCityUrl("Saint-Martin-d'Hères", "EUR")).toBe(
      "https://www.numbeo.com/cost-of-living/in/Saint-Martin-d'H%C3%A8res?displayCurrency=EUR",
    );
    expect(numbeoCityUrl("'s-Gravenhage", "EUR")).toBe(
      "https://www.numbeo.com/cost-of-living/in/'s-Gravenhage?displayCurrency=EUR",
    );
    expect(numbeoCityUrl("Le Havre", "EUR")).toBe(
      "https://www.numbeo.com/cost-of-living/in/Le-Havre?displayCurrency=EUR",
    );
    expect(numbeoCityUrl("Budapest", "HUF")).toBe(
      "https://www.numbeo.com/cost-of-living/in/Budapest?displayCurrency=HUF",
    );
  });

  it("builds country urls", () => {
    expect(numbeoCountryUrl("France", "EUR")).toBe(
      "https://www.numbeo.com/cost-of-living/country_result.jsp?country=France&displayCurrency=EUR",
    );
    expect(numbeoCountryUrl("Hungary", "HUF")).toBe(
      "https://www.numbeo.com/cost-of-living/country_result.jsp?country=Hungary&displayCurrency=HUF",
    );
  });
});

describe("isAllowedByRobots", () => {
  it("refuses the two disallowed prefixes and allows normal pages", () => {
    expect(isAllowedByRobots("https://www.numbeo.com/heavy_crawling.any?x=1")).toBe(false);
    expect(isAllowedByRobots("https://www.numbeo.com/DEPRECATED/page")).toBe(false);
    expect(
      isAllowedByRobots("https://www.numbeo.com/cost-of-living/in/Paris?displayCurrency=EUR"),
    ).toBe(true);
    expect(
      isAllowedByRobots(
        "https://www.numbeo.com/cost-of-living/country_result.jsp?country=France&displayCurrency=EUR",
      ),
    ).toBe(true);
  });
});

describe("isCached", () => {
  it("is true only for a url whose response is in the cache directory", async () => {
    const cacheDir = path.join(root, "cache");
    const url = "https://www.numbeo.com/cost-of-living/in/Paris?displayCurrency=EUR";
    expect(isCached(url, { cacheDir })).toBe(false);
    await writeYaml(cachePath(url, cacheDir), "<html></html>");
    expect(isCached(url, { cacheDir })).toBe(true);
    expect(isCached(url, { cacheDir, refresh: true })).toBe(false);
    expect(isCached("https://www.numbeo.com/cost-of-living/in/Lyon", { cacheDir })).toBe(false);
  });
});

describe("loadCities", () => {
  it("joins programmes to institutions, one row per country and city slug", async () => {
    expect(await loadCities(dataDir)).toEqual([
      { country: "FR", citySlug: "paris", name: "Paris" },
      { country: "FR", citySlug: "saint-martin-d-heres", name: "Saint-Martin-d'Hères" },
      { country: "HU", citySlug: "budapest", name: "Budapest" },
      { country: "NL", citySlug: "s-gravenhage", name: "'s-Gravenhage" },
    ]);
  });
});

describe("buildProfile", () => {
  const page = parseNumbeoPage(numbeoHtml());
  const url = numbeoCityUrl("Paris", "EUR");
  const build = (overrides: Partial<Parameters<typeof buildProfile>[0]> = {}) =>
    buildProfile({
      slug: "fr-paris-numbeo",
      country: "FR",
      city: "paris",
      url,
      page,
      currency: "EUR",
      preparedAt: "2026-10-05",
      ...overrides,
    });

  it("stages housing, food and transport as monthly estimates in minor units", () => {
    const profile = build();
    expect(profile).not.toBeNull();
    expect(profile?.slug).toBe("fr-paris-numbeo");
    expect(profile?.country).toBe("FR");
    expect(profile?.city).toBe("paris");
    expect(profile?.lines.housing?.value).toEqual({
      min: 45000,
      max: 106500,
      currency: "EUR",
      per: "month",
    });
    expect(profile?.lines.transport?.value).toEqual({
      min: 3000,
      max: 8700,
      currency: "EUR",
      per: "month",
    });
    expect(profile?.lines.food?.value).toEqual({
      min: FOOD_UNITS * 100,
      max: FOOD_UNITS * 200,
      currency: "EUR",
      per: "month",
    });
    for (const line of Object.values(profile?.lines ?? {})) {
      expect(line.source).toBe("numbeo");
      expect(line.info_kind).toBe("estimate");
    }
    expect(profile?.sources).toEqual({ numbeo: { url, last_verified_at: null } });
  });

  it("carries a review block with the quote behind each line", () => {
    const review = build()?._review;
    expect(review?.kind).toBe("cost-profiles");
    expect(review?.preparedBy).toBe("assistant");
    expect(review?.preparedAt).toBe("2026-10-05");
    expect(review?.sourceId).toBe("numbeo:fr-paris-numbeo");
    expect(review?.evidence.map((e) => e.fact)).toEqual([
      "lines.housing",
      "lines.food",
      "lines.transport",
    ]);
    const [housing, food] = review?.evidence ?? [];
    expect(housing?.url).toBe(url);
    expect(housing?.quote).toContain(HOUSING);
    expect(housing?.quote).toContain("450.00");
    expect(housing?.quote).toContain("1065.00");
    expect(food?.quote).toContain("Milk (Regular, 1 Liter) x 8");
    expect(food?.quote).toContain("Meal at an Inexpensive Restaurant x 8");
  });

  it("names Numbeo, the page date, the formula and the basket in every locale basis", () => {
    const lines = build()?.lines;
    const housing = lines?.housing?.basis;
    expect(housing?.en.text).toContain("Numbeo");
    expect(housing?.en.text).toContain("2026-10-03");
    expect(housing?.en.text).toContain("246");
    expect(housing?.en.text).toContain("crowdsourced");
    expect(housing?.en.text).toContain("unofficial");
    expect(housing?.en.text).toContain("1-bedroom apartment outside the city centre");
    expect(housing?.en.text.toLowerCase()).toContain("rounded outwards");
    expect(housing?.fr.text).toContain("Numbeo");
    expect(housing?.en.text).toContain("page updated 2026-10-03");
    expect(housing?.fr.text).toContain("2026-10-03");
    expect(housing?.fr.text).toContain("mis à jour le 2026-10-03");
    expect(housing?.ar.text).toContain("Numbeo");
    expect(housing?.ar.text).toContain("2026-10-03");
    expect(housing?.ar.text).toContain("تحديث الصفحة في 2026-10-03");
    expect(housing?.fr.status).toBe("draft");
    expect(housing?.en.status).toBe("draft");
    expect(housing?.ar.status).toBe("draft");

    expect(lines?.transport?.basis?.en.text).toContain("regular price");

    const food = lines?.food?.basis;
    for (const item of FOOD_BASKET) expect(food?.en.text).toContain(item.label);
    expect(food?.en.text).toContain("Min/max: low/high prices");
    expect(food?.fr.text).toContain("8 L");
    expect(food?.ar.text).toContain("8");
  });

  it("lists every basket item, with its amount, in each locale", () => {
    const food = build()?.lines.food?.basis;
    for (const item of FOOD_BASKET) {
      expect(food?.en.text).toContain(item.label);
      expect(food?.fr.text).toContain(item.labelFr);
      expect(food?.ar.text).toContain(item.labelAr);
    }
    expect(food?.fr.text).toContain("repas bon marché au restaurant");
    expect(food?.fr.text).not.toMatch(/\bresto\b/);
  });

  it("says a country profile is a wide national figure used where a city has no page", () => {
    const profile = buildProfile({
      slug: "fr-numbeo",
      country: "FR",
      city: null,
      url: numbeoCountryUrl("France", "EUR"),
      page: parseNumbeoPage(numbeoHtml({ footer: countryFooter })),
      currency: "EUR",
      preparedAt: "2026-10-05",
    });
    expect(profile?.city).toBeNull();
    expect(profile?.lines.housing?.basis?.en.text).toContain("2026-10-05");
    expect(profile?.lines.housing?.basis?.en.text).toContain("981");
    expect(profile?.lines.housing?.basis?.en.text).toContain(
      "country-level figure with a wide range; used where the city has no Numbeo page",
    );
    expect(profile?.lines.food?.basis?.fr.text).toContain("chiffre national");
  });

  it("keeps every basis within the schema text limit and validates once stamped", () => {
    for (const country of [true, false]) {
      const profile = buildProfile({
        slug: country ? "fr-numbeo" : "fr-paris-numbeo",
        country: "FR",
        city: country ? null : "paris",
        url,
        // a five-digit contributors count is the longest realistic head
        page: { ...parseNumbeoPage(numbeoHtml({ footer: countryFooter })), contributors: 99999 },
        currency: "EUR",
        preparedAt: "2026-10-05",
      });
      expect(profile).not.toBeNull();
      const { _review: _dropped, ...record } = profile ?? { _review: null };
      const stamped = stampVerified(record, "2026-10-06");
      expect(CostProfileRecordSchema.safeParse(stamped).error?.issues).toBeUndefined();
    }
  });

  it("keeps the currency it was asked for", () => {
    expect(build({ currency: "HUF" })?.lines.housing?.value?.currency).toBe("HUF");
  });

  it("omits a line whose rows are missing and returns null when nothing can be built", () => {
    const partial = build({ page: parseNumbeoPage(numbeoHtml({ skip: [TRANSPORT] })) });
    expect(Object.keys(partial?.lines ?? {})).toEqual(["housing", "food"]);
    expect(partial?._review.notes).toContain(TRANSPORT);
    expect(build({ page: parseNumbeoPage("<html><body>nothing</body></html>") })).toBeNull();
  });

  it("uses the read date when the page states none", () => {
    const undated = build({ page: { ...page, lastUpdate: null, contributors: null } });
    expect(undated?.lines.housing?.basis?.en.text).toContain("read on 2026-10-05");
  });
});

type Fixture = {
  pages: Map<string, string>;
  requested: string[];
  sleeps: number[];
  cached: Set<string>;
};

function fixture(): Fixture {
  return { pages: new Map(), requested: [], sleeps: [], cached: new Set() };
}

function options(f: Fixture, extra: Partial<Parameters<typeof runCosts>[0]> = {}) {
  return {
    dryRun: false,
    maxRequests: 400,
    delayMs: 2000,
    dataDir,
    stagingDir,
    now: () => "2026-10-05",
    fetch: async (url: string) => {
      f.requested.push(url);
      const body = f.pages.get(url);
      if (body === undefined) throw new Error(`GET ${url} failed: HTTP 404`);
      return body;
    },
    isCached: (url: string) => f.cached.has(url),
    sleep: async (ms: number) => {
      f.sleeps.push(ms);
    },
    ...extra,
  };
}

const franceUrl = numbeoCountryUrl("France", "EUR");
const parisUrl = numbeoCityUrl("Paris", "EUR");
const hungaryUrl = numbeoCountryUrl("Hungary", "HUF");
const budapestUrl = numbeoCityUrl("Budapest", "HUF");

describe("runCosts", () => {
  it("stages one profile per city and one per country", async () => {
    const f = fixture();
    f.pages.set(franceUrl, franceHtml());
    f.pages.set(parisUrl, numbeoHtml());
    f.pages.set(hungaryUrl, hungaryHtml());
    f.pages.set(budapestUrl, budapestHtml());
    const outcome = await runCosts(options(f, { countries: ["FR", "HU"] }));
    expect(outcome.ok).toBe(true);
    expect(await listStaged(stagingDir)).toEqual([
      "cost-profiles/fr-numbeo",
      "cost-profiles/fr-paris-numbeo",
      "cost-profiles/hu-budapest-numbeo",
      "cost-profiles/hu-numbeo",
    ]);
    const budapest = parse(
      readFileSync(stageFile("cost-profiles", "hu-budapest-numbeo", stagingDir), "utf8"),
    );
    expect(budapest.lines.housing.value.currency).toBe("HUF");
    expect(budapest.sources.numbeo.url).toBe(budapestUrl);
    expect(budapest.sources.numbeo.last_verified_at).toBeNull();
    expect(budapest._review.preparedBy).toBe("assistant");
    // France and Hungary countries, then their cities: one request each, EUR for FR and HUF for HU.
    expect(f.requested).toContain(franceUrl);
    expect(f.requested).toContain(hungaryUrl);
    for (const url of f.requested) {
      expect(
        url.endsWith(url.includes("Budapest") || url.includes("Hungary") ? "HUF" : "EUR"),
      ).toBe(true);
    }
  });

  it("reports a 404 as not listed and a page without the rent table, and falls back to the country profile", async () => {
    const f = fixture();
    f.pages.set(franceUrl, franceHtml());
    f.pages.set(
      parisUrl,
      "<html><head><h1> Cost of Living in Paris</h1></head><body>no table here</body></html>",
    );
    // Saint-Martin-d'Hères has no page at all: the fetch fails with a 404.
    const outcome = await runCosts(options(f, { countries: ["FR"] }));
    expect(await listStaged(stagingDir)).toEqual(["cost-profiles/fr-numbeo"]);
    const text = outcome.lines.join("\n");
    expect(text).toContain("no profile fr-paris-numbeo");
    expect(text).toContain("no profile fr-saint-martin-d-heres-numbeo: not listed on Numbeo");
    expect(text).toContain("HTTP 404");
    expect(text).toContain("falls back to fr-numbeo");
    expect(text).not.toContain("re-run to retry");
  });

  it("reports any other fetch failure as failed, counts it once and does not call it unlisted", async () => {
    const f = fixture();
    f.pages.set(franceUrl, franceHtml());
    f.pages.set(parisUrl, numbeoHtml());
    const failing = numbeoCityUrl(gre, "EUR");
    const outcome = await runCosts(
      options(f, {
        countries: ["FR"],
        fetch: async (url: string) => {
          f.requested.push(url);
          if (url === failing) throw new Error(`GET ${url} failed: HTTP 503`);
          const body = f.pages.get(url);
          if (body === undefined) throw new Error(`GET ${url} failed: HTTP 404`);
          return body;
        },
      }),
    );
    const text = outcome.lines.join("\n");
    expect(text).toContain("failed fr-saint-martin-d-heres-numbeo");
    expect(text).toContain("HTTP 503");
    expect(text).toContain("HTTP 503 (re-run to retry)");
    expect(text).not.toContain("not listed");
    expect(text).toContain("1 failed (re-run to retry)");
    expect(f.requested.filter((url) => url === failing)).toHaveLength(1);
    expect(outcome.requests).toBe(3);
    expect(await listStaged(stagingDir)).toEqual([
      "cost-profiles/fr-numbeo",
      "cost-profiles/fr-paris-numbeo",
    ]);
  });

  it("stages nothing for a page whose record would not validate", async () => {
    const f = fixture();
    const absurd = `<div>by ${"9".repeat(15)} different contributors. Last update: 3 October 2026</div>`;
    f.pages.set(franceUrl, numbeoHtml({ footer: absurd, place: "France" }));
    const outcome = await runCosts(options(f, { countries: ["FR"], maxRequests: 1 }));
    expect(await listStaged(stagingDir)).toEqual([]);
    expect(outcome.lines.join("\n")).toContain("no profile fr-numbeo: invalid at lines.");
  });

  it("waits the delay between requests but not before the first or for cached pages", async () => {
    const f = fixture();
    f.pages.set(franceUrl, franceHtml());
    f.pages.set(parisUrl, numbeoHtml());
    f.pages.set(numbeoCityUrl(gre, "EUR"), greHtml());
    f.cached.add(parisUrl);
    await runCosts(options(f, { countries: ["FR"], delayMs: 2500 }));
    expect(f.requested).toHaveLength(3);
    // two uncached requests: one wait between them; the cached Paris page costs no wait
    expect(f.sleeps).toEqual([2500]);
  });

  it("accepts the real wording: city name alone or with its country, accents and punctuation aside", async () => {
    const f = fixture();
    f.pages.set(franceUrl, franceHtml());
    f.pages.set(parisUrl, numbeoHtml({ place: "Paris, France" }));
    f.pages.set(numbeoCityUrl(gre, "EUR"), numbeoHtml({ place: "Saint Martin d’Heres" }));
    const outcome = await runCosts(options(f, { countries: ["FR"] }));
    expect(await listStaged(stagingDir)).toEqual([
      "cost-profiles/fr-numbeo",
      "cost-profiles/fr-paris-numbeo",
      "cost-profiles/fr-saint-martin-d-heres-numbeo",
    ]);
    expect(outcome.lines.join("\n")).not.toContain("page is for");
  });

  it("refuses a page for a different city and falls back to the country profile", async () => {
    const f = fixture();
    f.pages.set(franceUrl, franceHtml());
    f.pages.set(parisUrl, numbeoHtml({ place: "Lyon" }));
    f.pages.set(numbeoCityUrl(gre, "EUR"), greHtml());
    const outcome = await runCosts(options(f, { countries: ["FR"] }));
    expect(await listStaged(stagingDir)).not.toContain("cost-profiles/fr-paris-numbeo");
    const text = outcome.lines.join("\n");
    expect(text).toContain("no profile fr-paris-numbeo: page is for Lyon, expected Paris");
    expect(text).toContain("falls back to fr-numbeo");
  });

  it("refuses a country page for another country", async () => {
    const f = fixture();
    f.pages.set(franceUrl, numbeoHtml({ footer: countryFooter, place: "Germany" }));
    const outcome = await runCosts(options(f, { countries: ["FR"], maxRequests: 1 }));
    expect(await listStaged(stagingDir)).toEqual([]);
    expect(outcome.lines.join("\n")).toContain(
      "no profile fr-numbeo: page is for Germany, expected France",
    );
  });

  it("refuses a page with no 'Cost of Living in' heading", async () => {
    const f = fixture();
    f.pages.set(franceUrl, numbeoHtml({ footer: countryFooter, place: null }));
    const outcome = await runCosts(options(f, { countries: ["FR"], maxRequests: 1 }));
    expect(await listStaged(stagingDir)).toEqual([]);
    expect(outcome.lines.join("\n")).toContain(
      "no profile fr-numbeo: page names no place, expected France",
    );
  });

  it("refuses a Hungarian page that shows euros, and accepts the one that shows forints", async () => {
    const f = fixture();
    f.pages.set(hungaryUrl, hungaryHtml());
    f.pages.set(budapestUrl, numbeoHtml({ place: "Budapest" }));
    const outcome = await runCosts(options(f, { countries: ["HU"] }));
    expect(await listStaged(stagingDir)).toEqual(["cost-profiles/hu-numbeo"]);
    expect(outcome.lines.join("\n")).toContain(
      "no profile hu-budapest-numbeo: currency symbol €, expected Ft or HUF; falls back to hu-numbeo",
    );
  });

  it("refuses a euro page whose symbol is not the euro sign", async () => {
    const f = fixture();
    f.pages.set(franceUrl, numbeoHtml({ footer: countryFooter, place: "France", symbol: "$" }));
    const outcome = await runCosts(options(f, { countries: ["FR"], maxRequests: 1 }));
    expect(await listStaged(stagingDir)).toEqual([]);
    expect(outcome.lines.join("\n")).toContain(
      "no profile fr-numbeo: currency symbol $, expected €",
    );
  });

  it("refuses a delay under two seconds", async () => {
    const f = fixture();
    await expect(runCosts(options(f, { delayMs: 1999 }))).rejects.toThrow(/2000/);
    expect(f.requested).toEqual([]);
  });

  it("stops at --max-requests and reports what was not fetched", async () => {
    const f = fixture();
    f.pages.set(franceUrl, franceHtml());
    f.pages.set(parisUrl, numbeoHtml());
    const outcome = await runCosts(options(f, { countries: ["FR"], maxRequests: 2 }));
    expect(f.requested).toHaveLength(2);
    expect(outcome.requests).toBe(2);
    expect(outcome.lines.join("\n")).toContain("--max-requests 2 reached");
    expect(outcome.lines.join("\n")).toContain("not fetched fr-saint-martin-d-heres-numbeo");
  });

  it("does not count cached pages against the cap", async () => {
    const f = fixture();
    f.pages.set(franceUrl, franceHtml());
    f.pages.set(parisUrl, numbeoHtml());
    f.pages.set(numbeoCityUrl(gre, "EUR"), greHtml());
    f.cached.add(franceUrl);
    f.cached.add(parisUrl);
    const outcome = await runCosts(options(f, { countries: ["FR"], maxRequests: 1 }));
    expect(f.requested).toHaveLength(3);
    expect(outcome.requests).toBe(1);
  });

  it("prints the planned requests in a dry run and writes and fetches nothing", async () => {
    const f = fixture();
    f.cached.add(franceUrl);
    const outcome = await runCosts(options(f, { dryRun: true, countries: ["FR"] }));
    expect(f.requested).toEqual([]);
    expect(existsSync(stagingDir)).toBe(false);
    // France country (cached), Paris and Saint-Martin-d'Hères (not cached)
    expect(outcome.lines.join("\n")).toContain(
      "2 requests planned (1 already cached), about 1 minutes at the 2000 ms delay",
    );
    expect(outcome.lines.join("\n")).toContain("one attempt each, no retries");
  });

  it("never overwrites a staged file or a slug already in data, and does not request them", async () => {
    const f = fixture();
    f.pages.set(franceUrl, franceHtml());
    f.pages.set(parisUrl, numbeoHtml());
    f.pages.set(numbeoCityUrl(gre, "EUR"), greHtml());
    const stagedFile = stageFile("cost-profiles", "fr-paris-numbeo", stagingDir);
    await writeYaml(stagedFile, "edited by a reviewer\n");
    await writeYaml(path.join(dataDir, "cost-profiles", "fr-numbeo.yaml"), "already promoted\n");
    const outcome = await runCosts(options(f, { countries: ["FR"] }));
    expect(readFileSync(stagedFile, "utf8")).toBe("edited by a reviewer\n");
    expect(existsSync(stageFile("cost-profiles", "fr-numbeo", stagingDir))).toBe(false);
    expect(f.requested).toEqual([numbeoCityUrl("Saint-Martin-d'Hères", "EUR")]);
    const text = outcome.lines.join("\n");
    expect(text).toContain("skipped fr-paris-numbeo: already staged");
    expect(text).toContain("skipped fr-numbeo: already in data");
  });

  it("refuses a country code it has no name for", async () => {
    const f = fixture();
    await expect(runCosts(options(f, { countries: ["ES"] }))).rejects.toThrow(/ES/);
  });

  it("identifies the project in the user agent it is given", () => {
    expect(NUMBEO_USER_AGENT).toContain("dagdaguihamza@gmail.com");
  });
});

describe("numbeoFetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("makes exactly one HTTP request for a server error: a counted request is a real request", async () => {
    const stub = vi.fn(async () => new Response("busy", { status: 503 }));
    vi.stubGlobal("fetch", stub);
    await expect(
      numbeoFetch("https://www.numbeo.com/cost-of-living/in/Zzz-one-attempt-test"),
    ).rejects.toThrow(/HTTP 503/);
    expect(stub).toHaveBeenCalledTimes(1);
  });

  it("sends the Numbeo user agent", async () => {
    const stub = vi.fn(
      async (_url: string, _init: RequestInit) => new Response("x", { status: 404 }),
    );
    vi.stubGlobal("fetch", stub);
    await expect(
      numbeoFetch("https://www.numbeo.com/cost-of-living/in/Zzz-agent-test"),
    ).rejects.toThrow(/HTTP 404/);
    const headers = new Headers(stub.mock.calls[0]?.[1]?.headers);
    expect(headers.get("user-agent")).toBe(NUMBEO_USER_AGENT);
  });
});

describe("staged cost profiles through audit and promote", () => {
  it("are listed, drawn, rendered, promoted and stamped", async () => {
    const f = fixture();
    f.pages.set(franceUrl, franceHtml());
    f.pages.set(parisUrl, numbeoHtml());
    await runCosts(options(f, { countries: ["FR"], maxRequests: 2 }));
    const key = "cost-profiles/fr-paris-numbeo";
    expect(await listStaged(stagingDir)).toContain(key);

    const prepared = await findPrepared(stagingDir);
    expect(prepared).toContain(key);
    const rows = drawBatch({ preparedKeys: prepared, existing: [], seed: "abc123", batchIndex: 1 });
    expect(rows.map((r) => r.key)).toContain(key);
    expect(rows.every((r) => r.inSample)).toBe(true);

    const sheet = sampleSheet(
      rows.map((row) => ({
        key: row.key,
        row,
        record: parse(
          readFileSync(stageFile("cost-profiles", row.key.split("/")[1] ?? "", stagingDir), "utf8"),
        ),
      })),
    );
    expect(sheet).toContain(key);

    const audit = parseAudit(auditCsv(rows.map((r) => ({ ...r, audited: "y", outcome: "ok" }))));
    const result = await promoteApproved({
      approved: new Set(audit.map((r) => r.key)),
      date: "2026-10-06",
      stagingDir,
      dataDir,
      audit,
    });
    expect(result.skipped).toEqual([]);
    expect(result.promoted).toContain(key);

    const promoted = parse(
      readFileSync(path.join(dataDir, "cost-profiles", "fr-paris-numbeo.yaml"), "utf8"),
    );
    expect(promoted._review).toBeUndefined();
    expect(promoted.sources.numbeo.last_verified_at).toBe("2026-10-06");
    expect(CostProfileRecordSchema.safeParse(promoted).success).toBe(true);
    expect(existsSync(stageFile("cost-profiles", "fr-paris-numbeo", stagingDir))).toBe(false);
  });
});
