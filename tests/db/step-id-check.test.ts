import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { CHECKLIST_STEP_IDS } from "@/domain/types";

const MIGRATIONS_DIR = resolve(process.cwd(), "drizzle");
const CONSTRAINT = "checklist_progress_step_id_check";

// The effective constraint is the last definition in journal order: a later migration that
// re-creates it supersedes the first one.
function constraintLiterals(): string[] {
  const journal: { entries: { tag: string }[] } = JSON.parse(
    readFileSync(resolve(MIGRATIONS_DIR, "meta", "_journal.json"), "utf8"),
  );
  const definition = new RegExp(
    `CONSTRAINT "${CONSTRAINT}" CHECK \\([^)]*? in \\(([^)]*)\\)\\)`,
    "g",
  );
  let last: string | undefined;
  for (const { tag } of journal.entries) {
    const sql = readFileSync(resolve(MIGRATIONS_DIR, `${tag}.sql`), "utf8");
    for (const match of sql.matchAll(definition)) last = match[1];
  }
  if (last === undefined) throw new Error(`${CONSTRAINT} not found in ${MIGRATIONS_DIR}`);
  return [...last.matchAll(/'([^']*)'/g)].map((literal) => literal[1] ?? "");
}

describe("checklist_progress.step_id CHECK constraint", () => {
  it("lists exactly CHECKLIST_STEP_IDS, in order, in the committed migration", () => {
    expect(constraintLiterals()).toEqual([...CHECKLIST_STEP_IDS]);
  });
});
