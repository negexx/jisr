import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { parseCsv, STAGING_DIR, stageFile } from "./staging";

// Records prepared by the assistant are verified by code (quotes re-checked against the pages), but
// no person read them one by one. The audit gate closes that gap statistically: a random sample of
// each batch is read by a human, and the batch can only be promoted if every sampled record is
// confirmed correct. The sample is drawn with a seed the assistant cannot know in advance.
export const AUDIT_FILE = "AUDIT.csv";
export const SAMPLE_FRACTION = 0.1;
export const SAMPLE_MINIMUM = 10;

export type AuditRow = {
  key: string; // collection/slug
  batch: string;
  inSample: boolean;
  audited: string; // "y" once a human has read the record against its sources
  outcome: string; // "ok" or "wrong"; "waived" = the owner passed it without reading (a preview)
  notes: string;
};

export function sampleSize(batchSize: number): number {
  return Math.min(batchSize, Math.max(SAMPLE_MINIMUM, Math.ceil(batchSize * SAMPLE_FRACTION)));
}

// Deterministic for a given seed, unpredictable without it.
export function drawSample(keys: readonly string[], seed: string): Set<string> {
  const ranked = [...keys].sort((a, b) => {
    const ha = createHash("sha1").update(`${seed}|${a}`).digest("hex");
    const hb = createHash("sha1").update(`${seed}|${b}`).digest("hex");
    return ha.localeCompare(hb);
  });
  return new Set(ranked.slice(0, sampleSize(keys.length)));
}

export function drawBatch(input: {
  preparedKeys: readonly string[];
  existing: readonly AuditRow[];
  seed: string;
  batchIndex: number;
}): AuditRow[] {
  const known = new Set(input.existing.map((r) => r.key));
  const fresh = input.preparedKeys.filter((k) => !known.has(k)).sort();
  if (fresh.length === 0) return [];
  const sample = drawSample(fresh, input.seed);
  const batch = `b${input.batchIndex}-${input.seed}`;
  return fresh.map((key) => ({
    key,
    batch,
    inSample: sample.has(key),
    audited: "",
    outcome: "",
    notes: "",
  }));
}

export type BatchStatus = {
  batch: string;
  size: number;
  sampleSize: number;
  confirmed: number;
  waived: number; // sampled rows the owner passed without reading them (outcome "waived")
  wrong: number;
  pending: number;
  pass: boolean;
};

export function batchStatuses(rows: readonly AuditRow[]): BatchStatus[] {
  const batches = [...new Set(rows.map((r) => r.batch))];
  return batches.map((batch) => {
    const mine = rows.filter((r) => r.batch === batch);
    const sample = mine.filter((r) => r.inSample);
    const confirmed = sample.filter((r) => r.audited === "y" && r.outcome === "ok").length;
    const waived = sample.filter((r) => r.audited === "y" && r.outcome === "waived").length;
    const wrong = sample.filter((r) => r.outcome === "wrong").length;
    return {
      batch,
      size: mine.length,
      sampleSize: sample.length,
      confirmed,
      waived,
      wrong,
      pending: sample.length - confirmed - waived - wrong,
      pass: sample.length > 0 && confirmed + waived === sample.length && wrong === 0,
    };
  });
}

export function auditCsv(rows: readonly AuditRow[]): string {
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
  const header = "key,batch,inSample,audited,outcome,notes";
  const lines = rows.map((r) =>
    [r.key, r.batch, r.inSample ? "y" : "", r.audited, r.outcome, r.notes].map(cell).join(","),
  );
  return `${[header, ...lines].join("\n")}\n`;
}

export function parseAudit(text: string): AuditRow[] {
  return parseCsv(text).map((r) => ({
    key: r.key ?? "",
    batch: r.batch ?? "",
    inSample: (r.inSample ?? "").trim().toLowerCase() === "y",
    audited: (r.audited ?? "").trim().toLowerCase(),
    outcome: (r.outcome ?? "").trim().toLowerCase(),
    notes: r.notes ?? "",
  }));
}

export async function readAudit(dir = STAGING_DIR): Promise<AuditRow[]> {
  const file = path.join(dir, AUDIT_FILE);
  return existsSync(file) ? parseAudit(await readFile(file, "utf8")) : [];
}

// Every staged record whose _review says the assistant prepared it.
export async function findPrepared(dir = STAGING_DIR): Promise<string[]> {
  const keys: string[] = [];
  if (!existsSync(dir)) return keys;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "proposals") continue;
    for (const name of await readdir(path.join(dir, entry.name))) {
      if (!name.endsWith(".yaml")) continue;
      const text = await readFile(path.join(dir, entry.name, name), "utf8");
      if (/^ {2}preparedBy: assistant$/m.test(text))
        keys.push(`${entry.name}/${name.slice(0, -".yaml".length)}`);
    }
  }
  return keys.sort();
}

type Loose = Record<string, unknown>;
const asObject = (v: unknown): Loose =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Loose) : {};
const show = (v: unknown): string => (typeof v === "string" ? v : JSON.stringify(v));

const PROSE_CLAIMS: readonly string[] = ["eligibility", "level", "howToApply"];

