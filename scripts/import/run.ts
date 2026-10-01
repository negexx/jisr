import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";

import { importInstitutions } from "./sources/institutions";
import { importFrance } from "./sources/parcoursup";
import type { ReviewRow, StagedRecord } from "./staging";
import {
  readReviewState,
  recordKey,
  reviewCsv,
  reviewFile,
  STAGING_DIR,
  stageFile,
  writeStaged,
} from "./staging";

const SOURCES: Record<string, () => Promise<StagedRecord[]>> = {
  france: importFrance,
  institutions: importInstitutions,
};

const COLUMNS = [
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

function toReviewRow(row: Record<string, string>): ReviewRow {
  return Object.fromEntries(COLUMNS.map((c) => [c, row[c] ?? ""])) as ReviewRow;
}

async function main(argv: readonly string[]): Promise<void> {
  const overwrite = argv.includes("--overwrite");
  if (argv.includes("--refresh")) process.env.JISR_IMPORT_REFRESH = "1";
  const names = argv.filter((a) => !a.startsWith("--"));
  const selected = names.length === 0 || names.includes("all") ? Object.keys(SOURCES) : names;

  const records: StagedRecord[] = [];
  for (const name of selected) {
    const run = SOURCES[name];
    if (run === undefined) {
      throw new Error(`unknown source "${name}" (known: ${Object.keys(SOURCES).join(", ")})`);
    }
    const staged = await run();
    console.log(`${name}: ${staged.length} records`);
    records.push(...staged);
  }

  const result = await writeStaged(records, { overwrite });
  const { rows, approved } = await readReviewState();
  // An approval belongs to the file the reviewer read. A rewritten file is new, unread content.
  for (const key of result.rewritten) approved.delete(key);

  const known = new Map(rows.map((r) => [recordKey(r.kind ?? "", r.slug ?? ""), toReviewRow(r)]));
  for (const r of records) known.set(recordKey(r.review.kind, r.review.slug), r.review);
  const merged = [...known.values()]
    .filter((r) => existsSync(stageFile(r.kind, r.slug)))
    .sort((a, b) => recordKey(a.kind, a.slug).localeCompare(recordKey(b.kind, b.slug)));

  await mkdir(STAGING_DIR, { recursive: true });
  await writeFile(reviewFile(), reviewCsv(merged, approved));
  console.log(
    `staged: ${result.written} written, ${result.skipped} kept (already staged; --overwrite replaces them and clears their approval), ${result.inData} already in data/`,
  );
  if (result.rewritten.size > 0) {
    console.log(
      `${result.rewritten.size} staged file(s) were replaced; their approval was cleared`,
    );
  }
  console.log(`review sheet: ${reviewFile()}`);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
