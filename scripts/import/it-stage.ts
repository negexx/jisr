import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { fetchText } from "./http";
import { ATENEI_URL, type Ateneo, parseAtenei, websiteCandidates } from "./sources/mur";
import type { Candidate } from "./sources/universitaly";
import { loadItalyData } from "./sources/universitaly-compare";
import { buildUniversitalyRecords, resolveAteneo } from "./sources/universitaly-stage";
import {
  DATA_DIR,
  mergeReviewSheet,
  readReviewState,
  reviewCsv,
  reviewFile,
  STAGING_DIR,
  stageFile,
  writeStaged,
} from "./staging";

// Stages the Universitaly candidates the owner names by portal id (see
// docs/superpowers/plans/2026-10-08-italy-fill.md). No model and no search service: officialUrl
// and the field come from the portal, every other fact stays TODO_read_source for the reader.
// Never overwrites a staged file and never touches data/.
const UNIVERSITALY_DIR = path.join(STAGING_DIR, "universitaly");

const CandidateSchema = z.object({
  portalId: z.number().int().positive(),
  university: z.string(),
  name: z.string(),
  classCode: z.string(),
  classCodes: z.array(z.string()),
  field: z.string(),
  confidence: z.enum(["high", "low"]),
  durationYears: z.number().nullable(),
  url: z.string().nullable(),
  academicYear: z.string(),
  delivery: z.enum(["conventional", "blended"]),
});

const CandidatesFileSchema = z.object({
  meta: z.object({ fetchedAt: z.string() }).optional(),
  newUniversities: z.array(z.object({ programmes: z.array(CandidateSchema) })).default([]),
  newProgrammes: z.array(CandidateSchema).default([]),
});

export type Resolution = { portalId: number; portal: string; mur: string | null };

export type StageResult = {
  staged: string[];
  refused: { portalId: number; reason: string }[];
  written: number;
  skipped: number;
  inData: number;
  resolutions: Resolution[];
};

export type StageOptions = {
  ids: number[];
  runDir: string; // directory holding candidates.json (the discovery run)
  atenei: readonly Ateneo[];
  websites: ReadonlyMap<string, string>;
  dataDir?: string;
  stagingDir?: string;
  dryRun: boolean;
};

async function readCandidates(
  runDir: string,
): Promise<{ byId: Map<number, Candidate>; fetchedAt: string }> {
  const file = path.join(runDir, "candidates.json");
  const parsed = CandidatesFileSchema.safeParse(JSON.parse(await readFile(file, "utf8")));
  if (!parsed.success) throw new Error(`${file} does not have the expected shape`);
  const all = [
    ...parsed.data.newUniversities.flatMap((u) => u.programmes),
    ...parsed.data.newProgrammes,
  ];
  return {
    byId: new Map(all.map((c) => [c.portalId, c])),
    fetchedAt: parsed.data.meta?.fetchedAt.slice(0, 10) ?? "an unrecorded date",
  };
}

export async function runStage(options: StageOptions): Promise<StageResult> {
  const dataDir = options.dataDir ?? DATA_DIR;
  const stagingDir = options.stagingDir ?? STAGING_DIR;
  const { byId, fetchedAt } = await readCandidates(options.runDir);
  const unknown = options.ids.filter((id) => !byId.has(id));
  if (unknown.length > 0) {
    throw new Error(`not a candidate in ${options.runDir}: ${unknown.join(", ")}`);
  }
  const candidates = options.ids.flatMap((id) => {
    const c = byId.get(id);
    return c === undefined ? [] : [c];
  });

  const ours = new Map<string, string>();
  for (const p of await loadItalyData(dataDir)) ours.set(p.institutionSlug, p.institutionName);
  const ourInstitutions = [...ours].map(([slug, name]) => ({ slug, name }));

  const resolutions = candidates.map((c): Resolution => {
    const ateneo = resolveAteneo(c.university, options.atenei);
    return {
      portalId: c.portalId,
      portal: c.university,
      mur: typeof ateneo === "object" && ateneo !== null ? ateneo.fullName : null,
    };
  });
  const { records, report } = buildUniversitalyRecords({
    candidates,
    atenei: options.atenei,
    ourInstitutions,
    websites: options.websites,
    fetchedAt,
  });
  const result: StageResult = {
    staged: report.staged,
    refused: report.refused,
    written: 0,
    skipped: 0,
    inData: 0,
    resolutions,
  };
  // One refusal stops the whole run: the owner decides, then names the ids again.
  if (report.refused.length > 0) return { ...result, staged: [] };
  if (options.dryRun) return result;

  const state = await readReviewState(stagingDir);
  const written = await writeStaged(records, {
    overwrite: false,
    stagingDir,
    dataDir,
    approved: state.approved,
  });
  const { rows, approved } = mergeReviewSheet({
    existingRows: state.rows,
    approved: state.approved,
    records,
    rewritten: written.rewritten,
    fileExists: (kind, slug) => existsSync(stageFile(kind, slug, stagingDir)),
  });
  await mkdir(stagingDir, { recursive: true });
  await writeFile(reviewFile(stagingDir), reviewCsv(rows, approved));
  return { ...result, written: written.written, skipped: written.skipped, inData: written.inData };
}

