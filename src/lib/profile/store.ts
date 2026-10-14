import type { Profile } from "@/data-schema/profile";
import {
  ACCOUNT_PROFILE_KEY,
  inAccountMode,
  refreshAccountMode,
  subscribeActive,
} from "@/lib/account-cache";
import { withAccountSync } from "@/lib/account-sync-runner";
import { createLocalJsonStore, type LocalJsonStore, type LocalState } from "@/lib/local-store";

import { type AccountProfile, EMPTY_ACCOUNT_PROFILE, parseAccountProfile } from "./account-profile";
import { clearDraft } from "./draft";
import {
  clearLocalData,
  decodeProfile,
  getLocalStorage,
  PROFILE_KEY,
  type ResetReason,
  removeQuietly,
  type StorageLike,
  type StoredProfile,
  writeProfile,
} from "./storage";
import { parseProfile } from "./validate";

// `storageAvailable` means "this device can reliably read and write local storage", NOT "this
// save was persisted" (`save()` returns `persisted` for that). Use it for the standing
// "we cannot save on this device" notice, and `persisted` for the outcome of one save.
export type ProfileState =
  | { status: "unhydrated" }
  | (StoredProfile & { storageAvailable: boolean });

export type SaveResult = { ok: true; persisted: boolean } | { ok: false; reason: "invalid" };

export type ProfileStore = {
  getSnapshot: () => ProfileState;
  getServerSnapshot: () => ProfileState;
  subscribe: (listener: () => void) => () => void;
  save: (profile: unknown) => SaveResult;
  clear: () => void;
  // Re-reads storage after something outside the store changed it (the guest import).
  reload: () => void;
  dismissReset: () => void;
};

const UNHYDRATED: ProfileState = { status: "unhydrated" };

export function createProfileStore(getStorage: () => StorageLike | null): ProfileStore {
  const listeners = new Set<() => void>();
  let current: ProfileState | null = null;
  let currentKey = "";
  // A profile the device would not persist (blocked storage, quota) stays usable from memory.
  let memoryProfile: Profile | null = null;
  let writeFailed = false;
  // Kept in memory: the invalid key is removed at once, but the student must still be told.
  let resetReason: ResetReason | null = null;
  let version = 0;

  function resolveStorage(): StorageLike | null {
    try {
      return getStorage();
    } catch {
      return null;
    }
  }

  function readSnapshot(): { state: ProfileState; key: string } {
    const storage = resolveStorage();
    let raw: string | null = null;
    let readable = storage !== null;
    if (storage) {
      try {
        raw = storage.getItem(PROFILE_KEY);
      } catch {
        readable = false;
      }
    }
    const storageAvailable = readable && !writeFailed;

    let state: ProfileState;
    let evidence: string;
    // A getItem that throws only intermittently could flip between these states; real
    // SecurityErrors (blocked storage) are persistent, so this is accepted.
    if (memoryProfile && (writeFailed || !readable)) {
      state = { status: "ok", profile: memoryProfile, storageAvailable };
      evidence = "memory";
    } else if (!readable) {
      state = { status: "none", storageAvailable };
      evidence = "";
    } else {
      // Storage is readable and holds the last save: it is authoritative again.
      memoryProfile = null;
      const stored = decodeProfile(raw);
      if (stored.status === "reset" && storage) removeQuietly(storage, PROFILE_KEY);
      if (stored.status === "reset") resetReason = stored.reason;
      else if (stored.status === "ok") resetReason = null;

      if (stored.status === "ok") {
        state = { ...stored, storageAvailable };
        evidence = raw ?? "";
      } else if (resetReason) {
        state = { status: "reset", reason: resetReason, storageAvailable };
        evidence = "";
      } else {
        state = { status: "none", storageAvailable };
        evidence = "";
      }
    }
    return {
      state,
      key: [version, state.status, resetReason, storageAvailable, evidence].join("|"),
    };
  }

  function refresh(): void {
    const next = readSnapshot();
    if (current !== null && next.key === currentKey) return;
    current = next.state;
    currentKey = next.key;
  }

  function notify(): void {
    for (const listener of [...listeners]) listener();
  }

  // The draft is not part of the state, so a draft-key event is deliberately not handled.
  function onStorageEvent(event: StorageEvent): void {
    if (event.key !== null && event.key !== PROFILE_KEY) return;
    if (event.storageArea !== null && event.storageArea !== resolveStorage()) return;
    memoryProfile = null;
    writeFailed = false;
    refresh();
    notify();
  }

  return {
    getSnapshot() {
      // With no subscriber no storage event keeps the cache fresh, and React reads the snapshot in
      // the first render, before `subscribe` runs, so re-read here (the object is kept if unchanged).
      if (current === null || listeners.size === 0) refresh();
      return current ?? UNHYDRATED;
    },
    getServerSnapshot: () => UNHYDRATED,
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) {
        // Without subscribers no storage event reaches us, so the cache may be stale.
        refresh();
        if (typeof window !== "undefined") window.addEventListener("storage", onStorageEvent);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && typeof window !== "undefined") {
          window.removeEventListener("storage", onStorageEvent);
        }
      };
    },
    save(input) {
      const parsed = parseProfile(input);
      if (parsed === null) return { ok: false, reason: "invalid" };
      const storage = resolveStorage();
      const written = storage ? writeProfile(storage, parsed) : null;
      const persisted = storage !== null && written?.ok === true;
      if (storage && persisted) clearDraft(storage);
      // Removed best-effort so a reload cannot bring back the older profile this one replaced.
      if (storage && !persisted) removeQuietly(storage, PROFILE_KEY);
      memoryProfile = parsed;
      writeFailed = !persisted;
      resetReason = null;
      version += 1;
      refresh();
      notify();
      return { ok: true, persisted };
    },
    clear() {
      const storage = resolveStorage();
      if (storage) clearLocalData(storage);
      memoryProfile = null;
      writeFailed = false;
      resetReason = null;
      version += 1;
      refresh();
      notify();
    },
    reload() {
      memoryProfile = null;
      writeFailed = false;
      version += 1;
      refresh();
      notify();
    },
    dismissReset() {
      if (resetReason === null) return;
      resetReason = null;
      version += 1;
      refresh();
      notify();
    },
  };
}

