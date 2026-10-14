import type { ChecklistStepId } from "@/domain/types";
import {
  ACCOUNT_PLAN_KEY,
  accountAwareStore,
  inAccountMode,
  loadAccountSync,
} from "@/lib/account-cache";
import { getLocalStorage } from "@/lib/local-storage";
import { createLocalJsonStore } from "@/lib/local-store";

import {
  EMPTY_PROGRESS,
  PLAN_KEY,
  parsePlanProgress,
  withoutProgram,
  withStepDone,
} from "./progress";

// Written only by the account sync layer (src/lib/account-sync).
export const accountPlanStore = createLocalJsonStore(getLocalStorage, {
  key: ACCOUNT_PLAN_KEY,
  empty: EMPTY_PROGRESS,
  parse: parsePlanProgress,
});

export const planStore = accountAwareStore(
  createLocalJsonStore(getLocalStorage, {
    key: PLAN_KEY,
    empty: EMPTY_PROGRESS,
    parse: parsePlanProgress,
  }),
  accountPlanStore,
);

// Signed in, the change is applied by the sync layer (optimistic, then the Server Action). If its
// chunk cannot load nothing was changed, and the checkbox simply stays as it was.
export function setStepDone(slug: string, step: ChecklistStepId, done: boolean): void {
  if (inAccountMode()) {
    loadAccountSync().then(
      ({ accountSync }) => accountSync.setStepDone(slug, step, done),
      () => undefined,
    );
    return;
  }
  planStore.update((progress) => withStepDone(progress, slug, step, done));
}

export function forgetProgress(slug: string): void {
  if (inAccountMode()) {
    loadAccountSync().then(
      ({ accountSync }) => accountSync.forgetProgress(slug),
      () => undefined,
    );
    return;
  }
  planStore.update((progress) => withoutProgram(progress, slug));
}
