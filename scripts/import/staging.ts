import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
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

export type WriteResult = {
  written: number;
  skipped: number;
  inData: number;
  rewritten: Set<string>;
};

// Writes staged records. Never clobbers a file a reviewer may have edited unless asked, and never
// re-stages a record that was already promoted into data/. `rewritten` lists the records whose
// staged file was replaced: any earlier approval of those no longer means anything.
export async function writeStaged(
  records: readonly StagedRecord[],
  options: { overwrite: boolean; stagingDir?: string; dataDir?: string },
): Promise<WriteResult> {
  const stagingDir = options.stagingDir ?? STAGING_DIR;
  const dataDir = options.dataDir ?? DATA_DIR;
  const result: WriteResult = { written: 0, skipped: 0, inData: 0, rewritten: new Set() };
  // Validate everything first so a bad record never leaves staging half-written.
  for (const record of records) toYaml({ ...record.data, _review: record.review });
  for (const record of records) {
    if (existsSync(path.join(dataDir, record.collection, `${record.id}.yaml`))) {
      result.inData++;
      continue;
    }
    const file = stageFile(record.collection, record.id, stagingDir);
    const existed = existsSync(file);
    if (existed && !options.overwrite) {
      result.skipped++;
      continue;
    }
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, toYaml({ ...record.data, _review: record.review }));
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
