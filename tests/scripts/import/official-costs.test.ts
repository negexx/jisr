import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

import { CostProfileRecordSchema } from "@/data-schema/records/cost-profile";

import { HttpStatusError } from "../../../scripts/import/http";
import {
  livePageText,
  numberMatches,
  OfficialCostProposalSchema,
  runVerify,
  type VerifyDeps,
  yearsIn,
} from "../../../scripts/import/official-costs";
import { stampVerified } from "../../../scripts/import/promote";
import { listStaged, stageFile } from "../../../scripts/import/staging";
import { makePdf } from "./pdf-fixture";

const COST_PAGE = "https://www.campusfrance.org/en/cost-of-living";
const FEES_PAGE = "https://www.service-public.gouv.fr/fees";
const OLD_PAGE = "https://www.campusfrance.org/en/archive";
const UNDATED_PAGE = "https://www.campusfrance.org/en/undated";
const BLOG_PAGE = "https://blog.example.com/cost-of-living";
const DECIMAL_PAGE = "https://www.service-public.gouv.fr/decimals";
const DATE_QUOTE = "Campus France, updated in 2026.";

const pages: Record<string, string> = {
  [COST_PAGE]:
    "Campus France, updated in 2026. Food: about 300 EUR per month. Housing in a Crous residence costs between 400 EUR and 500 EUR per month. Local transport: 7,50 EUR per month.",
  [FEES_PAGE]:
    "The CVEC student contribution is 105 EUR per year. The student visa costs 1.200 EUR once. A set-up deposit of 150,000 HUF applies.",
  [OLD_PAGE]: "Study in Hungary 2019: housing costs 400 EUR per month.",
  [UNDATED_PAGE]: "Housing costs 400 EUR per month in a Crous residence.",
  [BLOG_PAGE]: "Food: about 300 EUR per month.",
  [DECIMAL_PAGE]:
    "Fee A is 1.200 EUR per year. Fee B is 1,050 EUR per year. Fee C is 1,20 EUR per month. Fee D is 1.20 EUR per month.",
};

const basis = {
  fr: "Campus France 2026 : environ 300 EUR par mois pour la nourriture.",
  en: "Campus France 2026: about 300 EUR a month for food.",
  ar: "كامبوس فرانس 2026: حوالي 300 يورو شهريا للطعام.",
};

type Line = Record<string, unknown>;
const food = (overrides: Line = {}): Line => ({
  min: 300,
  max: 300,
  currency: "EUR",
  per: "month",
  info_kind: "estimate",
  basis,
  evidence: { url: COST_PAGE, quote: "Food: about 300 EUR per month.", dateQuote: DATE_QUOTE },
  ...overrides,
});
const housing = (overrides: Line = {}): Line => ({
  min: 400,
  max: 500,
  currency: "EUR",
  per: "month",
  info_kind: "estimate",
  basis,
  evidence: {
    url: COST_PAGE,
    quote: "Housing in a Crous residence costs between 400 EUR and 500 EUR per month.",
    dateQuote: DATE_QUOTE,
  },
  ...overrides,
});
const insurance = (overrides: Line = {}): Line => ({
  min: 105,
  max: 105,
  currency: "EUR",
  per: "year",
  info_kind: "official",
  evidence: { url: FEES_PAGE, quote: "The CVEC student contribution is 105 EUR per year." },
  ...overrides,
});

const proposalOf = (lines: Record<string, Line>, extra: Line = {}): Line => ({
  slug: "fr-official",
  country: "FR",
  city: null,
  lines,
  ...extra,
});

type Fetch = (url: string) => Promise<string>;
const serve =
  (log: string[] = []): Fetch =>
  async (url) => {
    log.push(url);
    const text = pages[url];
    if (text === undefined) throw new HttpStatusError(`GET ${url} failed: HTTP 404`, 404);
    return text;
  };

let root: string;
let dataDir: string;
let stagingDir: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "jisr-official-costs-"));
  dataDir = path.join(root, "data");
  stagingDir = path.join(root, "staging");
});
afterEach(() => rm(root, { recursive: true, force: true }));

async function run(proposal: unknown, deps: VerifyDeps = {}, options: { dryRun?: boolean } = {}) {
  const file = path.join(root, "proposal.json");
  await writeFile(file, JSON.stringify(proposal));
  return runVerify(
    { file, dryRun: options.dryRun ?? false },
    {
      getText: serve(),
      sleep: async () => {},
      isCached: () => false,
      stagingDir,
      dataDir,
      today: "2026-10-06",
      ...deps,
    },
  );
}

async function staged(slug = "fr-official"): Promise<Record<string, unknown>> {
  return parse(await readFile(stageFile("cost-profiles", slug, stagingDir), "utf8"));
}

