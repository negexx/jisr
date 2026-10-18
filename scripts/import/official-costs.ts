import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";
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

import { dropAuditRows } from "./audit";
import { httpStatusOf, isStopStatus, type StagedBasis, type StagedCostProfile } from "./costs";
import { pageText } from "./evidence";
import { fetchText, isCached } from "./http";
import { checkLine } from "./official-costs-checks";
import { isPdfCached, type PdfDeps } from "./pdf";
import type { GetText } from "./proposals";
import { isOfficialHost } from "./scholarships";
import { DATA_DIR, STAGING_DIR, stageFile, toYaml } from "./staging";

// Official cost profiles: the assistant proposes, from official pages, a figure per cost line with a
// verbatim quote. The code re-fetches every cited page and keeps a line only if the quote is really
// there, its numbers and currency are in the quote and, for an estimate, it is not out of date. A line
// that fails is dropped alone and reported; the rest is staged for the 100% audit.
// Usage: data:costs-official verify <proposal.json> [--dry-run] [--delay-ms 4000] [--use-cache]
const COLLECTION = "cost-profiles";
const MIN_DELAY_MS = 2000;
export const DEFAULT_DELAY_MS = 4000;
export { MIN_ESTIMATE_YEAR, numberMatches, yearsIn } from "./official-costs-checks";

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
    // `dateQuote`: for a line (estimate or official) whose own quote states no year, a second verbatim
    // quote from the same page that does ("Updated 12 March 2026"). It dates the page, not the figure.
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
export function livePageText(options: {
  refresh: boolean;
  fetchHtml?: typeof fetchText;
  pdfDeps?: PdfDeps;
}): GetText {
  const request = options.fetchHtml ?? fetchText;
  return (url) =>
    pageText(url, {
      // a PDF has its own text cache: refreshing skips it too
      pdfDeps: { ...options.pdfDeps, refresh: options.refresh },
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
  // what a cache read would serve: the page text or, for a PDF, its extracted text
  const onDisk = deps.isCached ?? ((url: string) => isCached(url) || isPdfCached(url));
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

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

// The source key shape sourceKeyer builds from a url ("www.campusfrance.org" -> "campusfrance-org").
const hostKeyOf = (url: string): string =>
  new URL(url).hostname
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/g, "-");

// A revision of a profile already in data/: the lines this run kept replace the record's, while a
// line the proposal omits or that failed a check keeps the existing one. Sources keep their urls and
// older dates; a page the proposal adds is new (null, stamped on promotion).
function reviseProfile(
  rawExisting: Record<string, unknown>,
  fresh: Record<string, unknown>,
): { record: Record<string, unknown>; changed: string[]; kept: string[] } {
  const { _review: _ignored, ...existing } = rawExisting;
  const sources = { ...asRecord(existing.sources) };
  const keyOfUrl = new Map<string, string>();
  for (const [key, value] of Object.entries(sources)) {
    const url = asRecord(value).url;
    if (typeof url === "string") keyOfUrl.set(url, key);
  }
  const remap = new Map<string, string>();
  for (const [oldKey, value] of Object.entries(asRecord(fresh.sources))) {
    const url = asRecord(value).url;
    if (typeof url !== "string") continue;
    const known = keyOfUrl.get(url);
    if (known !== undefined) {
      remap.set(oldKey, known);
      continue;
    }
    const host = hostKeyOf(url);
    let n = 1;
    let key = host;
    while (key in sources) {
      n++;
      key = `${host}-${n}`;
    }
    sources[key] = { url, last_verified_at: null };
    keyOfUrl.set(url, key);
    remap.set(oldKey, key);
  }
  const existingLines = asRecord(existing.lines);
  const freshLines = asRecord(fresh.lines);
  const lines: Record<string, unknown> = { ...existingLines };
  const changed: string[] = [];
  const kept: string[] = [];
  for (const name of LIVING_COST_CATEGORIES) {
    const freshLine = freshLines[name];
    if (freshLine === undefined) {
      if (existingLines[name] !== undefined) kept.push(name);
      continue;
    }
    const line = asRecord(freshLine);
    const source =
      typeof line.source === "string" ? (remap.get(line.source) ?? line.source) : line.source;
    const remapped = { ...line, source };
    if (JSON.stringify(existingLines[name]) !== JSON.stringify(remapped)) changed.push(name);
    lines[name] = remapped;
  }
  return {
    record: { slug: fresh.slug, country: fresh.country, city: fresh.city, lines, sources },
    changed,
    kept,
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
    // the date quote is evidence only when the quote itself has no year and it dated the figure
    if (check.age.from === "date quote" && line.evidence.dateQuote !== undefined)
      evidence.push({ fact: `lines.${name}.date`, url, quote: line.evidence.dateQuote });
    const age = `years: oldest ${check.age.oldest}, newest ${check.age.newest} (from ${check.age.from})`;
    report.push(
      `kept ${name}: ${line.min}-${line.max} ${line.currency} per ${line.per} (${line.info_kind}) "${quote}" (${url}); ${page.fromCache ? "page from cache" : "page fetched now"}; ${age}`,
    );
    for (const note of check.notes) {
      notes.push(`lines.${name}: ${note}`);
      report.push(`note ${name}: ${note}`);
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

// `last_verified_at: null` becomes the review date so the record validates before promotion stamps it.
const stampedForCheck = (record: Record<string, unknown>, date: string): unknown =>
  JSON.parse(
    JSON.stringify(record, (key: string, value: unknown) =>
      key === "last_verified_at" && value === null ? date : value,
    ),
  );

// Verifies one proposal file and, unless it is a dry run, stages the profile. Never overwrites a
// staged file, nor a slug already promoted into data/. With `revise`, a slug already in data/ is
// rebuilt as a revision of that profile instead of being refused.
export async function runVerify(
  options: { file: string; dryRun: boolean; revise?: boolean },
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
  const revise = options.revise === true;
  const target = stageFile(COLLECTION, proposal.slug, stagingDir);
  const promotedPath = path.join(dataDir, COLLECTION, `${proposal.slug}.yaml`);
  const inData = existsSync(promotedPath);
  if (!options.dryRun) {
    if (existsSync(target))
      return { ok: false, lines: [`${target} already exists: never overwritten`] };
    if (revise && !inData)
      return {
        ok: false,
        lines: [
          `${COLLECTION}/${proposal.slug} is not in ${dataDir}/: nothing to revise (drop --revise to stage it as new)`,
        ],
      };
    if (!revise && inData)
      return {
        ok: false,
        lines: [`${COLLECTION}/${proposal.slug} is already in ${dataDir}/: never overwritten`],
      };
  }

  const verified = await verifyProposal(proposal, deps, today);
  if (verified.kind === "stopped") return { ok: false, lines: verified.lines };
  if (verified.kind === "none") return { ok: false, lines: verified.lines };

  if (revise) {
    if (!inData)
      return {
        ok: false,
        lines: [
          ...verified.lines,
          `${COLLECTION}/${proposal.slug} is not in ${dataDir}/: nothing to revise (drop --revise to stage it as new)`,
        ],
      };
    const existing = asRecord(parse(await readFile(promotedPath, "utf8")));
    const merged = reviseProfile(existing, verified.record);
    const check = CostProfileRecordSchema.safeParse(stampedForCheck(merged.record, today));
    if (!check.success) {
      const issue = check.error.issues[0];
      return {
        ok: false,
        lines: [
          ...verified.lines,
          `revision still invalid at ${issue?.path.join(".") ?? "?"}: ${issue?.message ?? "?"}`,
        ],
      };
    }
    const summary = [
      merged.changed.length > 0 ? `changed: ${merged.changed.join(", ")}` : "",
      merged.kept.length > 0 ? `kept: ${merged.kept.join(", ")}` : "",
    ]
      .filter((part) => part !== "")
      .join("; ");
    if (options.dryRun)
      return {
        ok: true,
        lines: [
          ...verified.lines,
          ...(summary === "" ? [] : [summary]),
          "dry run: nothing written",
        ],
      };
    const review = {
      ...verified.review,
      revises: true,
      ...(summary === ""
        ? {}
        : {
            notes: [String(asRecord(verified.review).notes ?? ""), summary]
              .filter((part) => part !== "")
              .join(" "),
          }),
    };
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, toYaml({ ...merged.record, _review: review }), { flag: "wx" });
    const dropped =
      (await dropAuditRows(new Set([`${COLLECTION}/${proposal.slug}`]), stagingDir)).length > 0;
    return {
      ok: true,
      lines: [
        ...verified.lines,
        ...(summary === "" ? [] : [summary]),
        `staged revision ${target}`,
        dropped
          ? "dropped its earlier audit row: the revision needs a new audit batch (pnpm data:audit draw)"
          : "the revision needs an audit batch (pnpm data:audit draw)",
      ],
    };
  }

  const check = CostProfileRecordSchema.safeParse(stampedForCheck(verified.record, today));
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
      "usage: data:costs-official verify <proposal.json> [--dry-run] [--revise] [--delay-ms 4000] [--use-cache]",
    );
  const outcome = await runVerify(
    { file, dryRun: argv.includes("--dry-run"), revise: argv.includes("--revise") },
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
