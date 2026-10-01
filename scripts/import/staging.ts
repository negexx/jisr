import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { stringify } from "yaml";

export const STAGING_DIR = "data-staging";
export const DATA_DIR = "data";
export const REVIEW_FILE_NAME = "REVIEW.csv";

// A staged record has exactly the shape of a data/ record plus a `_review` block (stripped on
// promotion). Every `last_verified_at` is null, and every fact the importer could not read has an
// invalid `info_kind` placeholder, so promotion refuses it until a human has decided the value.
export type StagedRecord = {
  collection: string;
  id: string;
  data: Record<string, unknown>;
  review: ReviewRow;
  // The record's identity in its source ("ba:73208836", "uai:0597215X"), independent of the slug.
  // Slugs are built from names and can change between imports; the source id cannot.
  sourceId?: string;
};

export type ReviewRow = {
  kind: string;
  slug: string;
  name: string;
  institution: string;
  city: string;
  field: string;
  confidence: string;
  officialUrl: string;
  todo: string;
};

// Written by the importer where a human must read the source and choose a value (or an explicit
// null). It is not a valid info_kind on purpose: `data:promote` rejects the record until replaced.
export const READ_SOURCE = "TODO_read_source";

const REVIEW_COLUMNS = [
  "approved",
  "kind",
  "slug",
  "name",
  "institution",
  "city",
  "field",
  "confidence",
  "officialUrl",
  "todo",
] as const;

export function stageFile(collection: string, id: string, dir = STAGING_DIR): string {
  return path.join(dir, collection, `${id}.yaml`);
}

export function reviewFile(dir = STAGING_DIR): string {
  return path.join(dir, REVIEW_FILE_NAME);
}

export function recordKey(kind: string, slug: string): string {
  return `${kind}/${slug}`;
}

// C1 control characters (U+0080-U+009F) in imported text mean a source was decoded with the wrong
// character set; refusing them keeps mojibake out of the data.
const C1_CONTROL = /[\u0080-\u009f\ufffd]/;

export function toYaml(data: Record<string, unknown>): string {
  const yaml = stringify(data, { lineWidth: 0, nullStr: "null" });
  if (C1_CONTROL.test(yaml)) {
    throw new Error(
      "imported text contains control characters: a source was decoded with the wrong encoding",
    );
  }
  return yaml;
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function reviewCsv(rows: readonly ReviewRow[], approved: ReadonlySet<string>): string {
  const header = REVIEW_COLUMNS.join(",");
  const lines = rows.map((row) =>
    [
      approved.has(recordKey(row.kind, row.slug)) ? "y" : "",
      ...REVIEW_COLUMNS.slice(1).map((c) => row[c as keyof ReviewRow]),
    ]
      .map(csvCell)
      .join(","),
  );
  return `${[header, ...lines].join("\n")}\n`;
}

// Tolerates what spreadsheets do to a CSV: a UTF-8 BOM, `;` as the separator (French locale),
// CRLF line endings and a missing final newline.
export function parseCsv(input: string, forcedSeparator?: string): Record<string, string>[] {
  const text = input.replace(/^﻿/, "");
  const firstLine = text.split("\n", 1)[0] ?? "";
  const separator =
    forcedSeparator ?? (!firstLine.includes(",") && firstLine.includes(";") ? ";" : ",");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === separator) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  const [header, ...body] = rows;
  if (header === undefined) return [];
  return body
    .filter((r) => r.some((c) => c !== ""))
    .map((r) => Object.fromEntries(header.map((name, i) => [name.trim(), r[i] ?? ""])));
}

export const LEDGER_FILE_NAME = "PROMOTED.csv";

export function ledgerFile(dir = STAGING_DIR): string {
  return path.join(dir, LEDGER_FILE_NAME);
}

