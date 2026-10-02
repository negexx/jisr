import type { ChecklistStepId } from "@/domain/types";
import { getLocalStorage } from "@/lib/local-storage";
import { createLocalJsonStore } from "@/lib/local-store";

import {
  EMPTY_PROGRESS,
  PLAN_KEY,
  parsePlanProgress,
  withoutProgram,
  withStepDone,
} from "./progress";

export const planStore = createLocalJsonStore(getLocalStorage, {
  key: PLAN_KEY,
  empty: EMPTY_PROGRESS,
  parse: parsePlanProgress,
});

export function setStepDone(slug: string, step: ChecklistStepId, done: boolean): void {
  planStore.update((progress) => withStepDone(progress, slug, step, done));
}

export function forgetProgress(slug: string): void {
  planStore.update((progress) => withoutProgram(progress, slug));
}
