import type { IsoDate } from "@/data-schema/dates";
import { inAccountMode, loadAccountSync } from "@/lib/account-cache";
import { track } from "@/lib/analytics";
import { MAX_SAVED_PROGRAMS } from "@/lib/constants";
import type { LocalJsonStore } from "@/lib/local-store";
import { forgetProgress } from "@/lib/plan/store";

import { addSaved, EMPTY_SAVED, isSavedSlug, removeSaved, type SavedList } from "./saved";
import { savedStore } from "./store";

export type SavedRef = { slug: string; country: string; field: string };
export type ToggleResult =
  | { ok: true; saved: boolean; persisted: boolean }
  | { ok: false; reason: "full" };

function listOf(store: LocalJsonStore<SavedList>): SavedList {
  const state = store.getSnapshot();
  return state.status === "ready" ? state.value : EMPTY_SAVED;
}

// The single action point for saving; `program-saved` is counted here, only when a program was added.
// `onRemoved` lets the caller forget what depended on the saved program (the ticked steps); it
// runs only when the removal was applied, so ticks are forgotten only if the program is gone.
// A reference the parser rejects (bad slug or snapshotVersion) returns
// `{ ok: true, saved: false, persisted: ... }` without saving anything: a caller that saw the
// program as not saved before the call and gets `saved: false` back must not show "removed" copy
// (the save button shows its failure alert instead).
export function toggleSaved(
  store: LocalJsonStore<SavedList>,
  ref: SavedRef,
  snapshotVersion: string,
  today: IsoDate,
  onRemoved: (slug: string) => void = () => {},
): ToggleResult {
  const list = listOf(store);
  if (isSavedSlug(list, ref.slug)) {
    const result = store.update((current) => removeSaved(current, ref.slug));
    if (result.ok) onRemoved(ref.slug);
    return { ok: true, saved: false, persisted: result.ok && result.persisted };
  }
  if (list.items.length >= MAX_SAVED_PROGRAMS) return { ok: false, reason: "full" };
  const result = store.update(
    (current) => addSaved(current, { ...ref, snapshotVersion, savedAt: today }) ?? current,
  );
  const saved = isSavedSlug(listOf(store), ref.slug);
  if (saved) track("program-saved");
  return { ok: true, saved, persisted: result.ok && result.persisted };
}

// Removing a program from the plan also forgets its ticked steps (signed in, the server's unsave
// deletes them too). If the sync chunk cannot load, nothing was changed.
export function removeFromPlan(slug: string): void {
  if (inAccountMode()) {
    loadAccountSync().then(
      ({ accountSync }) => accountSync.unsaveProgram(slug),
      () => undefined,
    );
    return;
  }
  savedStore.update((current) => removeSaved(current, slug));
  forgetProgress(slug);
}

export function toggleSavedProgram(
  ref: SavedRef,
  snapshotVersion: string,
  today: IsoDate,
): ToggleResult {
  return toggleSaved(savedStore, ref, snapshotVersion, today, forgetProgress);
}