// level: how the record was verified. "human" = a person read it (their own edits, or an audited
// sample record); "audited-sample" = prepared by the assistant with code-checked quotes and covered
// by a passed random-sample audit, but not read one by one.
export type LedgerRow = {
  collection: string;
  sourceId: string;
  slug: string;
  date: string;
  level?: "human" | "audited-sample";
  batch?: string;
};

// Every promoted record's source id, appended by `data:promote`. A promoted record loses its
// `_review` block, so without this a re-import that changed its slug would stage a duplicate.
export async function readLedger(dir = STAGING_DIR): Promise<Map<string, string>> {
  const file = ledgerFile(dir);
  if (!existsSync(file)) return new Map();
  const rows = parseCsv(await readFile(file, "utf8"));
  return new Map(rows.map((r) => [`${r.collection}|${r.sourceId}`, r.slug ?? ""]));
}

export async function appendLedger(rows: readonly LedgerRow[], dir = STAGING_DIR): Promise<void> {
  if (rows.length === 0) return;
  const file = ledgerFile(dir);
  const header = "collection,sourceId,slug,date,level,batch\n";
  const lines = rows.map((r) =>
    [r.collection, r.sourceId, r.slug, r.date, r.level ?? "human", r.batch ?? ""]
      .map(csvCell)
      .join(","),
  );
  await mkdir(dir, { recursive: true });
  const existing = existsSync(file) ? await readFile(file, "utf8") : header;
  await writeFile(file, `${existing}${lines.join("\n")}\n`);
}

// collection|sourceId -> staged files carrying it (read with a regex: thousands of files).
export async function indexStagedSourceIds(
  dir: string,
): Promise<Map<string, { slug: string; file: string }>> {
  const index = new Map<string, { slug: string; file: string }>();
  if (!existsSync(dir)) return index;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const name of await readdir(path.join(dir, entry.name))) {
      if (!name.endsWith(".yaml")) continue;
      const file = path.join(dir, entry.name, name);
      const found = /^ {2}sourceId: (.+)$/m.exec(await readFile(file, "utf8"));
      const raw = found?.[1]?.trim();
      if (raw === undefined) continue;
      const sourceId = raw.replace(/^(['"])(.*)\1$/, "$2");
      index.set(`${entry.name}|${sourceId}`, { slug: name.slice(0, -".yaml".length), file });
    }
  }
  return index;
}

export type WriteResult = {
  written: number;
  skipped: number;
  inData: number;
  rewritten: Set<string>;
  // Unapproved staged files of a record whose slug changed: removed, the new file replaces them.
  removedStale: string[];
  // Approved staged files of a record whose slug changed: kept, a human decides.
  keptApprovedStale: string[];
};

function reviewBlock(record: StagedRecord): Record<string, unknown> {
  return record.sourceId === undefined
    ? { ...record.review }
    : { ...record.review, sourceId: record.sourceId };
}

// Two records of one run sharing an id (or a source id) would silently collapse into one file.
function assertUnique(records: readonly StagedRecord[]): void {
  const ids = new Set<string>();
  const sources = new Set<string>();
  for (const r of records) {
    const id = `${r.collection}/${r.id}`;
    if (ids.has(id)) throw new Error(`two imported records share the id ${id}`);
    ids.add(id);
    if (r.sourceId === undefined) continue;
    const source = `${r.collection}|${r.sourceId}`;
    if (sources.has(source))
      throw new Error(`two imported records share the source id ${r.sourceId}`);
    sources.add(source);
  }
}

// Writes staged records. Never clobbers a file a reviewer may have edited unless asked, and never
// re-stages a record that was already promoted into data/. `rewritten` lists the records whose
// staged file was replaced: any earlier approval of those no longer means anything.
export async function writeStaged(
  records: readonly StagedRecord[],
  options: {
    overwrite: boolean;
    stagingDir?: string;
    dataDir?: string;
    approved?: ReadonlySet<string>;
  },
): Promise<WriteResult> {
  const stagingDir = options.stagingDir ?? STAGING_DIR;
  const dataDir = options.dataDir ?? DATA_DIR;
  const result: WriteResult = {
    written: 0,
    skipped: 0,
    inData: 0,
    rewritten: new Set(),
    removedStale: [],
    keptApprovedStale: [],
  };
  assertUnique(records);
  const ledger = await readLedger(stagingDir);
  const staged = await indexStagedSourceIds(stagingDir);
  const approved = options.approved ?? new Set<string>();
  // Validate everything first so a bad record never leaves staging half-written.
  for (const record of records) toYaml({ ...record.data, _review: reviewBlock(record) });
  for (const record of records) {
    if (existsSync(path.join(dataDir, record.collection, `${record.id}.yaml`))) {
      result.inData++;
      continue;
    }
    const sourceKey =
      record.sourceId === undefined ? null : `${record.collection}|${record.sourceId}`;
    if (sourceKey !== null && ledger.has(sourceKey)) {
      result.inData++;
      continue;
    }
    if (sourceKey !== null) {
      const stale = staged.get(sourceKey);
      if (stale !== undefined && stale.slug !== record.id) {
        const key = recordKey(record.collection, stale.slug);
        if (approved.has(key)) {
          result.keptApprovedStale.push(key);
        } else {
          await rm(stale.file);
          result.removedStale.push(key);
        }
      }
    }
    const file = stageFile(record.collection, record.id, stagingDir);
    const existed = existsSync(file);
    if (existed && !options.overwrite) {
      result.skipped++;
      continue;
    }
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, toYaml({ ...record.data, _review: reviewBlock(record) }));
    result.written++;
    if (existed) result.rewritten.add(recordKey(record.collection, record.id));
  }
  return result;
}

