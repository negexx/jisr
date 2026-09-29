"use client";

import { useMemo, useSyncExternalStore } from "react";

import { type ProfileState, type ProfileStore, profileStore } from "./store";

export type UseProfile = {
  state: ProfileState;
  save: ProfileStore["save"];
  clear: ProfileStore["clear"];
  dismissReset: ProfileStore["dismissReset"];
};

// The server snapshot is `unhydrated`, so the first client render matches the server HTML and
// localStorage is only read after hydration.
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
      clear: profileStore.clear,
      dismissReset: profileStore.dismissReset,
    }),
    [state],
  );
}
