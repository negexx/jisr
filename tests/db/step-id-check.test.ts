import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { CHECKLIST_STEP_IDS } from "@/domain/types";

const MIGRATIONS_DIR = resolve(process.cwd(), "drizzle");
const CONSTRAINT = "checklist_progress_step_id_check";

function constraintLiterals(): string[] {
  const sql = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .map((file) => readFileSync(resolve(MIGRATIONS_DIR, file), "utf8"))
    .join("\n");
  const match = new RegExp(`CONSTRAINT "${CONSTRAINT}" CHECK \\([^)]*? in \\(([^)]*)\\)\\)`).exec(
    sql,
  );
  if (!match?.[1]) throw new Error(`${CONSTRAINT} not found in ${MIGRATIONS_DIR}`);
  return [...match[1].matchAll(/'([^']*)'/g)].map((literal) => literal[1] ?? "");
}

describe("checklist_progress.step_id CHECK constraint", () => {
  it("lists exactly CHECKLIST_STEP_IDS, in order, in the committed migration", () => {
    expect(constraintLiterals()).toEqual([...CHECKLIST_STEP_IDS]);
  });
});
