import {
  ACCOUNT_CACHE_PREFIX,
  readSessionHint,
  subscribeSessionHint,
} from "@/lib/auth/session-hint";
import type { LocalJsonStore } from "@/lib/local-store";

// Signed in, the stores show and change an account cache under its own keys (ruling P6): the
// guest's `jisr.profile`, `jisr.saved` and `jisr.plan` are not read or written while the hint is
// set, so unclaimed guest data survives hydration and sign-out.
export const ACCOUNT_SAVED_KEY = `${ACCOUNT_CACHE_PREFIX}saved`;
export const ACCOUNT_PLAN_KEY = `${ACCOUNT_CACHE_PREFIX}plan`;
export const ACCOUNT_PROFILE_KEY = `${ACCOUNT_CACHE_PREFIX}profile`;

const modeListeners = new Set<() => void>();
// Only trusted while someone listens: then every change of the hint reaches onHintChange.
let cachedMode: boolean | null = null;
let stopHint: (() => void) | null = null;

function onHintChange(): void {
  const next = readSessionHint();
  if (next === cachedMode) return;
  cachedMode = next;
  for (const listener of [...modeListeners]) listener();
}

export function inAccountMode(): boolean {
  return cachedMode ?? readSessionHint();
}

export function subscribeAccountMode(listener: () => void): () => void {
  modeListeners.add(listener);
  if (stopHint === null) {
    cachedMode = readSessionHint();
    stopHint = subscribeSessionHint(onHintChange);
  }
  return () => {
    modeListeners.delete(listener);
    if (modeListeners.size === 0 && stopHint !== null) {
      stopHint();
      stopHint = null;
      cachedMode = null;
    }
  };
}

// Clear my data removes the hint along with every other `jisr.` key, and tells no one.
export function refreshAccountMode(): void {
  if (stopHint !== null) onHintChange();
}

// The sync layer (Server Action references, queues, notices) is its own chunk: only a browser
// with the hint ever loads it, so a guest downloads and runs none of it.
export const loadAccountSync = () => import("@/lib/account-sync/client");

type Subscribe = (listener: () => void) => () => void;

// Listens to the guest store, the mode, and the account cache only while signed in, so a guest's
// page does not watch the account keys.
export function subscribeActive(
  guest: Subscribe,
  account: Subscribe,
  listener: () => void,
): () => void {
  const stopGuest = guest(listener);
  let stopAccount: (() => void) | null = null;
  const follow = () => {
    if (inAccountMode()) stopAccount ??= account(listener);
    else if (stopAccount !== null) {
      stopAccount();
      stopAccount = null;
    }
  };
  const stopMode = subscribeAccountMode(() => {
    follow();
    listener();
  });
  follow();
  return () => {
    stopMode();
    stopAccount?.();
    stopGuest();
  };
}

// The same store API over two caches: the guest's own data, or the signed-in account's cache.
// With no hint every call goes to the guest store exactly as before.
export function accountAwareStore<T>(
  guest: LocalJsonStore<T>,
  account: LocalJsonStore<T>,
): LocalJsonStore<T> {
  const active = () => (inAccountMode() ? account : guest);
  return {
    getSnapshot: () => active().getSnapshot(),
    getServerSnapshot: guest.getServerSnapshot,
    subscribe: (listener) => subscribeActive(guest.subscribe, account.subscribe, listener),
    update: (change) => active().update(change),
    reload() {
      guest.reload();
      account.reload();
      refreshAccountMode();
    },
  };
}
