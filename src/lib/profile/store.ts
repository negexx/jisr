import { type Profile, ProfileSchema } from "@/data-schema/profile";

import { clearDraft } from "./draft";
import {
  clearLocalData,
  DRAFT_KEY,
  decodeProfile,
  getLocalStorage,
  PROFILE_KEY,
  type ResetReason,
  removeQuietly,
  type StorageLike,
  type StoredProfile,
  writeProfile,
} from "./storage";

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
    if (memoryProfile) {
      state = { status: "ok", profile: memoryProfile, storageAvailable };
      evidence = "memory";
    } else if (!readable) {
      state = { status: "none", storageAvailable };
      evidence = "";
    } else {
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

  function onStorageEvent(event: StorageEvent): void {
    if (event.key !== null && event.key !== PROFILE_KEY && event.key !== DRAFT_KEY) return;
    if (event.key !== DRAFT_KEY) {
      memoryProfile = null;
      writeFailed = false;
      refresh();
    }
    notify();
  }

  return {
    getSnapshot() {
      if (current === null) refresh();
      return current ?? UNHYDRATED;
    },
    getServerSnapshot: () => UNHYDRATED,
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1 && typeof window !== "undefined") {
        window.addEventListener("storage", onStorageEvent);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && typeof window !== "undefined") {
          window.removeEventListener("storage", onStorageEvent);
        }
      };
    },
    save(input) {
      const parsed = ProfileSchema.safeParse(input);
      if (!parsed.success) return { ok: false, reason: "invalid" };
      const storage = resolveStorage();
      const written = storage ? writeProfile(storage, parsed.data) : null;
      const persisted = storage !== null && written?.ok === true;
      if (storage && persisted) clearDraft(storage);
      memoryProfile = persisted ? null : parsed.data;
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
    dismissReset() {
      if (resetReason === null) return;
      resetReason = null;
      version += 1;
      refresh();
      notify();
    },
  };
}

export const profileStore = createProfileStore(getLocalStorage);
