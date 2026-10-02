"use client";

import { useSyncExternalStore } from "react";

import { savedStore } from "./store";

// The header's badge only needs how many programs are saved. A hook of its own keeps the toggle,
// the removal and the plan's tick store out of the chunk every page loads for the nav.
// The server and the first client render report 0, so the static HTML carries no badge.
export function useSavedCount(): number {
  return useSyncExternalStore(
    savedStore.subscribe,
    () => {
      const state = savedStore.getSnapshot();
      return state.status === "ready" ? state.value.items.length : 0;
    },
    () => 0,
  );
}
