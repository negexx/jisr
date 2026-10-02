import { removeQuietly, type StorageLike } from "./local-storage";

// `storageAvailable` means "this device can reliably read and write local storage", not "the last
// update was persisted" (`update()` returns `persisted` for that).
export type LocalState<T> =
  | { status: "unhydrated" }
  | { status: "ready"; value: T; storageAvailable: boolean };

export type UpdateResult = { ok: true; persisted: boolean } | { ok: false };

export type LocalJsonStore<T> = {
  getSnapshot: () => LocalState<T>;
  getServerSnapshot: () => LocalState<T>;
  subscribe: (listener: () => void) => () => void;
  update: (change: (current: T) => T) => UpdateResult;
  // Re-reads storage after something outside the store changed it (clear my data).
  reload: () => void;
};

export type LocalJsonOptions<T> = {
  key: string;
  empty: T;
  // Normalises a value (stored or about to be written); null means "not acceptable".
  parse: (raw: unknown) => T | null;
};

const UNHYDRATED: LocalState<never> = { status: "unhydrated" };

// Same semantics as the profile store: the server snapshot is `unhydrated` so the first client
// render matches the server HTML; a same-tab write fires no `storage` event, so writes go through
// `update`, which refreshes and notifies itself.
export function createLocalJsonStore<T>(
  getStorage: () => StorageLike | null,
  options: LocalJsonOptions<T>,
): LocalJsonStore<T> {
  const { key, empty, parse } = options;
  const listeners = new Set<() => void>();
  let current: LocalState<T> | null = null;
  let currentEvidence = "";
  // A value the device would not persist (blocked storage, quota) stays usable from memory.
  let memory: { value: T } | null = null;
  let writeFailed = false;
  let version = 0;

  function resolveStorage(): StorageLike | null {
    try {
      return getStorage();
    } catch {
      return null;
    }
  }

  function read(): { state: LocalState<T>; evidence: string } {
    const storage = resolveStorage();
    let raw: string | null = null;
    let readable = storage !== null;
    if (storage) {
      try {
        raw = storage.getItem(key);
      } catch {
        readable = false;
      }
    }
    const storageAvailable = readable && !writeFailed;
    if (memory !== null && !storageAvailable) {
      return {
        state: { status: "ready", value: memory.value, storageAvailable },
        evidence: `memory|${version}`,
      };
    }
    if (!readable || storage === null) {
      return {
        state: { status: "ready", value: empty, storageAvailable: false },
        evidence: "unreadable",
      };
    }
    // Storage is readable and holds the last write: it is authoritative again.
    memory = null;
    let value = empty;
    let usable = raw !== null;
    if (raw !== null) {
      let parsed: T | null = null;
      try {
        parsed = parse(JSON.parse(raw));
      } catch {
        parsed = null;
      }
      if (parsed === null) {
        removeQuietly(storage, key);
        usable = false;
      } else {
        value = parsed;
      }
    }
    return {
      state: { status: "ready", value, storageAvailable },
      evidence: `${storageAvailable}|${usable ? raw : ""}`,
    };
  }

  function refresh(): void {
    const next = read();
    if (current !== null && next.evidence === currentEvidence) return;
    current = next.state;
    currentEvidence = next.evidence;
  }

  function notify(): void {
    for (const listener of [...listeners]) listener();
  }

  function onStorageEvent(event: StorageEvent): void {
    if (event.key !== null && event.key !== key) return;
    if (event.storageArea !== null && event.storageArea !== resolveStorage()) return;
    memory = null;
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
    update(change) {
      refresh();
      const base = current !== null && current.status === "ready" ? current.value : empty;
      const next = parse(change(base));
      if (next === null) return { ok: false };
      const storage = resolveStorage();
      let persisted = false;
      if (storage) {
        try {
          storage.setItem(key, JSON.stringify(next));
          persisted = true;
        } catch {
          persisted = false;
        }
        // Removed best-effort so a reload cannot bring back the older value this one replaced.
        if (!persisted) removeQuietly(storage, key);
      }
      memory = { value: next };
      writeFailed = !persisted;
      version += 1;
      refresh();
      notify();
      return { ok: true, persisted };
    },
    reload() {
      memory = null;
      writeFailed = false;
      version += 1;
      refresh();
      notify();
    },
  };
}
