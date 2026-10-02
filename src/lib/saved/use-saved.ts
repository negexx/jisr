"use client";

import { useMemo, useSyncExternalStore } from "react";

import { todayIso } from "@/lib/clock";

import { removeFromPlan, type SavedRef, type ToggleResult, toggleSavedProgram } from "./actions";
import type { SavedProgram } from "./saved";
import { savedStore } from "./store";

export type UseSaved = {
  hydrated: boolean;
  items: readonly SavedProgram[];
  // False only when this device cannot reliably keep the list; true while unhydrated.
  storageAvailable: boolean;
  isSaved: (slug: string) => boolean;
  toggle: (ref: SavedRef, snapshotVersion: string) => ToggleResult;
  remove: (slug: string) => void;
};

const NONE: readonly SavedProgram[] = [];

export function useSaved(): UseSaved {
  const state = useSyncExternalStore(
    savedStore.subscribe,
    savedStore.getSnapshot,
    savedStore.getServerSnapshot,
  );
  return useMemo(() => {
    const items = state.status === "ready" ? state.value.items : NONE;
    return {
      hydrated: state.status === "ready",
      items,
      storageAvailable: state.status !== "ready" || state.storageAvailable,
      isSaved: (slug) => items.some((item) => item.slug === slug),
      toggle: (ref, snapshotVersion) => toggleSavedProgram(ref, snapshotVersion, todayIso()),
      remove: removeFromPlan,
    };
  }, [state]);
}