describe("a kept line", () => {
  it("is staged with its host as source, minor units and the evidence quote", async () => {
    const outcome = await run(proposalOf({ food: food() }));
    expect(outcome.ok).toBe(true);
    const record = await staged();
    expect(record.lines).toEqual({
      food: {
        value: { min: 30000, max: 30000, currency: "EUR", per: "month" },
        source: "campusfrance-org",
        info_kind: "estimate",
        basis: {
          fr: { text: basis.fr, status: "draft" },
          en: { text: basis.en, status: "draft" },
          ar: { text: basis.ar, status: "draft" },
        },
      },
    });
    expect(record.sources).toEqual({
      "campusfrance-org": { url: COST_PAGE, last_verified_at: null },
    });
    expect(record._review).toMatchObject({
      kind: "cost-profiles",
      slug: "fr-official",
      preparedBy: "assistant",
      preparedAt: "2026-10-06",
      sourceId: "official:fr-official",
      evidence: [
        { fact: "lines.food", url: COST_PAGE, quote: "Food: about 300 EUR per month." },
        { fact: "lines.food.date", url: COST_PAGE, quote: DATE_QUOTE },
      ],
    });
  });

  it("stores a published range as the range and a single figure as min = max", async () => {
    await run(proposalOf({ food: food(), housing: housing() }));
    const lines = (await staged()).lines as Record<string, { value: Record<string, number> }>;
    expect(lines.housing?.value).toMatchObject({ min: 40000, max: 50000 });
    expect(lines.food?.value).toMatchObject({ min: 30000, max: 30000 });
  });

  it("validates against CostProfileRecordSchema once stamped", async () => {
    await run(proposalOf({ food: food(), housing: housing(), insurance: insurance() }));
    const { _review: _dropped, ...record } = await staged();
    const result = CostProfileRecordSchema.safeParse(stampVerified(record, "2026-10-06"));
    expect(result.error?.issues).toBeUndefined();
    expect(result.success).toBe(true);
  });

  it("keeps an official line without a basis", async () => {
    await run(proposalOf({ insurance: insurance() }));
    const lines = (await staged()).lines as Record<string, Record<string, unknown>>;
    expect(lines.insurance?.info_kind).toBe("official");
    expect(lines.insurance).not.toHaveProperty("basis");
  });

  it("accepts a thousands separator, a decimal comma and a currency after the number", async () => {
    const outcome = await run(
      proposalOf({
        application_visa: insurance({
          min: 1200,
          max: 1200,
          per: "once",
          evidence: { url: FEES_PAGE, quote: "The student visa costs 1.200 EUR once." },
        }),
        transport: food({
          min: 7.5,
          max: 7.5,
          evidence: {
            url: COST_PAGE,
            quote: "Local transport: 7,50 EUR per month.",
            dateQuote: DATE_QUOTE,
          },
        }),
      }),
    );
    expect(outcome.ok).toBe(true);
    const lines = (await staged()).lines as Record<string, { value: Record<string, number> }>;
    expect(lines.application_visa?.value).toMatchObject({ min: 120000, per: "once" });
    expect(lines.transport?.value).toMatchObject({ min: 750, max: 750 });
  });

  it("converts with the currency's own minor units (forints are whole)", async () => {
    await run(
      proposalOf({
        setup: insurance({
          min: 150000,
          max: 150000,
          currency: "HUF",
          per: "once",
          evidence: { url: FEES_PAGE, quote: "A set-up deposit of 150,000 HUF applies." },
        }),
      }),
    );
    const lines = (await staged()).lines as Record<string, { value: Record<string, unknown> }>;
    expect(lines.setup?.value).toMatchObject({ min: 150000, max: 150000, currency: "HUF" });
  });

  it("gives two pages of one host two source keys", async () => {
    await run(
      proposalOf({
        food: food(),
        housing: housing({
          evidence: {
            url: UNDATED_PAGE,
            quote: "Housing costs 400 EUR per month in a Crous residence.",
          },
          min: 400,
          max: 400,
          info_kind: "official",
        }),
      }),
    );
    const record = await staged();
    const lines = record.lines as Record<string, { source: string }>;
    expect(lines.housing?.source).toBe("campusfrance-org");
    expect(lines.food?.source).toBe("campusfrance-org-2");
    expect(record.sources).toEqual({
      "campusfrance-org": { url: UNDATED_PAGE, last_verified_at: null },
      "campusfrance-org-2": { url: COST_PAGE, last_verified_at: null },
    });
  });
});

