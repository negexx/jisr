import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parseCsv, STAGING_DIR } from "./staging";

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
  outcome: string; // "ok" or "wrong"
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
    const wrong = sample.filter((r) => r.outcome === "wrong").length;
    return {
      batch,
      size: mine.length,
      sampleSize: sample.length,
      confirmed,
      wrong,
      pending: sample.length - confirmed - wrong,
      pass: sample.length > 0 && confirmed === sample.length && wrong === 0,
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
        `${s.batch}: ${s.size} records; sample ${s.sampleSize}: ${s.confirmed} confirmed, ${s.wrong} wrong, ${s.pending} to read -> ${s.pass ? "PASS" : "not yet"}`,
      );
    }
    if (existing.length === 0) console.log("no audit batches yet (data:audit draw)");
    return;
  }
  throw new Error("commands: draw | status");
}

if (process.argv[1]?.endsWith("audit.ts") === true) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
