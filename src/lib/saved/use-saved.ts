"use client";

import { useMemo, useSyncExternalStore } from "react";

import { inAccountMode, loadAccountSync } from "@/lib/account-cache";
import { todayIso } from "@/lib/clock";

import type { SavedRef, ToggleResult } from "./actions";
import type { SavedProgram } from "./saved";
import { savedStore } from "./store";

export type UseSaved = {
  hydrated: boolean;
  items: readonly SavedProgram[];
  // False only when this device cannot reliably keep the list; true while unhydrated.
  storageAvailable: boolean;
  isSaved: (slug: string) => boolean;
  // Rejects if the toggle code cannot be loaded; nothing was changed then.
  toggle: (ref: SavedRef, snapshotVersion: string) => Promise<ToggleResult>;
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
      // The toggle code (and, behind it, the tick store an unsave must clear) is loaded on the
      // first click: pages that only show a Save button do not carry it until it is used.
      // Signed in, the sync layer applies it and sends it to the account.
      toggle: async (ref, snapshotVersion) =>
        inAccountMode()
          ? (await loadAccountSync()).accountSync.toggleSaved(ref, snapshotVersion, todayIso())
          : (await import("./actions")).toggleSavedProgram(ref, snapshotVersion, todayIso()),
    };
  }, [state]);
}
