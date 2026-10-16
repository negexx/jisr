import { KEY_PREFIX, removeQuietly, type StorageLike } from "@/lib/local-storage";

// Ruling Q19: the confirm page knows whether this browser asked for the magic link (the soft nonce
// matched). It hands that one fact to the welcome landing through sessionStorage: per-tab and
// same-origin, so no URL parameter (which a sharer could forge) is needed, and it never outlives the
// tab. A blocked storage reads as a same-browser sign-in: the landing still asks before any import.

export const SIGN_IN_BROWSER_KEY = `${KEY_PREFIX}auth.browser`;

export type SignInBrowser = "same" | "other";

// Account-only code: the accessor lives here, not in the shared @/lib/local-storage, so nothing
// guest-reachable changes for a feature only the signed-in pages use.
function getSessionStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function rememberSignInBrowser(
  other: boolean,
  storage: StorageLike | null = getSessionStorage(),
): void {
  if (storage === null) return;
  try {
    storage.setItem(SIGN_IN_BROWSER_KEY, other ? "other" : "same");
  } catch {
    // Blocked storage: the landing treats the sign-in as same-browser.
  }
}

// Read WITHOUT clearing: the fact must survive a reload or a remount of the landing, otherwise a
// refresh would offer the guest import again (ruling Q19 says never). It is overwritten by the next
// magic-link confirm and cleared on sign-out, so it cannot leak into a later, unrelated sign-in.
export function readSignInBrowser(
  storage: StorageLike | null = getSessionStorage(),
): SignInBrowser | null {
  if (storage === null) return null;
  let value: string | null;
  try {
    value = storage.getItem(SIGN_IN_BROWSER_KEY);
  } catch {
    return null;
  }
  if (value === "other") return "other";
  return value === "same" ? "same" : null;
}

export function clearSignInBrowser(storage: StorageLike | null = getSessionStorage()): void {
  if (storage !== null) removeQuietly(storage, SIGN_IN_BROWSER_KEY);
}
