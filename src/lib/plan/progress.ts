import { CHECKLIST_STEP_IDS, type ChecklistStepId } from "@/domain/types";
import { PLAN_SCHEMA_VERSION } from "@/lib/constants";
import { hasOnlyKeys, isOneOf, isPlainObject, isRecord, matches } from "@/lib/guards";

export const PLAN_KEY = "jisr.plan";

// slug -> ticked step ids (checklist order, no duplicates, never empty). A ticked step is "done".
export type PlanProgress = { schemaVersion: 1; done: Record<string, ChecklistStepId[]> };

export const EMPTY_PROGRESS: PlanProgress = { schemaVersion: PLAN_SCHEMA_VERSION, done: {} };

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Programmes with ticked steps. Above MAX_SAVED_PROGRAMS on purpose: a tick can outlive an unsave
// that another device made in between, and the cap only bounds what is kept, not what is shown.
export const MAX_PLAN_PROGRAMS = 50;

function ordered(steps: Iterable<ChecklistStepId>): ChecklistStepId[] {
  const set = new Set(steps);
  return CHECKLIST_STEP_IDS.filter((id) => set.has(id));
}

export function parsePlanProgress(raw: unknown): PlanProgress | null {
  if (!isRecord(raw) || !hasOnlyKeys(raw, ["schemaVersion", "done"])) return null;
  if (raw.schemaVersion !== PLAN_SCHEMA_VERSION || !isPlainObject(raw.done)) return null;
  const done: Record<string, ChecklistStepId[]> = {};
  for (const slug of Object.keys(raw.done)) {
    if (Object.keys(done).length >= MAX_PLAN_PROGRAMS) break;
    const value = raw.done[slug];
    if (!matches(slug, SLUG) || !Array.isArray(value)) continue;
    const steps = ordered(
      value.flatMap((step): ChecklistStepId[] => (isOneOf(step, CHECKLIST_STEP_IDS) ? [step] : [])),
    );
    if (steps.length > 0) done[slug] = steps;
  }
  return { schemaVersion: PLAN_SCHEMA_VERSION, done };
}

export function doneSteps(progress: PlanProgress, slug: string): readonly ChecklistStepId[] {
  return Object.hasOwn(progress.done, slug) ? (progress.done[slug] ?? []) : [];
}

function withoutSlug(done: Record<string, ChecklistStepId[]>, slug: string) {
  return Object.fromEntries(Object.entries(done).filter(([key]) => key !== slug));
}

export function withStepDone(
  progress: PlanProgress,
  slug: string,
  step: ChecklistStepId,
  done: boolean,
): PlanProgress {
  const current = new Set(doneSteps(progress, slug));
  if (done) current.add(step);
  else current.delete(step);
  const rest = withoutSlug(progress.done, slug);
  const next = ordered(current);
  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    done: next.length > 0 ? { ...rest, [slug]: next } : rest,
  };
}

export function withoutProgram(progress: PlanProgress, slug: string): PlanProgress {
  return { schemaVersion: PLAN_SCHEMA_VERSION, done: withoutSlug(progress.done, slug) };
}