export type ReviewState = {
  rows: Record<string, string>[];
  approved: Set<string>;
  warning: string | null;
};

export async function readReviewState(dir = STAGING_DIR): Promise<ReviewState> {
  const file = reviewFile(dir);
  if (!existsSync(file)) return { rows: [], approved: new Set(), warning: `${file} not found` };
  const rows = parseCsv(await readFile(file, "utf8"));
  const approved = new Set(
    rows
      .filter((r) => r.approved?.trim().toLowerCase() === "y")
      .map((r) => recordKey(r.kind ?? "", r.slug ?? "")),
  );
  const hasColumn = rows.length === 0 || rows.some((r) => r.approved !== undefined);
  const warning = hasColumn
    ? null
    : `${file} has no "approved" column: check the header and the separator (comma)`;
  return { rows, approved, warning };
}

export async function listStaged(dir = STAGING_DIR): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const file of await readdir(path.join(dir, entry.name))) {
      if (file.endsWith(".yaml")) out.push(recordKey(entry.name, file.slice(0, -".yaml".length)));
    }
  }
  return out.sort();
}

const REVIEW_FIELDS = [
  "kind",
  "slug",
  "name",
  "institution",
  "city",
  "field",
  "confidence",
  "officialUrl",
  "todo",
] as const;

export function toReviewRow(row: Record<string, string>): ReviewRow {
  return Object.fromEntries(REVIEW_FIELDS.map((c) => [c, row[c] ?? ""])) as ReviewRow;
}

// Merges freshly staged records into the review sheet. A rewritten staged file is new, unread
// content, so its earlier approval is dropped; rows whose staged file no longer exists vanish.
export function mergeReviewSheet(input: {
  existingRows: readonly Record<string, string>[];
  approved: ReadonlySet<string>;
  records: readonly StagedRecord[];
  rewritten: ReadonlySet<string>;
  fileExists: (kind: string, slug: string) => boolean;
}): { rows: ReviewRow[]; approved: Set<string> } {
  const approved = new Set(input.approved);
  for (const key of input.rewritten) approved.delete(key);
  const known = new Map(
    input.existingRows.map((r) => [recordKey(r.kind ?? "", r.slug ?? ""), toReviewRow(r)]),
  );
  for (const r of input.records) known.set(recordKey(r.review.kind, r.review.slug), r.review);
  const rows = [...known.values()]
    .filter((r) => input.fileExists(r.kind, r.slug))
    .sort((a, b) => recordKey(a.kind, a.slug).localeCompare(recordKey(b.kind, b.slug)));
  return { rows, approved };
}

