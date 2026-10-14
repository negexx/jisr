import { inAccountMode, subscribeAccountMode } from "@/lib/account-cache";
import { forgetSession } from "@/lib/auth/session-client";
import { clearAccountLocalState } from "@/lib/auth/session-hint";
import { accountPlanStore } from "@/lib/plan/store";
import { accountProfileStore } from "@/lib/profile/store";
import { accountSavedStore } from "@/lib/saved/store";
import {
  forgetProgress,
  loadAccountData,
  saveProfile,
  saveProgram,
  setStepDone,
  unsaveProgram,
} from "@/lib/server/account-actions";

import { createAccountSync } from "./sync";

// Loaded only once the sign-in hint is present (see loadAccountSync): importing the Server Actions
// here is the only place client code reaches them, and a guest never downloads this chunk.
export const accountSync = createAccountSync({
  actions: {
    loadAccountData,
    saveProgram,
    unsaveProgram,
    setStepDone,
    forgetProgress,
    saveProfile,
  },
  stores: { saved: accountSavedStore, plan: accountPlanStore, profile: accountProfileStore },
  isActive: inAccountMode,
  // The server no longer knows this session: the device signs out as the menu does.
  onSignedOut: () => {
    forgetSession();
    clearAccountLocalState();
  },
});

// Signing out here, in the menu or through clear my data drops whatever is still queued.
subscribeAccountMode(() => {
  if (!inAccountMode()) accountSync.reset();
});

// For the post-auth landing (todo 15): read the account into the cache after a sign-in.
export function hydrateAccountData(): Promise<void> {
  return accountSync.hydrate();
}
