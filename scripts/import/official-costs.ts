import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import {
  CountryCodeSchema,
  CurrencySchema,
  HttpsUrlSchema,
  SlugSchema,
} from "@/data-schema/primitives";
import {
  CostProfileRecordSchema,
  LIVING_COST_CATEGORIES,
  type LivingCostCategory,
} from "@/data-schema/records/cost-profile";
import { minorUnitDigits } from "@/lib/format";

import { httpStatusOf, isStopStatus, type StagedBasis, type StagedCostProfile } from "./costs";
import { normalizeForMatch, pageText, quoteInText } from "./evidence";
import { fetchText, isCached } from "./http";
import type { GetText } from "./proposals";
import { currencyNextTo, isOfficialHost } from "./scholarships";
import { DATA_DIR, STAGING_DIR, stageFile, toYaml } from "./staging";

// Official cost profiles: the assistant proposes, from official pages, a figure per cost line with a
// verbatim quote. The code re-fetches every cited page and keeps a line only if the quote is really
// there, its numbers and currency are in the quote and, for an estimate, it is not out of date. A line
// that fails is dropped alone and reported; the rest is staged for the 100% audit.
// Usage: data:costs-official verify <proposal.json> [--dry-run] [--delay-ms 4000] [--use-cache]
const COLLECTION = "cost-profiles";
const MIN_DELAY_MS = 2000;
export const DEFAULT_DELAY_MS = 4000;
// An estimate older than this is not used (a legal rate in force is `official` and has no age limit).
export const MIN_ESTIMATE_YEAR = 2023;

const Text = z.string().trim().min(1).max(400);

// An amount with more decimals than the currency has minor units (EUR 7.505) cannot be stored.
const fitsMinorUnits = (value: number, currency: string): boolean => {
  const scaled = value * 10 ** minorUnitDigits(currency);
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
};

