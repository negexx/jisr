import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { duplicateTopLevelKeys } from "./json-duplicate-keys";
import { DATA_DIR } from "./staging";

// Builds the pages file for `data:read --pages` from the curated Italy page registry
// (scripts/import/registries/it-pages-N.json) instead of the automatic search of `data:pages`, which
// found wrong pages for Italy. No network, no model: it only orders, filters and caps the URLs
// the research step listed. Registry shape: university -> { institutionSlugs, universityPages, programmes, notes } (see the Zod schema below).
const MIN_YEAR = 2026;
const DEFAULT_CAP = 14;
const THIN_BELOW = 3;

const pageSchema = z.object({
  url: z.string(),
  says: z.string().default(""),
  year: z.string().nullable().default(null),
});
const pages = z.array(pageSchema).default([]);

const universitySchema = z.object({
  institutionSlugs: z.array(z.string()).default([]),
  universityPages: z
    .object({
      admissions: pages,
      fees: pages,
      countryList: pages,
      documents: pages,
      language: pages,
    })
    .default({ admissions: [], fees: [], countryList: [], documents: [], language: [] }),
  programmes: z
    .record(z.string(), z.object({ programme: pages, admissions: pages, other: pages }))
    .default({}),
  notes: z.string().default(""),
});
const registrySchema = z.record(z.string(), universitySchema);

export type Registry = z.infer<typeof registrySchema>;
type Page = z.infer<typeof pageSchema>;

export type DropReason = "year" | "cap" | "invalid-url";
export type Dropped = {
  url: string;
  kind: string;
  year: string | null;
  university: string;
  reason: DropReason;
  programme: string | null;
};

export type BuildOptions = {
  maxPerProgramme: number;
  programmeSlugs: ReadonlySet<string>;
  institutionSlugs: ReadonlySet<string>;
  // names of the registry files, in the order of `registries`, for error messages
  files?: readonly string[];
};

export type BuildResult = {
  pages: Record<string, string[]>;
  dropped: Dropped[];
  missing: string[];
  stats: {
    universities: number;
    programmes: number;
    totalUrls: number;
    droppedByReason: Record<DropReason, number>;
    thin: string[];
  };
};

// Later files never override: a university appearing twice is an error, so is a programme slug.
// `files` names each registry in the errors (default "registry #N").
export function mergeRegistries(
  registries: readonly unknown[],
  files: readonly string[] = [],
): Registry {
  const merged: Registry = {};
  const origin = new Map<string, string>();
  for (const [index, raw] of registries.entries()) {
    const file = files[index] ?? `registry #${index + 1}`;
    const parsed = registrySchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(
        `invalid registry ${file} at ${issue?.path.join(".") ?? "?"}: ${issue?.message ?? "bad shape"}`,
      );
    }
    for (const [name, university] of Object.entries(parsed.data)) {
      const first = origin.get(name);
      if (first !== undefined)
        throw new Error(`university "${name}" appears twice (in ${first} and ${file})`);
      origin.set(name, file);
      merged[name] = university;
    }
  }
  return merged;
}

function yearOf(year: string | null): number | null {
  const match = year === null ? null : /\d{4}/.exec(year);
  return match === null ? null : Number(match[0]);
}

// Year-gated kinds: an admissions or programme "other" page of an older academic year than 2026/27
// can mislead deadlines and requirements. fees and countryList pages are never dropped for year:
// the registry labels the year a rule STARTED, not when it stops applying (a country list stays
// current until replaced), and the pipeline's own study-year gate (checkTuition/staleStudyYear)
// already rejects fee amounts tied to an older study year. documents, language and programme
// pages are kept whatever their year.
const GATED = new Set(["admissions", "other"]);

type Candidate = { url: string; kind: string; year: string | null };