describe("a line that fails a check is dropped alone, with its reason", () => {
  const mixed = (bad: Line) => proposalOf({ food: food(), housing: bad });

  async function dropsHousing(bad: Line, reason: RegExp) {
    const outcome = await run(mixed(bad));
    expect(outcome.ok).toBe(true);
    expect(Object.keys((await staged()).lines as object)).toEqual(["food"]);
    expect(outcome.lines.join("\n")).toMatch(reason);
  }

  it("quote not on the page", () =>
    dropsHousing(
      housing({
        evidence: { url: COST_PAGE, quote: "Housing is about 450 EUR per month everywhere." },
      }),
      /housing.*not.*on the page/i,
    ));

  it("host not on the official allow-list, and the page is never fetched", async () => {
    const log: string[] = [];
    const outcome = await run(
      mixed(housing({ evidence: { url: BLOG_PAGE, quote: "Food: about 300 EUR per month." } })),
      { getText: serve(log) },
    );
    expect(Object.keys((await staged()).lines as object)).toEqual(["food"]);
    expect(outcome.lines.join("\n")).toMatch(/housing.*not an official/i);
    expect(log).not.toContain(BLOG_PAGE);
  });

  it("a number of the line missing from the quote", () =>
    dropsHousing(housing({ max: 600 }), /housing.*600.*not in the quote/i));

  it("a number that is only part of a larger one in the quote", () =>
    dropsHousing(housing({ min: 40, max: 500 }), /housing.*40\b.*not in the quote/i));

  it("the currency missing next to the number", () =>
    dropsHousing(housing({ currency: "USD" }), /housing.*USD/i));

  it("an estimate older than 2026", async () => {
    const outcome = await run(
      proposalOf({
        food: food(),
        housing: housing({
          evidence: {
            url: OLD_PAGE,
            quote: "Study in Hungary 2019: housing costs 400 EUR per month.",
          },
          min: 400,
          max: 400,
        }),
      }),
    );
    expect(Object.keys((await staged()).lines as object)).toEqual(["food"]);
    expect(outcome.lines.join("\n")).toMatch(/housing.*2019/);
  });

  it("an estimate dated 2025 is dropped with a message naming 2026, one dated 2026 is kept", async () => {
    const estimate = (quote: string) =>
      run(
        proposalOf({
          housing: housing({ min: 400, max: 400, evidence: { url: COST_PAGE, quote } }),
        }),
        { getText: async () => quote },
      );
    const dropped = await estimate("Updated in 2025: housing costs 400 EUR per month.");
    expect(dropped.ok).toBe(false);
    expect(dropped.lines.join("\n")).toMatch(
      /housing.*oldest year in the quote is 2025, before 2026/,
    );
    const kept = await estimate("Updated in 2026: housing costs 400 EUR per month.");
    expect(kept.ok).toBe(true);
    expect(Object.keys((await staged()).lines as object)).toEqual(["housing"]);
  });

  it("an estimate whose quote and page state no year", async () => {
    const outcome = await run(
      proposalOf({
        food: food(),
        housing: housing({
          evidence: {
            url: UNDATED_PAGE,
            quote: "Housing costs 400 EUR per month in a Crous residence.",
          },
          min: 400,
          max: 400,
        }),
      }),
    );
    expect(Object.keys((await staged()).lines as object)).toEqual(["food"]);
    expect(outcome.lines.join("\n")).toMatch(/housing.*no year/i);
  });

  it("an official line needs no year", async () => {
    await run(proposalOf({ food: food(), insurance: insurance() }));
    expect(Object.keys((await staged()).lines as object)).toEqual(["food", "insurance"]);
  });

  it("an estimate takes its year from a date quote on the same page", async () => {
    const outcome = await run(proposalOf({ food: food() }));
    expect(Object.keys((await staged()).lines as object)).toEqual(["food"]);
    expect(outcome.lines.join("\n")).toMatch(
      /food.*years: oldest 2026, newest 2026 \(from date quote\)/,
    );
  });

  it("an estimate whose quote states a year is judged on the quote alone, never rescued by a date quote", async () => {
    const quote = "Sozialerhebung 2016: 867 EUR per month";
    const outcome = await run(
      proposalOf({
        housing: housing({
          min: 867,
          max: 867,
          evidence: { url: COST_PAGE, quote, dateQuote: "Page updated 12 March 2026" },
        }),
      }),
      { getText: async () => `${quote}. Page updated 12 March 2026.` },
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.lines.join("\n")).toMatch(/housing.*oldest year in the quote is 2016/);
  });

  it("uses the oldest year of the quote for the 2026 rule and prints both ends", async () => {
    const run2 = (quote: string) =>
      run(
        proposalOf({
          housing: housing({
            min: 300,
            max: 310,
            evidence: { url: COST_PAGE, quote },
          }),
        }),
        { getText: async () => quote },
      );
    const kept = await run2("In 2026, 300 EUR per month; in 2027, 310 EUR per month.");
    expect(kept.lines.join("\n")).toMatch(/years: oldest 2026, newest 2027 \(from quote\)/);
    await rm(stagingDir, { recursive: true, force: true });
    const dropped = await run2("In 2024, 300 EUR per month; in 2026, 310 EUR per month.");
    expect(dropped.ok).toBe(false);
    expect(dropped.lines.join("\n")).toMatch(/oldest year in the quote is 2024/);
  });

  it("an estimate with a year somewhere on the page but no date quote", async () => {
    const outcome = await run(
      proposalOf({
        food: food({ evidence: { url: COST_PAGE, quote: "Food: about 300 EUR per month." } }),
      }),
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.lines.join("\n")).toMatch(/food.*no year/i);
  });

  it("an estimate whose date quote is not on the page", async () => {
    const outcome = await run(
      proposalOf({
        food: food({
          evidence: {
            url: COST_PAGE,
            quote: "Food: about 300 EUR per month.",
            dateQuote: "Updated in 2026 by the ministry.",
          },
        }),
      }),
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.lines.join("\n")).toMatch(/food.*date quote is not on the page/i);
  });

  it("an estimate whose date quote states only an old year", async () => {
    const outcome = await run(
      proposalOf({
        food: food({
          evidence: {
            url: OLD_PAGE,
            quote: "housing costs 400 EUR per month.",
            dateQuote: "Study in Hungary 2019",
          },
          min: 400,
          max: 400,
        }),
      }),
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.lines.join("\n")).toMatch(/food.*2019/);
  });

  it("an official line is kept without a year and the report says no age check was done", async () => {
    const outcome = await run(proposalOf({ insurance: insurance() }));
    expect(outcome.lines.join("\n")).toMatch(/insurance.*no age check/i);
    expect((await staged())._review).toMatchObject({
      notes: expect.stringMatching(/no age check/i),
    });
  });

  it("does not take the age of an upper-case currency amount for a year", async () => {
    const quote = "Housing in a Crous residence costs 2040 EUR per month.";
    const outcome = await run(
      proposalOf({
        housing: housing({
          min: 2040,
          max: 2040,
          evidence: { url: COST_PAGE, quote },
        }),
      }),
      { getText: async () => quote },
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.lines.join("\n")).toMatch(/housing.*no year/i);
  });

  it("a page that is not found (404), a server error and a network error", async () => {
    for (const failure of [
      new HttpStatusError("GET x failed: HTTP 404", 404),
      new HttpStatusError("GET x failed: HTTP 502", 502),
      new Error("GET x failed: fetch failed"),
    ]) {
      await rm(stagingDir, { recursive: true, force: true });
      const outcome = await run(proposalOf({ food: food(), insurance: insurance() }), {
        getText: async (url) => {
          if (url === FEES_PAGE) throw failure;
          return pages[url] ?? "";
        },
      });
      expect(outcome.ok).toBe(true);
      expect(Object.keys((await staged()).lines as object)).toEqual(["food"]);
      expect(outcome.lines.join("\n")).toMatch(/insurance.*could not be fetched/i);
    }
  });

  it("an empty page", async () => {
    const outcome = await run(proposalOf({ food: food(), insurance: insurance() }), {
      getText: async (url) => (url === FEES_PAGE ? "   " : (pages[url] ?? "")),
    });
    expect(Object.keys((await staged()).lines as object)).toEqual(["food"]);
    expect(outcome.lines.join("\n")).toMatch(/insurance.*could not be fetched/i);
  });
});

