export const KEY_PREFIX = "jisr.";

// React-free on purpose: server modules (profile storage) read it to keep the sign-in hint when the
// student clears their data, and they must not pull the client hook into the server graph.
export const AUTH_HINT_KEY = `${KEY_PREFIX}auth`;

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export function removeQuietly(storage: StorageLike, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Blocked storage: nothing was stored that we could remove.
  }
}

export function getLocalStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