// The newest run directory (ISO day names sort by date) that holds a candidates.json.
export async function newestRun(root: string = UNIVERSITALY_DIR): Promise<string> {
  const entries = existsSync(root) ? await readdir(root, { withFileTypes: true }) : [];
  const runs = entries
    .filter((e) => e.isDirectory() && existsSync(path.join(root, e.name, "candidates.json")))
    .map((e) => e.name)
    .sort();
  const newest = runs.at(-1);
  if (newest === undefined) throw new Error(`no discovery run with a candidates.json in ${root}`);
  return path.join(root, newest);
}

export type CliOptions = { ids: number[]; run: string | null; dryRun: boolean };

const VALUE_FLAGS = ["--ids", "--run"] as const;
const SWITCHES = ["--dry-run"] as const;

// A flag without a value, an unknown flag or a repeated flag throws; --ids is required and has
// no default, so nothing is staged by accident.
export function parseArgs(args: string[]): CliOptions {
  const values = new Map<string, string>();
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i] ?? "";
    const isSwitch = SWITCHES.some((f) => f === flag);
    if (!isSwitch && !VALUE_FLAGS.some((f) => f === flag)) throw new Error(`unknown flag ${flag}`);
    if (isSwitch ? dryRun : values.has(flag)) throw new Error(`${flag} given twice`);
    if (isSwitch) {
      dryRun = true;
      continue;
    }
    const value = args[i + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${flag} needs a value`);
    values.set(flag, value);
    i++;
  }
  const rawIds = values.get("--ids");
  if (rawIds === undefined) throw new Error("--ids is required (comma separated portal ids)");
  const parts = rawIds.split(",");
  if (!parts.every((p) => /^[1-9]\d*$/.test(p) && Number.isSafeInteger(Number(p)))) {
    throw new Error("--ids must be comma separated positive integers");
  }
  const ids = parts.map(Number);
  if (new Set(ids).size !== ids.length) throw new Error("--ids names an id twice");
  return { ids, run: values.get("--run") ?? null, dryRun };
}

export function renderSummary(
  result: StageResult,
  context: { dryRun: boolean; reviewSheet: string },
): string {
  const lines = ["university resolved for each candidate (portal name -> MUR name):"];
  for (const r of result.resolutions) {
    lines.push(`  ${r.portalId}: ${r.portal} -> ${r.mur ?? "REFUSED"}`);
  }
  lines.push(
    result.staged.length === 0
      ? "staged: none"
      : `staged ${result.staged.length}:\n${result.staged.map((s) => `  ${s}`).join("\n")}`,
  );
  if (result.refused.length > 0) {
    lines.push(`REFUSED ${result.refused.length} (nothing was written):`);
    for (const r of result.refused) lines.push(`  ${r.portalId}: ${r.reason}`);
  }
  if (context.dryRun) {
    lines.push("dry run: nothing was written");
  } else {
    lines.push(
      `${result.written} written, ${result.skipped} kept (already staged, never overwritten), ${result.inData} already in data/`,
    );
    lines.push(`review sheet: ${context.reviewSheet}`);
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  const runDir = cli.run ?? (await newestRun());
  console.log(`run: ${runDir}`);
  const atenei = parseAtenei(
    await fetchText(ATENEI_URL, {
      accept: "text/csv",
      validate: (body) => {
        if (!body.includes("COD_Ateneo")) throw new Error("MUR: the university list looks wrong");
      },
    }),
  );
  const result = await runStage({
    ids: cli.ids,
    runDir,
    atenei,
    websites: await websiteCandidates(atenei),
    dryRun: cli.dryRun,
  });
  console.log(renderSummary(result, { dryRun: cli.dryRun, reviewSheet: reviewFile() }));
  if (result.refused.length > 0) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("it-stage.ts") === true) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
