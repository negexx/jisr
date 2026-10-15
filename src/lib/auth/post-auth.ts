import type { AppLocale } from "@/i18n/routing";
import { readGuestData } from "@/lib/account-import/guest-data";
import { getLocalStorage } from "@/lib/local-storage";
import type { ImportMode } from "@/lib/server/import";

// "choose": the account already holds data, so only the student can decide (keep it, or replace it
// with this device's). "failed": nothing changed on either side; the landing offers a retry.
export type PostAuthStep = "done" | "choose" | "failed";

// Whether there is anything to offer: the landing asks the student before any import (ruling P22).
export function deviceHasGuestData(): boolean {
  return readGuestData(getLocalStorage()) !== null;
}

// The step a completed sign-in runs after the finish-signup gate is clear, once the student has
// confirmed the import for the account the landing names, and before they are sent on: this
// device's unclaimed guest data goes into the account, on any device and at every sign-in until it
// is claimed. A device with no guest data loads nothing more.
export async function runPostAuthSeam(
  locale: AppLocale,
  mode: ImportMode = "auto",
): Promise<PostAuthStep> {
  if (!deviceHasGuestData()) return "done";
  try {
    const { importThisDevice } = await import("@/lib/account-import/run");
    const outcome = await importThisDevice(mode, locale);
    return outcome === "has_server_data" ? "choose" : outcome;
  } catch {
    // The chunk itself did not load.
    return "failed";
  }
}
