import { type Profile, ProfileSchema } from "@/data-schema/profile";
import type { checklistProgress, profiles, savedPrograms } from "@/db/schema/app";
import { CHECKLIST_STEP_IDS, type ChecklistStepId } from "@/domain/types";
import { PLAN_SCHEMA_VERSION, SAVED_SCHEMA_VERSION } from "@/lib/constants";
import { isOneOf } from "@/lib/guards";
import { MAX_PLAN_PROGRAMS, type PlanProgress } from "@/lib/plan/progress";
import type { SavedList, SavedProgram } from "@/lib/saved/saved";

// Pure mappers between the per-item user-data rows and the guest document shapes the UI
// already speaks (SavedList, PlanProgress, Profile). No I/O: the Server Actions in this
// folder own the queries and call these at the edge.

export type SavedProgramRow = typeof savedPrograms.$inferSelect;
// created_at is set by the database, so it is not part of what the mappers write.
export type SavedProgramInsert = Omit<SavedProgramRow, "createdAt">;
export type ChecklistProgressRow = typeof checklistProgress.$inferSelect;
export type ProfileRow = typeof profiles.$inferSelect;

export function savedProgramToRow(userId: string, item: SavedProgram): SavedProgramInsert {
  return {
    userId,
    slug: item.slug,
    country: item.country,
    field: item.field,
    snapshotVersion: item.snapshotVersion,
    savedAt: item.savedAt,
  };
}

function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// saved_at is a calendar date, so same-day saves are ordered by created_at (insertion time);
// slug is the final deterministic tie-break, in code-unit order like Postgres C collation.
export function rowsToSavedList(rows: readonly SavedProgramRow[]): SavedList {
  const items = [...rows]
    .sort(
      (a, b) =>
        byCodeUnit(a.savedAt, b.savedAt) ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        byCodeUnit(a.slug, b.slug),
    )
    .map(
      (row): SavedProgram => ({
        slug: row.slug,
        country: row.country,
        field: row.field,
        snapshotVersion: row.snapshotVersion,
        savedAt: row.savedAt,
      }),
    );
  return { schemaVersion: SAVED_SCHEMA_VERSION, items };
}

export function planProgressToRows(
  userId: string,
  progress: PlanProgress,
  doneAt: Date,
): ChecklistProgressRow[] {
  return Object.entries(progress.done).flatMap(([programSlug, steps]) =>
    steps.map((stepId) => ({ userId, programSlug, stepId, doneAt })),
  );
}

// A step id outside the checklist cannot be stored (CHECK constraint); skipping one here
// only guards a row written by a future code version that this build does not know yet.
// Programmes are capped like the guest parser (the first MAX_PLAN_PROGRAMS by slug), so a
// document read from the database is never larger than one read from localStorage.
export function rowsToPlanProgress(rows: readonly ChecklistProgressRow[]): PlanProgress {
  const bySlug = new Map<string, Set<ChecklistStepId>>();
  for (const row of rows) {
    if (!isOneOf(row.stepId, CHECKLIST_STEP_IDS)) continue;
    const steps = bySlug.get(row.programSlug) ?? new Set<ChecklistStepId>();
    steps.add(row.stepId);
    bySlug.set(row.programSlug, steps);
  }
  const done = Object.fromEntries(
    [...bySlug]
      // Code-unit order, like Postgres C collation: the kept programmes never depend on the ICU locale.
      .sort(([a], [b]) => byCodeUnit(a, b))
      .slice(0, MAX_PLAN_PROGRAMS)
      .map(([slug, steps]) => [slug, CHECKLIST_STEP_IDS.filter((stepId) => steps.has(stepId))]),
  );
  return { schemaVersion: PLAN_SCHEMA_VERSION, done };
}

// revision and updated_at are owned by the compare-and-set write, so they are not part of
// the insert shape built here.
export function profileToRow(
  userId: string,
  profile: Profile,
): Pick<ProfileRow, "userId" | "data"> {
  return { userId, data: profile };
}

// The jsonb column is typed, not checked: a document from an older or newer build can
// fail the schema, and the caller then treats the account as having no usable profile.
export function rowToProfile(row: ProfileRow): Profile | null {
  const parsed = ProfileSchema.safeParse(row.data);
  return parsed.success ? parsed.data : null;
}