// URL normalised through the parsed form (spaces become %20) with the fragment removed;
// non-http(s) and unparseable URLs are dropped; older gated years are dropped.
function screen(
  list: readonly Page[],
  kind: string,
  university: string,
  programme: string | null,
  dropped: Dropped[],
): Candidate[] {
  const kept: Candidate[] = [];
  for (const page of list) {
    const base = { url: page.url, kind, year: page.year, university, programme };
    let url: string;
    try {
      const parsed = new URL(page.url.trim());
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("scheme");
      parsed.hash = "";
      url = parsed.href;
    } catch {
      dropped.push({ ...base, reason: "invalid-url" });
      continue;
    }
    const year = yearOf(page.year);
    if (GATED.has(kind) && year !== null && year < MIN_YEAR) {
      dropped.push({ ...base, reason: "year" });
      continue;
    }
    kept.push({ url, kind, year: page.year });
  }
  return kept;
}

function upgradeAndDedupe(candidates: readonly Candidate[]): Candidate[] {
  const listed = new Set(candidates.map((c) => c.url));
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const c of candidates) {
    const https = c.url.replace(/^http:/, "https:");
    const url = c.url.startsWith("http:") && listed.has(https) ? https : c.url;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ ...c, url });
  }
  return out;
}

function checkSlugs(registry: Registry, options: BuildOptions): void {
  const unknownProgrammes: string[] = [];
  const unknownInstitutions: string[] = [];
  const owner = new Map<string, string>();
  for (const [name, university] of Object.entries(registry)) {
    for (const slug of university.institutionSlugs)
      if (!options.institutionSlugs.has(slug)) unknownInstitutions.push(slug);
    for (const slug of Object.keys(university.programmes)) {
      if (!options.programmeSlugs.has(slug)) unknownProgrammes.push(slug);
      const first = owner.get(slug);
      if (first !== undefined)
        throw new Error(`programme ${slug} is listed under both "${first}" and "${name}"`);
      owner.set(slug, name);
    }
  }
  const problems: string[] = [];
  if (unknownProgrammes.length > 0)
    problems.push(`unknown programme slugs: ${unknownProgrammes.join(", ")}`);
  if (unknownInstitutions.length > 0)
    problems.push(`unknown institution slugs: ${unknownInstitutions.join(", ")}`);
  if (problems.length > 0) throw new Error(problems.join("; "));
}

export function buildPages(registries: readonly unknown[], options: BuildOptions): BuildResult {
  const registry = mergeRegistries(registries, options.files);
  checkSlugs(registry, options);
  const dropped: Dropped[] = [];
  const result: Record<string, string[]> = {};

  for (const [name, university] of Object.entries(registry)) {
    const up = university.universityPages;
    // University pages are screened once, so a drop is not repeated for every programme.
    const shared = [
      ...screen(up.admissions, "admissions", name, null, dropped),
      ...screen(up.fees, "fees", name, null, dropped),
      ...screen(up.countryList, "countryList", name, null, dropped),
      ...screen(up.documents, "documents", name, null, dropped),
      ...screen(up.language, "language", name, null, dropped),
    ];
    for (const [slug, programme] of Object.entries(university.programmes)) {
      const own = [
        ...screen(programme.programme, "programme", name, slug, dropped),
        ...screen(programme.admissions, "admissions", name, slug, dropped),
        ...screen(programme.other, "other", name, slug, dropped),
      ];
      const ordered = upgradeAndDedupe([...own, ...shared]);
      result[slug] = ordered.slice(0, options.maxPerProgramme).map((c) => c.url);
      for (const c of ordered.slice(options.maxPerProgramme))
        dropped.push({
          url: c.url,
          kind: c.kind,
          year: c.year,
          university: name,
          reason: "cap",
          programme: slug,
        });
    }
  }

  const sorted: Record<string, string[]> = {};
  for (const slug of Object.keys(result).sort()) sorted[slug] = result[slug] ?? [];
  const droppedByReason: Record<DropReason, number> = { year: 0, cap: 0, "invalid-url": 0 };
  for (const d of dropped) droppedByReason[d.reason]++;
  return {
    pages: sorted,
    dropped,
    missing: [...options.programmeSlugs]
      .filter((s) => s.startsWith("it-") && !(s in sorted))
      .sort(),
    stats: {
      universities: Object.keys(registry).length,
      programmes: Object.keys(sorted).length,
      totalUrls: Object.values(sorted).reduce((n, urls) => n + urls.length, 0),
      droppedByReason,
      thin: Object.entries(sorted)
        .filter(([, urls]) => urls.length < THIN_BELOW)
        .map(([slug]) => slug),
    },
  };
}

