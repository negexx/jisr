import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

import { CostProfileRecordSchema } from "@/data-schema/records/cost-profile";

import { HttpStatusError } from "../../../scripts/import/http";
import {
  OfficialCostProposalSchema,
  runVerify,
  type VerifyDeps,
} from "../../../scripts/import/official-costs";
import { stampVerified } from "../../../scripts/import/promote";
import { listStaged, stageFile } from "../../../scripts/import/staging";

const COST_PAGE = "https://www.campusfrance.org/en/cost-of-living";
const FEES_PAGE = "https://www.service-public.gouv.fr/fees";
const OLD_PAGE = "https://www.campusfrance.org/en/archive";
const UNDATED_PAGE = "https://www.campusfrance.org/en/undated";
const BLOG_PAGE = "https://blog.example.com/cost-of-living";

const pages: Record<string, string> = {
  [COST_PAGE]:
    "Campus France, updated in 2025. Food: about 300 EUR per month. Housing in a Crous residence costs between 400 EUR and 500 EUR per month. Local transport: 7,50 EUR per month.",
  [FEES_PAGE]:
    "The CVEC student contribution is 105 EUR per year. The student visa costs 1.200 EUR once. A set-up deposit of 150,000 HUF applies.",
  [OLD_PAGE]: "Study in Hungary 2019: housing costs 400 EUR per month.",
  [UNDATED_PAGE]: "Housing costs 400 EUR per month in a Crous residence.",
  [BLOG_PAGE]: "Food: about 300 EUR per month.",
};

const basis = {
  fr: "Campus France 2025 : environ 300 EUR par mois pour la nourriture.",
  en: "Campus France 2025: about 300 EUR a month for food.",
  ar: "كامبوس فرانس 2025: حوالي 300 يورو شهريا للطعام.",
};

type Line = Record<string, unknown>;
const food = (overrides: Line = {}): Line => ({
  min: 300,
  max: 300,
  currency: "EUR",
  per: "month",
  info_kind: "estimate",
  basis,
  evidence: { url: COST_PAGE, quote: "Food: about 300 EUR per month." },
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
      evidence: [{ fact: "lines.food", url: COST_PAGE, quote: "Food: about 300 EUR per month." }],
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
          evidence: { url: COST_PAGE, quote: "Local transport: 7,50 EUR per month." },
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

  it("an estimate older than 2023", async () => {
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

  it("an estimate takes its year from the page when the quote has none", async () => {
    await run(proposalOf({ food: food() }));
    expect(Object.keys((await staged()).lines as object)).toEqual(["food"]);
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

  it("is reported as invalid, not thrown, when the file is not a proposal", async () => {
    const outcome = await run({ slug: "x" });
    expect(outcome.ok).toBe(false);
    expect(outcome.lines.join("\n")).toMatch(/invalid proposal/);
  });
});
