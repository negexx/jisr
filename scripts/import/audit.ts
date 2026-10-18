import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { minorUnitDigits } from "@/lib/format";

import { DATA_DIR, parseCsv, STAGING_DIR, stageFile } from "./staging";

type Loose = Record<string, unknown>;
const asObject = (v: unknown): Loose =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Loose) : {};
const show = (v: unknown): string => (typeof v === "string" ? v : JSON.stringify(v));

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

// Scholarships are shown to students as facts about money and eligibility, and there are few of
// them: every one is read by a human, whatever the size of its batch.
// Official cost profiles (country and city) are figures a model quoted from government pages, so
// they get the same treatment; the parked Numbeo ones keep the normal 10% sample.
const OFFICIAL_COST_PROFILE = /^cost-profiles\/[^/]+-official$/;
const ALWAYS_SAMPLED = new RegExp(`^scholarships/|${OFFICIAL_COST_PROFILE.source}`);
// ... and none of them can be waived: the owner can pass a programme preview unread, never money
// and eligibility facts.
export const isAlwaysSampled = (key: string): boolean => ALWAYS_SAMPLED.test(key);

export function sampleSize(batchSize: number): number {
  return Math.min(batchSize, Math.max(SAMPLE_MINIMUM, Math.ceil(batchSize * SAMPLE_FRACTION)));
}

// Owner decision 2026-10-09: records enriched by data:national from one national page all carry the
// same quotes, so reading 10% of them is the same page read again and again. A batch of more than
// 12 whose every record has the same evidence log is sampled at 12.
export const IDENTICAL_EVIDENCE_SAMPLE = 12;

const evidenceLog = (record: unknown): Loose[] => {
  const evidence = asObject(asObject(record)._review).evidence;
  return Array.isArray(evidence) ? evidence.map(asObject) : [];
};

// The evidence of a record plus, for each fact it names, the value and info_kind the record holds:
// the same quotes cannot stand for two different values. The source key is left out on purpose
// (it is numbered per record).
const evidenceKeys = (record: unknown): string[] => {
  const log = evidenceLog(record);
  const quotes = log.map((entry) => JSON.stringify([entry.fact, entry.url, entry.quote]));
  const facts = [...new Set(log.map((entry) => show(entry.fact)))].map((fact) => {
    const field = asObject(record)[fact];
    const wrapped = "value" in asObject(field);
    return JSON.stringify([
      fact,
      wrapped ? asObject(field).value : field,
      wrapped ? asObject(field).info_kind : undefined,
    ]);
  });
  return [...new Set([...quotes, ...facts])].sort();
};

// True when there are at least two records and every one has a non-empty evidence log made of the
// same set of fact/url/quote triples (order does not matter) and holds the same value and info_kind
// for every fact the log names.
export function isIdenticalEvidenceBatch(records: readonly unknown[]): boolean {
  if (records.length < 2) return false;
  if (records.some((record) => evidenceLog(record).length === 0)) return false;
  const [first, ...rest] = records.map(evidenceKeys);
  if (first === undefined) return false;
  const reference = JSON.stringify(first);
  return rest.every((keys) => JSON.stringify(keys) === reference);
}

// The shared triples of an identical-evidence batch, in a stable order.
export function sharedEvidence(
  records: readonly unknown[],
): { fact: string; url: string; quote: string }[] {
  const [first] = records;
  const entries = Array.isArray(asObject(asObject(first)._review).evidence)
    ? (asObject(asObject(first)._review).evidence as unknown[]).map(asObject)
    : [];
  const seen = new Set<string>();
  const out: { fact: string; url: string; quote: string }[] = [];
  for (const e of entries) {
    const triple = { fact: show(e.fact), url: show(e.url), quote: show(e.quote) };
    const id = JSON.stringify(triple);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(triple);
  }
  return out;
}

// Deterministic for a given seed, unpredictable without it.
export function drawSample(
  keys: readonly string[],
  seed: string,
  size = sampleSize(keys.length),
): Set<string> {
  const ranked = [...keys].sort((a, b) => {
    const ha = createHash("sha1").update(`${seed}|${a}`).digest("hex");
    const hb = createHash("sha1").update(`${seed}|${b}`).digest("hex");
    return ha.localeCompare(hb);
  });
  return new Set(ranked.slice(0, size));
}