// Written only by the account sync layer (src/lib/account-sync).
export const accountProfileStore = createLocalJsonStore(getLocalStorage, {
  key: ACCOUNT_PROFILE_KEY,
  empty: EMPTY_ACCOUNT_PROFILE,
  parse: parseAccountProfile,
});

// The profile store's API over the guest store or, while the sign-in hint is set, the account
// cache. A signed-in save is handed to the sync layer, which applies it at once and then sends it.
export function accountAwareProfileStore(
  guest: ProfileStore,
  account: LocalJsonStore<AccountProfile>,
  getStorage: () => StorageLike | null,
): ProfileStore {
  let source: LocalState<AccountProfile> | null = null;
  let mapped: ProfileState = UNHYDRATED;

  // Same object while the cache is unchanged, as useSyncExternalStore requires.
  function accountState(): ProfileState {
    const next = account.getSnapshot();
    if (next !== source) {
      source = next;
      if (next.status === "unhydrated") mapped = UNHYDRATED;
      else if (next.value.profile === null) {
        mapped = { status: "none", storageAvailable: next.storageAvailable };
      } else {
        mapped = {
          status: "ok",
          profile: next.value.profile,
          storageAvailable: next.storageAvailable,
        };
      }
    }
    return mapped;
  }

  return {
    getSnapshot: () => (inAccountMode() ? accountState() : guest.getSnapshot()),
    getServerSnapshot: guest.getServerSnapshot,
    subscribe: (listener) => subscribeActive(guest.subscribe, account.subscribe, listener),
    save(input) {
      if (!inAccountMode()) return guest.save(input);
      const parsed = parseProfile(input);
      if (parsed === null) return { ok: false, reason: "invalid" };
      let storage: StorageLike | null = null;
      try {
        storage = getStorage();
      } catch {
        storage = null;
      }
      if (storage !== null) clearDraft(storage);
      // A chunk that cannot load leaves the account as it was, and a notice says so.
      withAccountSync((sync) => sync.saveProfile(parsed));
      return { ok: true, persisted: true };
    },
    clear() {
      // Removes every `jisr.` key but the sign-in hint, the account cache included.
      guest.clear();
      account.reload();
      refreshAccountMode();
    },
    reload() {
      guest.reload();
      account.reload();
      refreshAccountMode();
    },
    dismissReset() {
      if (!inAccountMode()) guest.dismissReset();
    },
  };
}

export const profileStore = accountAwareProfileStore(
  createProfileStore(getLocalStorage),
  accountProfileStore,
  getLocalStorage,
);