const LineProposalSchema = z
  .strictObject({
    // Major units (EUR 300 = 300, EUR 7.50 = 7.5); the code converts to minor units.
    min: z.number().nonnegative(),
    max: z.number().nonnegative(),
    currency: CurrencySchema,
    per: z.enum(["month", "year", "once"]),
    info_kind: z.enum(["official", "estimate"]),
    basis: z.strictObject({ fr: Text, en: Text.optional(), ar: Text.optional() }).optional(),
    // `dateQuote`: for an estimate whose own quote states no year, a second verbatim quote from the
    // same page that does ("Updated 12 March 2025").
    evidence: z.strictObject({
      url: HttpsUrlSchema,
      quote: z.string().min(1),
      dateQuote: z.string().min(1).optional(),
    }),
  })
  .superRefine((line, ctx) => {
    if (line.min > line.max)
      ctx.addIssue({ code: "custom", path: ["min"], message: "min must be <= max" });
    for (const key of ["min", "max"] as const)
      if (!fitsMinorUnits(line[key], line.currency))
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${line[key]} has more decimals than ${line.currency} has minor units`,
        });
    if (line.info_kind === "estimate" && line.basis === undefined)
      ctx.addIssue({
        code: "custom",
        path: ["basis"],
        message: "basis is required when info_kind is estimate",
      });
  });

export const OfficialCostProposalSchema = z
  .strictObject({
    slug: SlugSchema,
    country: CountryCodeSchema,
    city: SlugSchema.nullable(),
    lines: z
      .strictObject({
        housing: LineProposalSchema.optional(),
        food: LineProposalSchema.optional(),
        transport: LineProposalSchema.optional(),
        insurance: LineProposalSchema.optional(),
        application_visa: LineProposalSchema.optional(),
        setup: LineProposalSchema.optional(),
      })
      .refine((lines) => Object.keys(lines).length > 0, { message: "at least one line" }),
  })
  .superRefine((proposal, ctx) => {
    const cc = proposal.country.toLowerCase();
    const expected = proposal.city === null ? `${cc}-official` : `${cc}-${proposal.city}-official`;
    if (proposal.slug !== expected)
      ctx.addIssue({
        code: "custom",
        path: ["slug"],
        message: `the slug must be ${expected} (<cc>-official, or <cc>-<city>-official for a city profile)`,
      });
  });
export type OfficialCostProposal = z.infer<typeof OfficialCostProposalSchema>;
type LineProposal = z.infer<typeof LineProposalSchema>;

// --- pages -----------------------------------------------------------------------------------------
type Page =
  | { kind: "text"; text: string; fromCache: boolean }
  | { kind: "failed"; message: string }
  | { kind: "stop"; status: number };

export type PageDeps = {
  getText?: GetText;
  sleep?: (ms: number) => Promise<void>;
  isCached?: (url: string) => boolean;
  delayMs?: number;
  // Read a page already on disk instead of requesting it again. Off by default: last_verified_at is
  // stamped on promotion and must not date a months-old cached page.
  useCache?: boolean;
};

// One attempt (fetchText would retry 429 and 5xx, requests nobody counts) with the project
// User-Agent, and an empty body is never cached.
export function livePageText(options: { refresh: boolean; fetchHtml?: typeof fetchText }): GetText {
  const request = options.fetchHtml ?? fetchText;
  return (url) =>
    pageText(url, {
      fetchHtml: (target, fetchOptions) =>
        request(target, {
          ...fetchOptions,
          refresh: options.refresh,
          attempts: 1,
          validate: (body) => {
            fetchOptions?.validate?.(body);
            if (body.trim() === "") throw new Error("empty page");
          },
        }),
    });
}

// One request at a time, `delayMs` apart (a page read from the cache costs no request), and one fetch
// per url per run, a failure included.
function pageReader(deps: PageDeps): (url: string) => Promise<Page> {
  const useCache = deps.useCache === true;
  const getText = deps.getText ?? livePageText({ refresh: !useCache });
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const onDisk = deps.isCached ?? ((url: string) => isCached(url));
  const delayMs = deps.delayMs ?? DEFAULT_DELAY_MS;
  const seen = new Map<string, Page>();
  let requests = 0;
  return async (url) => {
    const known = seen.get(url);
    if (known !== undefined) return known;
    const fromCache = useCache && onDisk(url);
    if (!fromCache) {
      if (requests > 0) await sleep(delayMs);
      requests++;
    }
    let page: Page;
    try {
      const text = await getText(url);
      page =
        text.trim() === ""
          ? { kind: "failed", message: "the page is empty" }
          : { kind: "text", text, fromCache };
    } catch (error) {
      const status = httpStatusOf(error);
      page =
        status !== null && isStopStatus(status)
          ? { kind: "stop", status }
          : { kind: "failed", message: error instanceof Error ? error.message : String(error) };
    }
    seen.set(url, page);
    return page;
  };
}

// --- checks ----------------------------------------------------------------------------------------
const SEPARATOR = String.raw`[.,'\s  ]`;

// Where a quote (as normalizeForMatch writes it) states this amount in major units: thousands
// groups optionally separated (1200, 1 200, 1,200, 1.200), a decimal comma or point, and never as
// part of a larger number (40 is not in 400, 500 is not in 1 500 or 500,50). The decimals stop at the
// currency's minor digits, so a separator followed by three digits is a thousands group, never a
// decimal: 1.2 is not in "1.200" and 1.05 is not in "1,050".
export function numberMatches(
  value: number,
  quote: string,
  digits = 2,
): { start: number; end: number }[] {
  const [whole = "0", cents = ""] = value.toFixed(digits).split(".");
  const groups: string[] = [];
  for (let end = whole.length; end > 0; end -= 3)
    groups.unshift(whole.slice(Math.max(0, end - 3), end));
  const fraction = cents.replace(/0+$/, "");
  let decimals = "";
  if (digits > 0)
    decimals =
      fraction === ""
        ? `(?:[.,]0{1,${digits}})?`
        : `[.,]${fraction}0{0,${digits - fraction.length}}`;
  const pattern = new RegExp(
    String.raw`(?<!\d)(?<!\d${SEPARATOR})${groups.join(`${SEPARATOR}?`)}${decimals}(?!\d)(?![.,]\d)(?!${SEPARATOR}\d{3}(?!\d))`,
    "g",
  );
  return [...quote.matchAll(pattern)].map((m) => ({
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
  }));
}

const MONEY_AFTER = /^\s?(?:[€$£]|(?:eur|euros?|usd|gbp|huf|ft)\b)/;
const MONEY_BEFORE = /(?:[€$£]|\b(?:eur|usd|gbp|huf))\s?$/;

// The years a text states, leaving out an amount that merely looks like one ("2040 EUR", "EUR 2025").
// The text is normalised first (lower case), so an upper-case currency code is still a currency.
export function yearsIn(raw: string): number[] {
  const text = normalizeForMatch(raw);
  const years: number[] = [];
  for (const m of text.matchAll(/(?<!\d)((?:19|20)\d{2})(?!\d)(?![.,]\d)/g)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (
      MONEY_AFTER.test(text.slice(end, end + 8)) ||
      MONEY_BEFORE.test(text.slice(Math.max(0, start - 8), start))
    )
      continue;
    years.push(Number(m[1]));
  }
  return years;
}

type Period = LineProposal["per"];
const periodWords = (alternatives: string[]): RegExp =>
  new RegExp(`(?<!\\p{L})(?:${alternatives.join("|")})(?!\\p{L})`, "u");
// How a quote names the period of an amount (English, French, German, Italian, Hungarian, Dutch).
const PERIOD_WORDS: Record<Period, RegExp> = {
  month: periodWords([
    "months?",
    "monthly",
    "mensuel\\p{L}*",
    "mois",
    "monat\\p{L}*",
    "mese",
    "mensil\\p{L}*",
    "havi",
    "maand\\p{L}*",
  ]),
  year: periodWords([
    "years?",
    "yearly",
    "annual\\p{L}*",
    "annuel\\p{L}*",
    "par an",
    "jahr\\p{L}*",
    "j[äa]hrlich",
    "anno",
    "annuo",
    "jaar",
    "jaarlijks",
    "évi",
  ]),
  once: periodWords([
    "one-off",
    "one[- ]time",
    "once",
    "uniques?",
    "une seule fois",
    "einmalig\\p{L}*",
    "una tantum",
    "eenmalig\\p{L}*",
  ]),
};

const periodsIn = (quote: string): Period[] => {
  const text = normalizeForMatch(quote);
  return (Object.keys(PERIOD_WORDS) as Period[]).filter((p) => PERIOD_WORDS[p].test(text));
};

// An estimate needs a year of MIN_ESTIMATE_YEAR or later in its quote or in a date quote from the same
// page; a year elsewhere on the page (a footer, a menu) says nothing about this figure. The newest
// year of the two wins.
function ageOf(line: LineProposal, pageContent: string): { year: number } | { problem: string } {
  const { url, quote, dateQuote } = line.evidence;
  if (dateQuote !== undefined && !quoteInText(dateQuote, pageContent))
    return {
      problem: `the date quote is not on the page ${url} (verbatim, 15 characters at least)`,
    };
  const years = [...yearsIn(quote), ...(dateQuote === undefined ? [] : yearsIn(dateQuote))];
  if (years.length === 0)
    return {
      problem: `the quote and the date quote state no year (an estimate needs a year of ${MIN_ESTIMATE_YEAR} or later in its quote or in a date quote from the same page)`,
    };
  const year = Math.max(...years);
  return year >= MIN_ESTIMATE_YEAR
    ? { year }
    : { problem: `the newest year in the quote is ${year}, before ${MIN_ESTIMATE_YEAR}` };
}

type LineCheck =
  | { ok: false; problem: string }
  | { ok: true; year: number | null; periodStated: boolean };

// Whether a line can be kept. The page is already fetched.
function checkLine(line: LineProposal, pageContent: string): LineCheck {
  const { url, quote } = line.evidence;
  if (!quoteInText(quote, pageContent))
    return {
      ok: false,
      problem: `the quote is not on the page ${url} (verbatim, 15 characters at least)`,
    };
  const text = normalizeForMatch(quote);
  const digits = minorUnitDigits(line.currency);
  const matches = [];
  for (const value of new Set([line.min, line.max])) {
    const found = numberMatches(value, text, digits);
    if (found.length === 0)
      return { ok: false, problem: `the number ${value} is not in the quote` };
    matches.push(...found);
  }
  if (!matches.some((m) => currencyNextTo(line.currency, text, m.start, m.end)))
    return {
      ok: false,
      problem: `the currency ${line.currency} is not written next to ${line.min} or ${line.max} in the quote`,
    };
  const periods = periodsIn(quote);
  if (periods.length > 0 && !periods.includes(line.per))
    return {
      ok: false,
      problem: `the quote states the period ${periods.join(" and ")} but the line says per ${line.per}`,
    };
  if (line.info_kind === "official")
    return { ok: true, year: null, periodStated: periods.length > 0 };
  const age = ageOf(line, pageContent);
  if ("problem" in age) return { ok: false, problem: age.problem };
  return { ok: true, year: age.year, periodStated: periods.length > 0 };
}

// --- profile ---------------------------------------------------------------------------------------
type StagedLine = {
  value: { min: number; max: number; currency: string; per: "month" | "year" | "once" };
  source: string;
  info_kind: "official" | "estimate";
  basis?: Partial<StagedBasis> & Pick<StagedBasis, "fr">;
};
type Evidence = StagedCostProfile["_review"]["evidence"][number];

// "www.campusfrance.org" becomes "campusfrance-org"; a second page of the same host takes "-2".
function sourceKeyer(): {
  keyFor: (url: string) => string;
  sources: Record<string, { url: string; last_verified_at: null }>;
} {
  const sources: Record<string, { url: string; last_verified_at: null }> = {};
  const keyFor = (url: string): string => {
    const host = new URL(url).hostname
      .toLowerCase()
      .replace(/^www\./, "")
      .replace(/[^a-z0-9]+/g, "-");
    for (let n = 1; ; n++) {
      const key = n === 1 ? host : `${host}-${n}`;
      const taken = sources[key];
      if (taken === undefined) {
        sources[key] = { url, last_verified_at: null };
        return key;
      }
      if (taken.url === url) return key;
    }
  };
  return { keyFor, sources };
}

const draft = (text: string) => ({ text, status: "draft" as const });

function stagedLine(line: LineProposal, source: string): StagedLine {
  const factor = 10 ** minorUnitDigits(line.currency);
  return {
    value: {
      min: Math.round(line.min * factor),
      max: Math.round(line.max * factor),
      currency: line.currency,
      per: line.per,
    },
    source,
    info_kind: line.info_kind,
    ...(line.basis === undefined
      ? {}
      : {
          basis: {
            fr: draft(line.basis.fr),
            ...(line.basis.en === undefined ? {} : { en: draft(line.basis.en) }),
            ...(line.basis.ar === undefined ? {} : { ar: draft(line.basis.ar) }),
          },
        }),
  };
}

type Verified =
  | { kind: "stopped"; lines: string[] }
  | { kind: "none"; lines: string[] }
  | {
      kind: "kept";
      lines: string[];
      record: Record<string, unknown>;
      review: Record<string, unknown>;
    };

async function verifyProposal(
  proposal: OfficialCostProposal,
  deps: PageDeps,
  today: string,
): Promise<Verified> {
  const readPage = pageReader(deps);
  const report: string[] =
    deps.useCache === true
      ? [
          "--use-cache: a page already on disk is read from the cache, so its last_verified_at stamp may date a past reading",
        ]
      : [];
  const dropped: string[] = [];
  const notes: string[] = [];
  const lines: Partial<Record<LivingCostCategory, StagedLine>> = {};
  const evidence: Evidence[] = [];
  const { keyFor, sources } = sourceKeyer();

  for (const name of LIVING_COST_CATEGORIES) {
    const line = proposal.lines[name];
    if (line === undefined) continue;
    const drop = (reason: string): void => {
      dropped.push(`${name}: ${reason}`);
      report.push(`dropped ${name}: ${reason}`);
    };
    const { url, quote } = line.evidence;
    if (!isOfficialHost(url)) {
      drop(`${url} is not an official source (national portal or government site)`);
      continue;
    }
    const page = await readPage(url);
    if (page.kind === "stop") {
      report.push(
        `dropped ${name}: the site answered HTTP ${page.status} for ${url} (blocked or asked us to slow down); stopping. Nothing was staged: wait before re-running.`,
      );
      return { kind: "stopped", lines: report };
    }
    if (page.kind === "failed") {
      drop(`the page could not be fetched (${page.message})`);
      continue;
    }
    const check = checkLine(line, page.text);
    if (!check.ok) {
      drop(check.problem);
      continue;
    }
    lines[name] = stagedLine(line, keyFor(url));
    evidence.push({ fact: `lines.${name}`, url, quote });
    if (line.evidence.dateQuote !== undefined)
      evidence.push({ fact: `lines.${name}.date`, url, quote: line.evidence.dateQuote });
    const age =
      check.year === null
        ? "no age check (official)"
        : `year ${check.year} (newest year in quote wins)`;
    report.push(
      `kept ${name}: ${line.min}-${line.max} ${line.currency} per ${line.per} (${line.info_kind}) "${quote}" (${url}); ${page.fromCache ? "page from cache" : "page fetched now"}; ${age}`,
    );
    if (check.year === null) {
      notes.push(
        `lines.${name}: official line, no age check was done (a rate in force is assumed)`,
      );
      report.push(`note ${name}: official line, no age check was done`);
    }
    if (!check.periodStated) {
      notes.push(
        `lines.${name}: period not stated in quote (per ${line.per} comes from the proposal)`,
      );
      report.push(
        `note ${name}: period not stated in quote (per ${line.per} comes from the proposal)`,
      );
    }
  }
  if (evidence.length === 0)
    return {
      kind: "none",
      lines: [...report, `no line kept for ${proposal.slug}: nothing staged`],
    };

  const record = {
    slug: proposal.slug,
    country: proposal.country,
    city: proposal.city,
    lines,
    sources,
  };
  const review = {
    kind: COLLECTION,
    slug: proposal.slug,
    name: `Official cost profile ${proposal.slug}`,
    preparedBy: "assistant",
    preparedAt: today,
    sourceId: `official:${proposal.slug}`,
    evidence,
    notes: [
      dropped.length === 0
        ? "Every proposed line kept."
        : `Dropped by the verifier: ${dropped.join("; ")}.`,
      ...notes,
    ].join(" "),
  };
  return { kind: "kept", lines: report, record, review };
}

// --- command line ----------------------------------------------------------------------------------
export type VerifyDeps = PageDeps & { stagingDir?: string; dataDir?: string; today?: string };
export type VerifyOutcome = { ok: boolean; lines: string[] };

const describeError = (error: unknown): string =>
  error instanceof z.ZodError
    ? error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    : error instanceof Error
      ? error.message
      : String(error);

// Verifies one proposal file and, unless it is a dry run, stages the profile. Never overwrites a
// staged file, nor a slug already promoted into data/.
export async function runVerify(
  options: { file: string; dryRun: boolean },
  deps: VerifyDeps = {},
): Promise<VerifyOutcome> {
  const stagingDir = deps.stagingDir ?? STAGING_DIR;
  const dataDir = deps.dataDir ?? DATA_DIR;
  const today = deps.today ?? new Date().toISOString().slice(0, 10);
  if ((deps.delayMs ?? DEFAULT_DELAY_MS) < MIN_DELAY_MS)
    return {
      ok: false,
      lines: [`--delay-ms must be at least ${MIN_DELAY_MS}: one request every 2 seconds at most`],
    };
  let proposal: OfficialCostProposal;
  try {
    proposal = OfficialCostProposalSchema.parse(JSON.parse(await readFile(options.file, "utf8")));
  } catch (error) {
    return { ok: false, lines: [`invalid proposal ${options.file}: ${describeError(error)}`] };
  }
  const target = stageFile(COLLECTION, proposal.slug, stagingDir);
  if (!options.dryRun) {
    if (existsSync(target))
      return { ok: false, lines: [`${target} already exists: never overwritten`] };
    if (existsSync(path.join(dataDir, COLLECTION, `${proposal.slug}.yaml`)))
      return {
        ok: false,
        lines: [`${COLLECTION}/${proposal.slug} is already in ${dataDir}/: never overwritten`],
      };
  }

  const verified = await verifyProposal(proposal, deps, today);
  if (verified.kind === "stopped") return { ok: false, lines: verified.lines };
  if (verified.kind === "none") return { ok: false, lines: verified.lines };

  const check = CostProfileRecordSchema.safeParse(
    JSON.parse(JSON.stringify(verified.record), (key: string, value: unknown) =>
      key === "last_verified_at" && value === null ? today : value,
    ),
  );
  if (!check.success) {
    const issue = check.error.issues[0];
    return {
      ok: false,
      lines: [
        ...verified.lines,
        `invalid profile ${proposal.slug} at ${issue?.path.join(".") ?? "?"}: ${issue?.message ?? "?"}`,
      ],
    };
  }
  if (options.dryRun) return { ok: true, lines: [...verified.lines, "dry run: nothing written"] };
  await mkdir(path.dirname(target), { recursive: true });
  // "wx": fail instead of overwriting, even if another process created the file meanwhile.
  await writeFile(target, toYaml({ ...verified.record, _review: verified.review }), { flag: "wx" });
  return { ok: true, lines: [...verified.lines, `staged ${target}`] };
}

function delayFlag(argv: readonly string[]): number {
  const at = argv.indexOf("--delay-ms");
  if (at === -1) return DEFAULT_DELAY_MS;
  const value = Number(argv[at + 1]);
  if (!Number.isInteger(value) || value <= 0)
    throw new Error("--delay-ms needs a positive integer");
  return value;
}

async function main(argv: readonly string[]): Promise<void> {
  const [command, file] = argv;
  if (command !== "verify" || file === undefined || file.startsWith("--"))
    throw new Error(
      "usage: data:costs-official verify <proposal.json> [--dry-run] [--delay-ms 4000] [--use-cache]",
    );
  const outcome = await runVerify(
    { file, dryRun: argv.includes("--dry-run") },
    { delayMs: delayFlag(argv), useCache: argv.includes("--use-cache") },
  );
  for (const line of outcome.lines) console.log(line);
  if (!outcome.ok) process.exitCode = 1;
}

// The file name, not a suffix: costs.ts has the same kind of guard and is imported above.
if (path.basename(process.argv[1] ?? "") === "official-costs.ts") {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
