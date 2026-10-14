import { loadAccountSync } from "@/lib/account-cache";
import type { AccountSync } from "@/lib/account-sync/sync";

// How many signed-in changes were dropped because the sync chunk could not load. The notices that
// normally explain a failure live in that chunk, so this count is shown by the eager loader
// (AccountSyncLoader) instead: a change is never dropped without a word.
let unavailable = 0;
const listeners = new Set<() => void>();

export function getSyncUnavailable(): number {
  return unavailable;
}

export function subscribeSyncUnavailable(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function reportUnavailable(): void {
  unavailable += 1;
  for (const listener of [...listeners]) listener();
}

// Runs a signed-in change once the sync layer is loaded; if it cannot load, nothing was applied
// and the student is told.
export function withAccountSync(run: (sync: AccountSync) => void): void {
  loadAccountSync().then(({ accountSync }) => run(accountSync), reportUnavailable);
}
