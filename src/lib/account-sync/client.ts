import { inAccountMode, subscribeAccountMode } from "@/lib/account-cache";
import { forgetSession } from "@/lib/auth/session-client";
import { clearAccountLocalState } from "@/lib/auth/session-hint";
import { clearAllLocalData } from "@/lib/local-data";
import { accountPlanStore } from "@/lib/plan/store";
import { accountProfileStore } from "@/lib/profile/store";
import { accountSavedStore } from "@/lib/saved/store";
import {
  clearAccountData,
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

// Signing out here, in the menu or through clear my data drops whatever is still queued. Signing
// in again in this tab (the landing clears the cache first, ruling P24) reads the account afresh.
subscribeAccountMode(() => {
  if (!inAccountMode()) accountSync.reset();
  else void accountSync.hydrate();
});

// For the post-auth landing: read the account into the cache after the guest import wrote it.
export function hydrateAccountData(): Promise<void> {
  return accountSync.rehydrate();
}

export type ClearAccountOutcome = "cleared" | "signed_out" | "consent_required" | "failed";

// Clear my data while signed in: the account's rows first, then this device. Nothing local is
// removed unless the server confirmed, so a failure never leaves the two disagreeing. The sign-in
// hint stays (clearAllLocalData keeps it): the student is still signed in.
export async function clearAccountEverywhere(): Promise<ClearAccountOutcome> {
  let result: Awaited<ReturnType<typeof clearAccountData>>;
  try {
    // A save or tick still on its way would otherwise reach the server after the clear.
    await accountSync.settle();
    result = await clearAccountData();
  } catch {
    return "failed";
  }
  if (!result.ok) {
    if (result.error === "consent_required") return "consent_required";
    if (result.error !== "unauthenticated") return "failed";
    // The server no longer knows this session: the device signs out, and what is left to clear is
    // this device's own data, which the student can now clear as a guest.
    forgetSession();
    clearAccountLocalState();
    return "signed_out";
  }
  // Forget what the sync layer still holds or has queued, so nothing is written back.
  accountSync.reset();
  clearAllLocalData();
  return "cleared";
}
