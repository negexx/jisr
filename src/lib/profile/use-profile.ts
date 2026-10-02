"use client";

import { useMemo, useSyncExternalStore } from "react";

import { type ProfileState, type ProfileStore, profileStore } from "./store";

export type UseProfile = {
  state: ProfileState;
  save: ProfileStore["save"];
  dismissReset: ProfileStore["dismissReset"];
};

// No `clear` here: removing the profile is `clearAllLocalData` (`@/lib/local-data`), which also
// reloads the saved list and the plan progress; the hook stays light for the shell.
// The server snapshot is `unhydrated`, so the first client render matches the server HTML and
// localStorage is only read after hydration. `state.storageAvailable` is "this device can reliably
// read and write", not "the last save was persisted": that is `save()`'s `persisted` result.
export function useProfile(): UseProfile {
  const state = useSyncExternalStore(
    profileStore.subscribe,
    profileStore.getSnapshot,
    profileStore.getServerSnapshot,
  );
  return useMemo(
    () => ({
      state,
      save: profileStore.save,
      dismissReset: profileStore.dismissReset,
    }),
    [state],
  );
}