export type PruneResult = { removed: string[]; keptApproved: string[] };

// Removes staged records that a source used to produce but no longer does (a programme dropped by
// a new rule, taught abroad, or gone from the register). Only records the caller says it owns, and
// only unapproved ones: an approved record is kept and reported. A prune that would delete more
// than a quarter of the source's staged records (and more than 25) is refused: an empty or
// truncated response must not wipe the review queue.
export async function pruneStaged(input: {
  owns: (sourceId: string) => boolean;
  produced: ReadonlySet<string>; // "collection|sourceId"
  approved: ReadonlySet<string>;
  stagingDir?: string;
}): Promise<PruneResult> {
  const result: PruneResult = { removed: [], keptApproved: [] };
  const index = await indexStagedSourceIds(input.stagingDir ?? STAGING_DIR);
  const doomed: { key: string; file: string }[] = [];
  let owned = 0;
  for (const [key, { slug, file }] of index) {
    const [collection, ...rest] = key.split("|");
    const sourceId = rest.join("|");
    if (collection === undefined || !input.owns(sourceId)) continue;
    owned++;
    if (input.produced.has(key)) continue;
    const id = recordKey(collection, slug);
    if (input.approved.has(id)) result.keptApproved.push(id);
    else doomed.push({ key: id, file });
  }
  if (doomed.length > 25 && doomed.length > owned * 0.25) {
    throw new Error(
      `refusing to prune ${doomed.length} of ${owned} staged records: the source looks incomplete (nothing was removed)`,
    );
  }
  for (const { key, file } of doomed) {
    await rm(file);
    result.removed.push(key);
  }
  return result;
}

// A campus or provider unit (source id with "@town" or a provider/academy prefix) that no staged
// programme points to any more is clutter in the review queue. Unapproved ones are removed.
export async function pruneOrphanUnits(input: {
  approved: ReadonlySet<string>;
  stagingDir?: string;
}): Promise<string[]> {
  const dir = input.stagingDir ?? STAGING_DIR;
  const programmesDir = path.join(dir, "programs");
  const used = new Set<string>();
  if (existsSync(programmesDir)) {
    for (const name of await readdir(programmesDir)) {
      const found = /^institution: (.+)$/m.exec(
        await readFile(path.join(programmesDir, name), "utf8"),
      );
      if (found?.[1] !== undefined) used.add(found[1].trim());
    }
  }
  const index = await indexStagedSourceIds(dir);
  const removed: string[] = [];
  for (const [key, { slug, file }] of index) {
    const [collection, ...rest] = key.split("|");
    const sourceId = rest.join("|");
    const isUnit = /@|^(ba-provider|daad-academy|rio-unit):/.test(sourceId);
    if (collection !== "institutions" || !isUnit || used.has(slug)) continue;
    if (input.approved.has(recordKey(collection, slug))) continue;
    await rm(file);
    removed.push(recordKey(collection, slug));
  }
  return removed;
}

// Two sources can produce the same record (a campus unit): keep the first only when both carry the
// same source id; anything else is a collision that must not silently drop a record.
export function dedupeRecords(records: readonly StagedRecord[]): StagedRecord[] {
  const seen = new Map<string, StagedRecord>();
  const unique: StagedRecord[] = [];
  for (const r of records) {
    const key = `${r.collection}/${r.id}`;
    const first = seen.get(key);
    if (first === undefined) {
      seen.set(key, r);
      unique.push(r);
    } else if (first.sourceId !== r.sourceId) {
      throw new Error(
        `two sources produce ${key} with different source ids (${first.sourceId ?? "none"} / ${r.sourceId ?? "none"})`,
      );
    }
  }
  return unique;
}