export function drawBatch(input: {
  preparedKeys: readonly string[];
  // staged record per key; without it (or with a record missing) the ordinary 10% rule applies
  records?: ReadonlyMap<string, unknown>;
  existing: readonly AuditRow[];
  seed: string;
  batchIndex: number;
}): AuditRow[] {
  const known = new Set(input.existing.map((r) => r.key));
  const fresh = input.preparedKeys.filter((k) => !known.has(k)).sort();
  if (fresh.length === 0) return [];
  const freshRecords = fresh.map((k) => input.records?.get(k));
  const identical =
    fresh.length > IDENTICAL_EVIDENCE_SAMPLE &&
    !fresh.some((k) => ALWAYS_SAMPLED.test(k)) &&
    freshRecords.every((r) => r !== undefined) &&
    isIdenticalEvidenceBatch(freshRecords);
  const sample = drawSample(fresh, input.seed, identical ? IDENTICAL_EVIDENCE_SAMPLE : undefined);
  const batch = `b${input.batchIndex}-${input.seed}`;
  return fresh.map((key) => ({
    key,
    batch,
    inSample: sample.has(key) || ALWAYS_SAMPLED.test(key),
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
    // a waived scholarship counts as still to read
    const waived = sample.filter(
      (r) => r.audited === "y" && r.outcome === "waived" && !ALWAYS_SAMPLED.test(r.key),
    ).length;
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

// Reopening records for a new audit: their rows are removed so the next draw puts them in a fresh
// batch, because an earlier passed batch must not clear content that changed since.
export async function dropAuditRows(
  keys: ReadonlySet<string>,
  dir = STAGING_DIR,
): Promise<string[]> {
  const rows = await readAudit(dir);
  const dropped = rows.filter((row) => keys.has(row.key)).map((row) => row.key);
  if (dropped.length > 0)
    await writeFile(path.join(dir, AUDIT_FILE), auditCsv(rows.filter((row) => !keys.has(row.key))));
  return dropped;
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

const PROSE_CLAIMS: readonly string[] = ["eligibility", "level", "howToApply"];

// Staged money is integer minor units; the owner compares against Numbeo's figures in major units.
function majorRange(value: Loose): string {
  const { min, max, currency, per } = value;
  if (typeof min !== "number" || typeof max !== "number" || typeof currency !== "string")
    return show(value);
  const digits = minorUnitDigits(currency);
  const numbers = new Intl.NumberFormat("en", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const major = (minor: number) => numbers.format(minor / 10 ** digits);
  return `${major(min)} to ${major(max)} ${currency} per ${show(per)}`;
}

// One readable page per sampled record: what is claimed, the exact quote and page behind it, and
// the preparer's own caveats, so the reader checks the quotes instead of reading raw YAML.
export function sampleSheet(
  entries: readonly { key: string; record: unknown; row: AuditRow }[],
  identicalBatches: ReadonlyMap<
    string,
    {
      size: number;
      evidence: readonly { fact: string; url: string; quote: string }[];
      composition?: string;
    }
  > = new Map(),
): string {
  const out = [
    "# Audit sample",
    "",
    "For each record: open the link, confirm the quote is there and that it supports the value (right programme, right applicant group, right year). Then set `audited = y` and `outcome = ok` (or `wrong` + a note) in `AUDIT.csv`.",
    "",
  ];
  const sheetBatches = [...new Set(entries.map((e) => e.row.batch))];
  for (const batch of sheetBatches) {
    const shared = identicalBatches.get(batch);
    if (shared === undefined) continue;
    out.push(
      `## Batch ${batch}: identical national evidence: sample of ${IDENTICAL_EVIDENCE_SAMPLE} of ${shared.size}; the national page is read once`,
      "",
      ...(shared.composition === undefined ? [] : [shared.composition, ""]),
      "Every record of this batch carries the evidence below. Read it once, then check that each sampled record below is a programme this evidence applies to.",
      "",
    );
    for (const e of shared.evidence) out.push(`- **${e.fact}**: "${e.quote}" — ${e.url}`);
    out.push("");
  }
  for (const { key, record, row } of entries) {
    const r = asObject(record);
    const review = asObject(r._review);
    const evidence = Array.isArray(review.evidence) ? review.evidence.map(asObject) : [];
    out.push(`## ${key}  _(batch ${row.batch})_`, "");
    const name = show(r.name ?? review.name ?? "");
    if (name !== "")
      out.push(`**${name}**${review.institution ? `, ${show(review.institution)}` : ""}`, "");
    if (key.startsWith("scholarships/")) {
      const list = (v: unknown, whenEmpty: string): string =>
        Array.isArray(v) && v.length > 0 ? `\`${v.map(show).join(", ")}\`` : whenEmpty;
      out.push(
        `- **destinations**: ${list(r.destinations, "(none)")}`,
        `- **eligibleNationalities**: ${list(r.eligibleNationalities, "(any international applicant)")}`,
        `- **fields**: ${list(r.fields, "ALL FIELDS")}`,
        `- **institutions**: ${list(r.institutions, "ALL INSTITUTIONS of the destination")}`,
      );
      for (const prose of ["summary", "howToApply"]) {
        const text = asObject(r[prose]);
        for (const locale of ["fr", "en", "ar"]) {
          const entry = asObject(text[locale]);
          if (typeof entry.text === "string")
            out.push(`- **${prose}** (${locale}, ${show(entry.status)}): ${entry.text}`);
        }
      }
    }
    if (key.startsWith("scholarships/")) {
      let host = "(no official URL)";
      try {
        host = new URL(show(r.officialUrl)).host;
      } catch {
        // an unreadable URL is shown as missing
      }
      out.push(
        `- **provider site**: ${host}. Confirm: this is the provider's own site.`,
        "- **deadline check**: Confirm: this is the application deadline (not opening or results), for international/non-EU applicants, and this year's round.",
        "- **eligibility check**: Confirm: no exclusion (not entitled, only EU, apply ... instead) and Moroccan applicants are covered.",
        "- **support check**: Confirm: amount for Bachelor students, fixed not a ceiling, right period and currency.",
        "- **level check**: Confirm: the scholarship itself is for starting or doing a Bachelor, not for finishing one and moving on to a Master. If the quote lists both Bachelor and Master, confirm the scheme is open to Bachelor students and not only to Bachelor graduates.",
      );
      for (const e of evidence.filter((x) => show(x.fact).startsWith("nationality:"))) {
        out.push(
          `- **eligibleNationalities ${show(e.fact).slice("nationality:".length)}** named by: "${show(e.quote)}" — ${show(e.url)}`,
        );
      }
    }
    if (key.startsWith("cost-profiles/")) {
      const official = OFFICIAL_COST_PROFILE.test(key);
      for (const [lineName, rawLine] of Object.entries(asObject(r.lines))) {
        const costLine = asObject(rawLine);
        const value = asObject(costLine.value);
        out.push(
          `- **${lineName}**: \`${majorRange(value)}\` (${show(costLine.info_kind)}; source ${show(costLine.source)})`,
        );
        for (const e of evidence.filter((x) => x.fact === `lines.${lineName}`)) {
          // Numbeo's food basket joins its rows with "; ": one line per row. An official quote is
          // printed whole, so the owner reads it as the page words it.
          const parts = official ? [show(e.quote)] : show(e.quote).split("; ");
          for (const part of parts) out.push(`  - "${part}" — ${show(e.url)}`);
        }
        // The quote that dates an estimate (its own quote states no year): read it with the figure.
        for (const e of evidence.filter((x) => x.fact === `lines.${lineName}.date`))
          out.push(`  - date: "${show(e.quote)}" — ${show(e.url)}`);
        const basis = asObject(asObject(costLine.basis).en);
        if (typeof basis.text === "string") out.push(`  - formula: ${basis.text}`);
      }
      const [firstSource] = Object.values(asObject(r.sources));
      const pageUrl = asObject(firstSource).url;
      if (pageUrl !== undefined) out.push(`- **page**: ${show(pageUrl)}`);
      out.push(
        official
          ? "- **page check**: Confirm: the quote is on the official page and the number matches"
          : "- **page check**: Confirm: this is the city's page (right city, right currency, right date).",
      );
    }
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
    if (Array.isArray(review.droppedQuotes) && review.droppedQuotes.length > 0)
      out.push(
        `> Evidence quotes that could not be found on the page: ${review.droppedQuotes.map(show).join("; ")}`,
      );
    out.push("");
  }
  return `${out.join("\n")}\n`;
}

async function readStaged(key: string): Promise<unknown> {
  const [collection, id] = key.split("/");
  if (collection === undefined || id === undefined) return undefined;
  const file = stageFile(collection, id, STAGING_DIR);
  return existsSync(file) ? parse(await readFile(file, "utf8")) : undefined;
}

async function main(argv: readonly string[]): Promise<void> {
  const [command] = argv;
  const existing = await readAudit();
  if (command === "draw") {
    const preparedKeys = await findPrepared();
    const known = new Set(existing.map((r) => r.key));
    const records = new Map<string, unknown>();
    for (const key of preparedKeys.filter((k) => !known.has(k)))
      records.set(key, await readStaged(key));
    const rows = drawBatch({
      preparedKeys,
      records,
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
    // an identical-evidence batch is recognised from every record of the batch still in staging
    const identicalBatches = new Map<
      string,
      {
        size: number;
        evidence: { fact: string; url: string; quote: string }[];
        composition: string;
      }
    >();
    // Loaded here, not at the top: fr-calendar reaches promote.ts, which imports this file.
    const { batchComposition, readInstitutionTypes } = await import("./audit-composition");
    const institutionTypes = await readInstitutionTypes(DATA_DIR);
    for (const batch of new Set(entries.map((e) => e.row.batch))) {
      const members = existing.filter((r) => r.batch === batch);
      const records = await Promise.all(members.map((r) => readStaged(r.key)));
      const sampled = members.filter((r) => r.inSample).length;
      if (
        members.length > IDENTICAL_EVIDENCE_SAMPLE &&
        sampled === IDENTICAL_EVIDENCE_SAMPLE &&
        records.every((r) => r !== undefined) &&
        isIdenticalEvidenceBatch(records)
      )
        identicalBatches.set(batch, {
          size: members.length,
          evidence: sharedEvidence(records),
          composition: batchComposition(records, institutionTypes),
        });
    }
    const target = path.join(STAGING_DIR, "AUDIT-SAMPLE.md");
    await writeFile(target, sampleSheet(entries, identicalBatches));
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