// One readable page per sampled record: what is claimed, the exact quote and page behind it, and
// the preparer's own caveats, so the reader checks the quotes instead of reading raw YAML.
export function sampleSheet(
  entries: readonly { key: string; record: unknown; row: AuditRow }[],
): string {
  const out = [
    "# Audit sample",
    "",
    "For each record: open the link, confirm the quote is there and that it supports the value (right programme, right applicant group, right year). Then set `audited = y` and `outcome = ok` (or `wrong` + a note) in `AUDIT.csv`.",
    "",
  ];
  for (const { key, record, row } of entries) {
    const r = asObject(record);
    const review = asObject(r._review);
    const evidence = Array.isArray(review.evidence) ? review.evidence.map(asObject) : [];
    out.push(`## ${key}  _(batch ${row.batch})_`, "");
    const name = show(r.name ?? review.name ?? "");
    if (name !== "")
      out.push(`**${name}**${review.institution ? `, ${show(review.institution)}` : ""}`, "");
    for (const fact of [
      "durationYears",
      "teachingLanguages",
      "tuition",
      "intakes",
      "applicationChannel",
      "documents",
      "type",
      "website",
      "support",
      "deadline",
    ]) {
      const field = r[fact];
      const wrapped = "value" in asObject(field);
      const value = wrapped ? asObject(field).value : field;
      if (value === undefined || value === null) continue;
      const backing = evidence.filter((x) => x.fact === fact);
      // A fact with no quote is not backed by this sheet: in a revision it is what data/ already had.
      const label = !wrapped
        ? ""
        : ` (${show(asObject(field).info_kind)}; source ${show(asObject(field).source)})${
            backing.length > 0
              ? ""
              : review.revises === true
                ? " (unchanged: already in data/)"
                : " (no evidence recorded)"
          }`;
      out.push(`- **${fact}**: \`${show(value)}\`${label}`);
      for (const e of backing) {
        out.push(`  - "${show(e.quote)}" — ${show(e.url)}`);
      }
    }
    const rules = Array.isArray(asObject(r.requirements).rules)
      ? (asObject(r.requirements).rules as unknown[]).map(asObject)
      : [];
    for (const rule of rules) {
      const { id, source, info_kind: _kind, ...detail } = rule;
      out.push(`- **requirement ${show(id)}**: \`${show(detail)}\``);
      for (const e of evidence.filter((x) => x.fact === `requirements.${show(id)}`)) {
        out.push(`  - "${show(e.quote)}" — ${show(e.url)}`);
      }
    }
    // a scholarship's claims that are not a fact block: who it is for, the level, how to apply
    for (const e of evidence.filter((x) => PROSE_CLAIMS.includes(show(x.fact)))) {
      out.push(`- **${show(e.fact)}**: "${show(e.quote)}" — ${show(e.url)}`);
    }
    for (const e of evidence.filter((x) => x.fact === undefined)) {
      out.push(`- evidence: "${show(e.quote)}" — ${show(e.url)}`);
    }
    if (review.officialUrl) out.push(`- **page**: ${show(review.officialUrl)}`);
    if (review.notes) out.push("", `> Preparer's caveats: ${show(review.notes)}`);
    if (Array.isArray(review.rejected) && review.rejected.length > 0)
      out.push(`> Not accepted by the verifier: ${review.rejected.map(show).join("; ")}`);
    out.push("");
  }
  return `${out.join("\n")}\n`;
}

async function main(argv: readonly string[]): Promise<void> {
  const [command] = argv;
  const existing = await readAudit();
  if (command === "draw") {
    const rows = drawBatch({
      preparedKeys: await findPrepared(),
      existing,
      seed: randomBytes(3).toString("hex"),
      batchIndex: new Set(existing.map((r) => r.batch)).size + 1,
    });
    if (rows.length === 0) {
      console.log("nothing new to draw: every prepared record is already in an audit batch");
      return;
    }
    await writeFile(path.join(STAGING_DIR, AUDIT_FILE), auditCsv([...existing, ...rows]));
    console.log(
      `drew batch ${rows[0]?.batch}: ${rows.length} records, ${rows.filter((r) => r.inSample).length} in the sample`,
    );
    console.log(
      `Read each sampled record (inSample = y) against its quoted sources, then fill in ${AUDIT_FILE}: audited = y, outcome = ok or wrong.`,
    );
    return;
  }
  if (command === "status") {
    for (const s of batchStatuses(existing)) {
      console.log(
        `${s.batch}: ${s.size} records; sample ${s.sampleSize}: ${s.confirmed} confirmed, ${s.waived} waived unread, ${s.wrong} wrong, ${s.pending} to read -> ${s.pass ? "PASS" : "not yet"}`,
      );
    }
    if (existing.length === 0) console.log("no audit batches yet (data:audit draw)");
    return;
  }
  if (command === "sheet") {
    const entries = [];
    for (const row of existing.filter((r) => r.inSample && r.audited !== "y")) {
      const [collection, id] = row.key.split("/");
      if (collection === undefined || id === undefined) continue;
      const file = stageFile(collection, id, STAGING_DIR);
      if (!existsSync(file)) continue;
      entries.push({ key: row.key, record: parse(await readFile(file, "utf8")), row });
    }
    const target = path.join(STAGING_DIR, "AUDIT-SAMPLE.md");
    await writeFile(target, sampleSheet(entries));
    console.log(`wrote ${target}: ${entries.length} record(s) to read`);
    return;
  }
  throw new Error("commands: draw | status | sheet");
}

if (process.argv[1]?.endsWith("audit.ts") === true) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
