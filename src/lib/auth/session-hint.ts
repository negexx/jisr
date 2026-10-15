import { useSyncExternalStore } from "react";

import { getLocalStorage, KEY_PREFIX, removeQuietly, type StorageLike } from "@/lib/local-storage";

// Zod-free: the shell reads the hint on every page. The hint says "this browser signed in", never
// "the session is valid": the session cookie is HttpOnly, so the server is the only judge. A guest
// has no hint and so makes no auth request at all.
export const AUTH_HINT_KEY = `${KEY_PREFIX}auth`;

// Everything a signed-in account keeps on this device lives under this prefix and never in the
// guest keys (`jisr.profile`, `jisr.saved`, `jisr.plan`): signing out removes it, and a guest's own
// data is untouched by an account's cache.
export const ACCOUNT_CACHE_PREFIX = `${KEY_PREFIX}account.`;

const HINT_ON = "true";

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of [...listeners]) listener();
}

export function readSessionHint(storage: StorageLike | null = getLocalStorage()): boolean {
  if (storage === null) return false;
  try {
    return storage.getItem(AUTH_HINT_KEY) === HINT_ON;
  } catch {
    return false;
  }
}

export function setSessionHint(storage: StorageLike | null = getLocalStorage()): void {
  if (storage === null) return;
  try {
    storage.setItem(AUTH_HINT_KEY, HINT_ON);
  } catch {
    // Blocked or full storage: the menu keeps looking signed out, the session itself is fine.
  }
  notify();
}

// Sign-out and a session the server no longer knows both end here. Removes the hint and the
// account cache and nothing else.
export function clearAccountLocalState(storage: StorageLike | null = getLocalStorage()): void {
  if (storage !== null) {
    const keys: string[] = [AUTH_HINT_KEY];
    try {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key?.startsWith(ACCOUNT_CACHE_PREFIX)) keys.push(key);
      }
    } catch {
      // Unreadable storage: remove what is known by name below.
    }
    for (const key of keys) removeQuietly(storage, key);
  }
  notify();
}

export function subscribeSessionHint(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === AUTH_HINT_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

// False on the server and during hydration, so the static HTML is always the signed-out one.
export function useSessionHint(): boolean {
  return useSyncExternalStore(subscribeSessionHint, readSessionHint, () => false);
}
