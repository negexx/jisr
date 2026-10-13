import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";

import { OWNS } from "./owners";
import { importDaad } from "./sources/daad";
import { importGermany } from "./sources/germany";
import { importInstitutions } from "./sources/institutions";
import { importItaly } from "./sources/mur";
import { importFrance } from "./sources/parcoursup";
import { importNetherlands } from "./sources/rio";
import { importSpain } from "./sources/ruct";
import { importHungary } from "./sources/studyfinder";
import type { StagedRecord } from "./staging";
import {
  dedupeRecords,
  mergeReviewSheet,
  pruneOrphanUnits,
  pruneStaged,
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
  daad: importDaad,
  hungary: importHungary,
  italy: importItaly,
  spain: importSpain,
};

async function main(argv: readonly string[]): Promise<void> {
  const overwrite = argv.includes("--overwrite");
  if (argv.includes("--refresh")) process.env.JISR_IMPORT_REFRESH = "1";
  const names = argv.filter((a) => !a.startsWith("--"));
  const selected = names.length === 0 || names.includes("all") ? Object.keys(SOURCES) : names;

  const records: StagedRecord[] = [];
  const produced = new Map<string, Set<string>>();
  for (const name of selected) {
    const run = SOURCES[name];
    if (run === undefined) {
      throw new Error(`unknown source "${name}" (known: ${Object.keys(SOURCES).join(", ")})`);
    }
    const staged = await run();
    produced.set(
      name,
      new Set(
        staged.flatMap((r) => (r.sourceId === undefined ? [] : [`${r.collection}|${r.sourceId}`])),
      ),
    );
    console.log(`${name}: ${staged.length} records`);
    records.push(...staged);
  }

  const state = await readReviewState();
  const unique = dedupeRecords(records);
  const result = await writeStaged(unique, { overwrite, approved: state.approved });
  const pruned = { removed: [] as string[], keptApproved: [] as string[] };
  for (const name of selected) {
    const owns = OWNS[name];
    if (owns === undefined) continue;
    const r = await pruneStaged({
      owns,
      produced: produced.get(name) ?? new Set(),
      approved: state.approved,
    });
    pruned.removed.push(...r.removed);
    pruned.keptApproved.push(...r.keptApproved);
  }
  if (pruned.removed.length > 0) {
    console.log(
      `${pruned.removed.length} staged record(s) the source no longer produces were removed`,
    );
  }
  for (const key of pruned.keptApproved) {
    console.warn(`WARN ${key} is approved but its source no longer produces it: check it`);
  }
  const orphans = await pruneOrphanUnits({ approved: state.approved });
  if (orphans.length > 0)
    console.log(`${orphans.length} institution unit(s) without programmes were removed`);
  const { rows, approved } = mergeReviewSheet({
    existingRows: state.rows,
    approved: state.approved,
    records: unique,
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
