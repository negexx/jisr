import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";

import { importGermany } from "./sources/germany";
import { importInstitutions } from "./sources/institutions";
import { importFrance } from "./sources/parcoursup";
import { importNetherlands } from "./sources/rio";
import type { StagedRecord } from "./staging";
import {
  mergeReviewSheet,
  readReviewState,
  reviewCsv,
  reviewFile,
  STAGING_DIR,
  stageFile,
  writeStaged,
} from "./staging";

const SOURCES: Record<string, () => Promise<StagedRecord[]>> = {
  france: importFrance,
  institutions: importInstitutions,
  netherlands: importNetherlands,
  germany: importGermany,
};

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

  const state = await readReviewState();
  const result = await writeStaged(records, { overwrite, approved: state.approved });
  const { rows, approved } = mergeReviewSheet({
    existingRows: state.rows,
    approved: state.approved,
    records,
    rewritten: result.rewritten,
    fileExists: (kind, slug) => existsSync(stageFile(kind, slug)),
  });

  await mkdir(STAGING_DIR, { recursive: true });
  await writeFile(reviewFile(), reviewCsv(rows, approved));
  console.log(
    `staged: ${result.written} written, ${result.skipped} kept (already staged; --overwrite replaces them and clears their approval), ${result.inData} already in data/`,
  );
  if (result.removedStale.length > 0) {
    console.log(
      `${result.removedStale.length} superseded staged file(s) removed (their record's slug changed)`,
    );
  }
  for (const key of result.keptApprovedStale) {
    console.warn(`WARN ${key} is approved but its record now has another slug: check both files`);
  }
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