export function renderDropped(dropped: readonly Dropped[]): string {
  const rows = dropped.map((d) =>
    [d.url, d.kind, d.year ?? "", d.university, d.reason, d.programme ?? ""].join("\t"),
  );
  return `${["url", "kind", "year", "university", "reason", "programme"].join("\t")}\n${rows.join("\n")}${rows.length > 0 ? "\n" : ""}`;
}

export function renderSummary(result: BuildResult, out: string): string {
  const { stats } = result;
  const lines = [
    `universities: ${stats.universities}`,
    `programmes: ${stats.programmes}`,
    `total URLs: ${stats.totalUrls}`,
    `dropped: year ${stats.droppedByReason.year}, cap ${stats.droppedByReason.cap}, invalid-url ${stats.droppedByReason["invalid-url"]}`,
    `programmes with fewer than ${THIN_BELOW} URLs (${stats.thin.length}): ${stats.thin.join(", ") || "none"}`,
    `it-* programmes not in the registry (${result.missing.length}): ${result.missing.join(", ") || "none"}`,
    `pages: ${out}`,
  ];
  return lines.join("\n");
}

export type CliOptions = {
  registry: string[];
  out: string;
  maxPerProgramme: number;
  dataDir: string;
};

const FLAGS = ["--registry", "--out", "--max-per-programme", "--data-dir"] as const;

// A flag without a value, an unknown flag or a repeated flag throws.
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
  const registry = (values.get("--registry") ?? "").split(",").filter((s) => s !== "");
  if (registry.length === 0) throw new Error("--registry <file[,file...]> is required");
  const out = values.get("--out");
  if (out === undefined) throw new Error("--out <pages.json> is required");
  const maxPerProgramme = Number(values.get("--max-per-programme") ?? String(DEFAULT_CAP));
  if (!Number.isInteger(maxPerProgramme) || maxPerProgramme < 1)
    throw new Error("--max-per-programme must be an integer >= 1");
  return { registry, out, maxPerProgramme, dataDir: values.get("--data-dir") ?? DATA_DIR };
}

async function slugsIn(dir: string): Promise<Set<string>> {
  const names = await readdir(dir);
  return new Set(names.filter((n) => n.endsWith(".yaml")).map((n) => n.slice(0, -".yaml".length)));
}

export async function runItPages(options: CliOptions): Promise<string> {
  const registries: unknown[] = [];
  for (const file of options.registry) {
    const text = await readFile(file, "utf8");
    const repeated = duplicateTopLevelKeys(text);
    if (repeated.length > 0)
      throw new Error(
        `${file}: university "${repeated.join('", "')}" appears twice in the same file`,
      );
    registries.push(JSON.parse(text) as unknown);
  }
  const result = buildPages(registries, {
    maxPerProgramme: options.maxPerProgramme,
    programmeSlugs: await slugsIn(path.join(options.dataDir, "programs")),
    institutionSlugs: await slugsIn(path.join(options.dataDir, "institutions")),
    files: options.registry,
  });
  // Nothing is written before every check has passed.
  await writeFile(
    options.out,
    `${JSON.stringify({ shared: {}, programmes: result.pages }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    `${options.out}.missing.txt`,
    result.missing.map((s) => `${s}\n`).join(""),
    "utf8",
  );
  await writeFile(`${options.out}.dropped.txt`, renderDropped(result.dropped), "utf8");
  return renderSummary(result, options.out);
}

if (process.argv[1]?.endsWith("it-pages.ts") === true) {
  runItPages(parseArgs(process.argv.slice(2)))
    .then((summary) => console.log(summary))
    .catch((error: unknown) => {
      console.error(`STOPPED: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
