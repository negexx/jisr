import type { IsoDate } from "@/data-schema/dates";
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

// The single action point for saving: the analytics task hooks `program-saved` here.
// `onRemoved` lets the caller forget what depended on the saved program (the ticked steps).
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
    onRemoved(ref.slug);
    return { ok: true, saved: false, persisted: result.ok && result.persisted };
  }
  if (list.items.length >= MAX_SAVED_PROGRAMS) return { ok: false, reason: "full" };
  const result = store.update(
    (current) => addSaved(current, { ...ref, snapshotVersion, savedAt: today }) ?? current,
  );
  return {
    ok: true,
    saved: isSavedSlug(listOf(store), ref.slug),
    persisted: result.ok && result.persisted,
  };
}

// Removing a program from the plan also forgets its ticked steps.
export function removeFromPlan(slug: string): void {
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