describe("a profile with no kept line", () => {
  it("is not staged", async () => {
    const outcome = await run(
      proposalOf({
        food: food({ evidence: { url: COST_PAGE, quote: "A sentence that is not on the page." } }),
      }),
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.lines.join("\n")).toMatch(/no line kept/i);
    expect(await listStaged(stagingDir)).toEqual([]);
  });
});

describe("a blocked or rate-limited site", () => {
  for (const status of [403, 429]) {
    it(`stops the whole run on HTTP ${status} and stages nothing`, async () => {
      const log: string[] = [];
      const outcome = await run(
        proposalOf({ food: food(), insurance: insurance(), housing: housing() }),
        {
          getText: async (url) => {
            log.push(url);
            if (url === FEES_PAGE) throw new HttpStatusError(`HTTP ${status}`, status);
            return pages[url] ?? "";
          },
        },
      );
      expect(outcome.ok).toBe(false);
      expect(outcome.lines.join("\n")).toMatch(new RegExp(`HTTP ${status}.*stopp`, "i"));
      expect(await listStaged(stagingDir)).toEqual([]);
      expect(log).toEqual([COST_PAGE, FEES_PAGE]);
    });
  }
});

describe("politeness", () => {
  const twoPages = () => proposalOf({ food: food(), housing: housing(), insurance: insurance() });

  it("fetches each page once, one at a time, with the delay between real requests", async () => {
    const log: string[] = [];
    const sleeps: number[] = [];
    await run(twoPages(), {
      getText: serve(log),
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(log).toEqual([COST_PAGE, FEES_PAGE]);
    expect(sleeps).toEqual([4000]);
  });

  it("waits the given delay and no delay for a cached page", async () => {
    const sleeps: number[] = [];
    await run(twoPages(), {
      delayMs: 2500,
      useCache: true,
      isCached: (url) => url === FEES_PAGE,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(sleeps).toEqual([]);
    sleeps.length = 0;
    await rm(stagingDir, { recursive: true, force: true });
    await run(twoPages(), {
      delayMs: 2500,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(sleeps).toEqual([2500]);
  });

  it("refuses a delay under 2 seconds", async () => {
    const outcome = await run(twoPages(), { delayMs: 1500 });
    expect(outcome.ok).toBe(false);
    expect(outcome.lines.join("\n")).toMatch(/at least 2000/);
    expect(await listStaged(stagingDir)).toEqual([]);
  });
});

describe("never overwrites", () => {
  it("a staged file", async () => {
    await run(proposalOf({ food: food() }));
    const file = stageFile("cost-profiles", "fr-official", stagingDir);
    const before = await readFile(file, "utf8");
    const outcome = await run(proposalOf({ food: food(), housing: housing() }));
    expect(outcome.ok).toBe(false);
    expect(outcome.lines.join("\n")).toMatch(/already exists/);
    expect(await readFile(file, "utf8")).toBe(before);
  });

  it("a slug already in data/", async () => {
    await mkdir(path.join(dataDir, "cost-profiles"), { recursive: true });
    await writeFile(path.join(dataDir, "cost-profiles", "fr-official.yaml"), "promoted\n");
    const outcome = await run(proposalOf({ food: food() }));
    expect(outcome.ok).toBe(false);
    expect(outcome.lines.join("\n")).toMatch(/already in/);
    expect(existsSync(stageFile("cost-profiles", "fr-official", stagingDir))).toBe(false);
  });
});

describe("a dry run", () => {
  it("reports what would be kept and writes nothing", async () => {
    const outcome = await run(proposalOf({ food: food() }), {}, { dryRun: true });
    expect(outcome.ok).toBe(true);
    expect(outcome.lines.join("\n")).toMatch(/dry run: nothing written/);
    expect(existsSync(stagingDir)).toBe(false);
  });
});

describe("the proposal", () => {
  it("rejects min above max, an estimate without a basis and an unknown line", () => {
    expect(
      OfficialCostProposalSchema.safeParse(proposalOf({ food: food({ min: 9, max: 3 }) })).success,
    ).toBe(false);
    const { basis: _basis, ...noBasis } = food();
    expect(OfficialCostProposalSchema.safeParse(proposalOf({ food: noBasis })).success).toBe(false);
    expect(OfficialCostProposalSchema.safeParse(proposalOf({ fun: food() })).success).toBe(false);
    expect(OfficialCostProposalSchema.safeParse(proposalOf({})).success).toBe(false);
    expect(OfficialCostProposalSchema.safeParse(proposalOf({ food: food() })).success).toBe(true);
  });

  it("rejects amounts with more decimals than the currency has minor units", () => {
    const parseWith = (overrides: Line) =>
      OfficialCostProposalSchema.safeParse(proposalOf({ food: food(overrides) })).success;
    expect(parseWith({ min: 7.505, max: 7.505 })).toBe(false);
    expect(parseWith({ min: 7.5, max: 7.5 })).toBe(true);
    expect(parseWith({ min: 150.5, max: 150.5, currency: "HUF" })).toBe(false);
  });

  it("enforces the slug convention", () => {
    const parseWith = (extra: Line) =>
      OfficialCostProposalSchema.safeParse(proposalOf({ food: food() }, extra)).success;
    expect(parseWith({})).toBe(true);
    expect(parseWith({ slug: "de-official" })).toBe(false);
    expect(parseWith({ slug: "fr-paris-official" })).toBe(false);
    expect(parseWith({ slug: "fr-paris-official", city: "paris" })).toBe(true);
    expect(parseWith({ slug: "fr-paris-official", city: "lyon" })).toBe(false);
    expect(parseWith({ slug: "fr-official", city: "paris" })).toBe(false);
    expect(parseWith({ slug: "fr-numbeo" })).toBe(false);
  });

  it("is reported as invalid, not thrown, when the file is not a proposal", async () => {
    const outcome = await run({ slug: "x" });
    expect(outcome.ok).toBe(false);
    expect(outcome.lines.join("\n")).toMatch(/invalid proposal/);
  });
});

describe("numberMatches", () => {
  const found = (value: number, quote: string, digits = 2): boolean =>
    numberMatches(value, quote, digits).length > 0;

  it.each([
    [350, "35", false],
    [35, "350", false],
    [35, "35", true],
    [350, "350", true],
    [1050, "1,050", true],
    [105, "1,050", false],
    [1130, "1.130", true],
    [1130, "1,130", true],
    [1.13, "1.130", false],
    [1.13, "1,13", true],
    [2050, "2 050", true],
    [50, "2 050", false],
    [1200000, "1 200 000", true],
    [1200, "1 200 000", false],
    [200, "1 200 000", false],
    [500, "500,50", false],
    [500, "500,00", true],
    [500, "500", true],
  ])("%s in %j: %s", (value, quote, expected) => {
    expect(found(value, quote)).toBe(expected);
  });

  it("never reads a separator followed by three digits as a decimal", () => {
    expect(found(1.2, "1.200 EUR")).toBe(false);
    expect(found(1.05, "1,050 EUR")).toBe(false);
    expect(found(1.2, "1,20 EUR")).toBe(true);
    expect(found(1.2, "1.20 EUR")).toBe(true);
    expect(found(1.2, "1.2 EUR")).toBe(true);
  });

  it("takes no decimals for a currency without minor units", () => {
    expect(found(150000, "150,000 HUF", 0)).toBe(true);
    expect(found(150000, "150,000.00 HUF", 0)).toBe(false);
  });
});

describe("yearsIn", () => {
  it.each([
    ["Updated in 2025", [2025]],
    ["Study in Hungary 2019: 400 EUR", [2019]],
    ["costs 2 050 EUR per year", []],
    ["costs 2040 EUR per year", []],
    ["costs EUR 2025 per year", []],
    ["costs 2040 euros", []],
    ["costs 2000 EUR", []],
    ["costs 2.050 EUR", []],
    ["in 2024, 300 EUR; in 2026, 310 EUR", [2024, 2026]],
    ["academic year 2025-2026", [2025, 2026]],
  ])("%j", (text, expected) => {
    expect(yearsIn(text)).toEqual(expected);
  });
});

describe("a decimal figure next to a thousands separator", () => {
  const fee = (min: number, quote: string): Line =>
    insurance({
      min,
      max: min,
      per: quote.includes("month") ? "month" : "year",
      evidence: { url: DECIMAL_PAGE, quote },
    });

  it("is dropped when the quote has the figure with a thousands separator", async () => {
    for (const [min, quote] of [
      [1.2, "Fee A is 1.200 EUR per year."],
      [1.05, "Fee B is 1,050 EUR per year."],
    ] as const) {
      const outcome = await run(proposalOf({ insurance: fee(min, quote) }));
      expect(outcome.ok).toBe(false);
      expect(outcome.lines.join("\n")).toMatch(/not in the quote/);
    }
  });

  it("is kept when the quote has the same decimal figure", async () => {
    for (const quote of ["Fee C is 1,20 EUR per month.", "Fee D is 1.20 EUR per month."]) {
      await rm(stagingDir, { recursive: true, force: true });
      const outcome = await run(proposalOf({ insurance: fee(1.2, quote) }));
      expect(outcome.ok).toBe(true);
    }
  });
});

describe("the period", () => {
  it("drops a line whose quote states another period", async () => {
    const outcome = await run(proposalOf({ food: food(), insurance: insurance({ per: "month" }) }));
    expect(Object.keys((await staged()).lines as object)).toEqual(["food"]);
    expect(outcome.lines.join("\n")).toMatch(/insurance.*year.*month/i);
  });

  it("keeps a line whose quote states no period, and says so in the report and the notes", async () => {
    const outcome = await run(
      proposalOf({
        setup: insurance({
          min: 150000,
          max: 150000,
          currency: "HUF",
          per: "once",
          evidence: { url: FEES_PAGE, quote: "A set-up deposit of 150,000 HUF applies." },
        }),
      }),
    );
    expect(outcome.ok).toBe(true);
    expect(outcome.lines.join("\n")).toMatch(/setup.*period not stated in quote/);
    expect((await staged())._review).toMatchObject({
      notes: expect.stringMatching(/lines\.setup.*period not stated in quote/),
    });
  });

  it.each([
    ["Miete: 400 EUR pro Monat.", "month", true],
    ["Loyer : 400 EUR par mois.", "month", true],
    ["Affitto: 400 EUR al mese.", "month", true],
    ["Havi lakbér: 400 EUR.", "month", true],
    ["Huur: 400 EUR per maand.", "month", true],
    ["Contribution : 105 EUR par an.", "year", true],
    ["Beitrag: 105 EUR pro Jahr.", "year", true],
    ["Quota: 105 EUR all'anno.", "year", true],
    ["Bijdrage: 105 EUR per jaar.", "year", true],
    ["Díj: 105 EUR évi.", "year", true],
    ["Díj: 105 EUR évente.", "year", true],
    ["Havonta 400 EUR lakbér.", "month", true],
    ["Cotisation : 105 EUR/an pour tous.", "year", true],
    ["Frais annuels : 105 EUR pour tous.", "year", true],
    ["Droits d'inscription : 105 EUR par année.", "year", true],
    ["Affitto medio: 400 EUR per 10 mesi.", "month", true],
    ["Fee: 105 EUR per annum.", "year", true],
    ["Frais : 105 EUR, versement unique.", "once", true],
    ["Tarif unique : 105 EUR pour tous.", "once", true],
    ["Tarif unique : 105 EUR par an.", "once", false],
    ["Frais : 105 EUR, paiement unique.", "once", true],
    ["Gebühr: 105 EUR einmalig.", "once", true],
    ["Tassa: 105 EUR una tantum.", "once", true],
    ["Fee: 105 EUR, a one-off payment.", "once", true],
    ["Fee: 105 EUR per year.", "once", false],
    ["Fee: 105 EUR once.", "year", false],
    ["Miete: 400 EUR pro Monat.", "year", false],
  ])("%j as %s: kept %s", async (quote, per, kept) => {
    const value = quote.includes("400") ? 400 : 105;
    const outcome = await run(
      proposalOf({
        insurance: insurance({
          min: value,
          max: value,
          per,
          evidence: { url: DECIMAL_PAGE, quote },
        }),
      }),
      { getText: async () => `${quote} Padding so the page is longer than the quote.` },
    );
    expect(outcome.ok).toBe(kept);
  });
});

describe("the cache", () => {
  it("is not used by default: a page already on disk is requested again, with the delay", async () => {
    const sleeps: number[] = [];
    const outcome = await run(proposalOf({ housing: housing(), insurance: insurance() }), {
      isCached: () => true,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(sleeps).toEqual([4000]);
    expect(outcome.lines.join("\n")).toMatch(/housing.*page fetched now/);
    expect(outcome.lines.join("\n")).not.toMatch(/--use-cache/);
  });

  it("is used with useCache, and the report says so for the run and for each line", async () => {
    const outcome = await run(proposalOf({ housing: housing() }), {
      useCache: true,
      isCached: () => true,
    });
    const report = outcome.lines.join("\n");
    expect(report).toMatch(/--use-cache/);
    expect(report).toMatch(/housing.*page from cache/);
  });

  it("makes the live page reader refresh and try once", async () => {
    const calls: Record<string, unknown>[] = [];
    const url = "https://www.campusfrance.org/en/refresh-check";
    const fetchHtml = async (target: string, options?: Record<string, unknown>) => {
      calls.push({ target, ...options });
      return "<p>Food: about 300 EUR per month.</p>";
    };
    const text = await livePageText({ refresh: true, fetchHtml })(url);
    expect(text).toBe("Food: about 300 EUR per month.");
    expect(calls[0]).toMatchObject({ target: url, refresh: true, attempts: 1 });
    await livePageText({ refresh: false, fetchHtml })(`${url}-2`);
    expect(calls[1]).toMatchObject({ refresh: false, attempts: 1 });
  });

  it("makes the live reader skip the cached PDF text when it refreshes", async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), "official-pdf-"));
    const url = "https://www.campusfrance.org/en/fees.pdf";
    let version = "Fee: 100 EUR per year";
    let requests = 0;
    const fetchFn = (async () => {
      requests++;
      return new Response(makePdf(version), { status: 200 });
    }) as typeof fetch;
    const pdfDeps = { fetchFn, cacheDir };
    expect(await livePageText({ refresh: false, pdfDeps })(url)).toContain("100 EUR");
    version = "Fee: 120 EUR per year";
    expect(await livePageText({ refresh: false, pdfDeps })(url)).toContain("100 EUR");
    expect(requests).toBe(1);
    expect(await livePageText({ refresh: true, pdfDeps })(url)).toContain("120 EUR");
    expect(requests).toBe(2);
    await rm(cacheDir, { recursive: true, force: true });
  });
});

describe("several periods in one quote", () => {
  const quote = "The fee is 105 EUR per year, payable at the start of the month.";
  const fee = (per: string): Line => insurance({ per, evidence: { url: DECIMAL_PAGE, quote } });

  it("drops the line when the period nearest the amount contradicts per", async () => {
    const outcome = await run(proposalOf({ insurance: fee("month") }), {
      getText: async () => quote,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.lines.join("\n")).toMatch(/insurance.*nearest the amount says year.*per month/);
  });

  it("keeps it when the nearest period agrees, with a note to check the period", async () => {
    const outcome = await run(proposalOf({ insurance: fee("year") }), {
      getText: async () => quote,
    });
    expect(outcome.ok).toBe(true);
    const note = /several periods stated \(month, year\): check that per year is the amount's own/;
    expect(outcome.lines.join("\n")).toMatch(note);
    expect((await staged())._review).toMatchObject({ notes: expect.stringMatching(note) });
  });

  it("reads the word before the amount when none follows it", async () => {
    const text = "Monthly rent: 400 EUR, the deposit is due once at signing.";
    const outcome = await run(
      proposalOf({
        housing: housing({
          min: 400,
          max: 400,
          evidence: { url: DECIMAL_PAGE, quote: text, dateQuote: undefined },
          info_kind: "official",
        }),
      }),
      { getText: async () => text },
    );
    expect(outcome.ok).toBe(true);
  });
});

describe("a period word inside a duration phrase", () => {
  const questura =
    "40,00 euro per i permessi di soggiorno di durata superiore a tre mesi e inferiore o pari a un anno";

  it("is ignored: the Questura fee proposed as once is kept, with a note", async () => {
    const outcome = await run(
      proposalOf({
        application_visa: insurance({
          min: 40,
          max: 40,
          per: "once",
          evidence: { url: FEES_PAGE, quote: questura },
        }),
      }),
      { getText: async () => questura },
    );
    expect(outcome.ok).toBe(true);
    const note = /period not stated in quote/;
    expect(outcome.lines.join("\n")).toMatch(note);
    expect((await staged())._review).toMatchObject({ notes: expect.stringMatching(note) });
  });

  it("does not hide another period word of the quote", async () => {
    const quote = "The fee is 105 EUR per year, valid for one month.";
    const outcome = await run(
      proposalOf({
        insurance: insurance({ per: "month", evidence: { url: FEES_PAGE, quote } }),
      }),
      { getText: async () => quote },
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.lines.join("\n")).toMatch(/insurance.*year.*per month/);
  });

  it("leaves the period before the phrase in place", async () => {
    const quote = "Rent is 400 EUR per month for a stay of one year.";
    const outcome = await run(
      proposalOf({
        insurance: insurance({
          min: 400,
          max: 400,
          per: "month",
          evidence: { url: FEES_PAGE, quote },
        }),
      }),
      { getText: async () => quote },
    );
    expect(outcome.ok).toBe(true);
    expect(outcome.lines.join("\n")).not.toMatch(/period not stated/);
  });

  it("quotes the ignored phrase in the note, so the auditor sees what was skipped", async () => {
    const quote =
      "40,00 euro per i permessi di soggiorno di durata superiore a tre mesi e inferiore o pari a un anno";
    await run(
      proposalOf({
        application_visa: insurance({
          min: 40,
          max: 40,
          per: "once",
          evidence: { url: FEES_PAGE, quote },
        }),
      }),
      { getText: async () => quote },
    );
    expect((await staged())._review).toMatchObject({
      notes: expect.stringContaining("ignored duration phrase: 'di durata superiore a tre mesi"),
    });
    expect((await staged())._review).toMatchObject({
      notes: expect.stringContaining("inferiore o pari a un anno'"),
    });
  });
});

describe("a duration cue never swallows the amount's own period", () => {
  const withQuote = (value: number, quote: string, per: string, currency = "EUR") =>
    run(
      proposalOf({
        insurance: insurance({
          min: value,
          max: value,
          per,
          currency,
          evidence: { url: FEES_PAGE, quote },
        }),
      }),
      { getText: async () => quote },
    );

  it.each([
    ["Health insurance for students costs 120 EUR a month.", 120, "year"],
    ["You should budget for about 850 EUR a month.", 850, "year"],
    ["Student housing costs 4,800 EUR for a year.", 4800, "month"],
    ["The permit is valid for a year at 120 EUR a month.", 120, "year"],
  ])("drops %j (amount %s, proposed per %s)", async (quote, value, per) => {
    const outcome = await withQuote(value, quote, per);
    expect(outcome.ok).toBe(false);
    expect(outcome.lines.join("\n")).toMatch(/insurance/);
  });

  it.each([
    ["Rent is about 400 EUR per month in a shared flat.", 400, "month"],
    ["The CVEC contribution is 105 EUR per year for all students.", 105, "year"],
    ["Groceries cost about 300 EUR per month in the Netherlands.", 300, "month"],
    ["Il faut payer 100 € pour le dossier de demande.", 100, "once"],
    ["The permit is valid for a year at 120 EUR a month.", 120, "month"],
  ])("keeps %j (amount %s, proposed per %s)", async (quote, value, per) => {
    const outcome = await withQuote(value, quote, per);
    expect(outcome.ok).toBe(true);
  });
});
