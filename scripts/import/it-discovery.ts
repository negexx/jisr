import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { classify } from "./sources/universitaly";
import { compare, loadItalyData, renderReport } from "./sources/universitaly-compare";
import {
  type FetchedPage,
  fetchPages,
  type Getter,
  httpGet,
  PortalStopError,
  parsePages,
  readCache,
  writeCache,
} from "./sources/universitaly-fetch";
import { DATA_DIR } from "./staging";

// Read-only discovery of Italian programmes from the Universitaly search (see
// docs/superpowers/plans/2026-10-08-italy-discovery.md). Fetches the English Triennale search
// (about 25 pages) and the first page of the Italian one (only its total), 1.5 s apart, caches the
// raw responses with sha256 under data-staging/universitaly/<day>/, compares with data/ and writes
// report.md and candidates.json. It never edits data/ or the staging area.
const MAX_PAGES = 60;

export type DiscoveryOptions = {
  out: string;
  fromCache: string | null;
  delayMs: number;
  get: Getter;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
  dataDir?: string;
};

export async function runDiscovery(
  options: DiscoveryOptions,
): Promise<{ runDir: string; report: string }> {
  let fetchedAt: string;
  let pages: FetchedPage[];
  let runDir: string;
  if (options.fromCache !== null) {
    const cached = await readCache(options.fromCache);
    fetchedAt = cached.fetchedAt;
    pages = cached.pages;
    runDir = options.fromCache;
  } else {
    const now = options.now();
    fetchedAt = now.toISOString();
    runDir = path.join(options.out, fetchedAt.slice(0, 10));
    const base = {
      get: options.get,
      sleep: options.sleep,
      delayMs: options.delayMs,
      maxPages: MAX_PAGES,
    };
    const english = await fetchPages("EN", base);
    await options.sleep(options.delayMs);
    const italian = await fetchPages("IT", { ...base, firstOnly: true });
    // One call with both languages: the manifest lists exactly the pages passed to it.
    pages = [...english, ...italian];
    await writeCache(runDir, pages, fetchedAt);
  }

  const english = parsePages(
    "EN",
    pages.filter((p) => p.language === "EN"),
  );
  const italian = parsePages(
    "IT",
    pages.filter((p) => p.language === "IT"),
  );
  const classified = english.courses.map(classify);
  const mixedTotal = english.courses.filter((c) => c.lingua === "mu").length;
  const comparison = compare(classified, await loadItalyData(options.dataDir ?? DATA_DIR));
  const meta = {
    fetchedAt,
    cacheDir: runDir,
    englishTotal: english.totalResults,
    mixedTotal,
    italianTotal: italian.totalResults,
  };
  const report = renderReport(comparison, meta);
  await mkdir(runDir, { recursive: true });
  await writeFile(path.join(runDir, "report.md"), report, "utf8");
  const candidates = {
    meta,
    academicYear: comparison.academicYear,
    newUniversities: comparison.newUniversities,
    newProgrammes: comparison.newProgrammes,
    possible: comparison.possible,
  };
  await writeFile(
    path.join(runDir, "candidates.json"),
    `${JSON.stringify(candidates, null, 2)}\n`,
    "utf8",
  );
  return { runDir, report };
}

// Any failure is a stop (a portal refusal, a changed shape, a timeout, a network error): the
// message is printed, the exit code is non-zero and nothing is retried.
export function describeStop(error: unknown): string {
  if (error instanceof PortalStopError) return `STOPPED: ${error.message}`;
  return `STOPPED: ${error instanceof Error ? error.message : String(error)}`;
}

export type CliOptions = { out: string; fromCache: string | null; delayMs: number };

const FLAGS = ["--out", "--from-cache", "--delay-ms"] as const;

// A flag without a value, an unknown flag or a repeated flag throws: a typo must never turn
// into a live fetch the owner did not ask for.
export function parseArgs(args: string[]): CliOptions {
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i] ?? "";
    if (!FLAGS.some((f) => f === flag)) throw new Error(`unknown flag ${flag}`);
    if (values.has(flag)) throw new Error(`${flag} given twice`);
    const value = args[i + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${flag} needs a value`);
    values.set(flag, value);
    i++;
  }
  const delayMs = Number(values.get("--delay-ms") ?? "1500");
  if (!Number.isFinite(delayMs) || delayMs < 0) throw new Error("--delay-ms must be a number >= 0");
  return {
    out: values.get("--out") ?? path.join("data-staging", "universitaly"),
    fromCache: values.get("--from-cache") ?? null,
    delayMs,
  };
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  const { runDir, report } = await runDiscovery({
    ...cli,
    get: httpGet,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => new Date(),
  });
  console.log(report.split("\n").slice(0, 24).join("\n"));
  console.log(
    `\nreport: ${path.join(runDir, "report.md")}\ncandidates: ${path.join(runDir, "candidates.json")}`,
  );
}

if (process.argv[1]?.endsWith("it-discovery.ts") === true) {
  main().catch((error: unknown) => {
    console.error(describeStop(error));
    process.exitCode = 1;
  });
}
