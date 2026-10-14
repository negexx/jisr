import type { AppLocale } from "@/i18n/routing";
import { readGuestData } from "@/lib/account-import/guest-data";
import { getLocalStorage } from "@/lib/local-storage";
import type { ImportMode } from "@/lib/server/import";

// "choose": the account already holds data, so only the student can decide (keep it, or replace it
// with this device's). "failed": nothing changed on either side; the landing offers a retry.
export type PostAuthStep = "done" | "choose" | "failed";

// The single step every completed sign-in runs after the finish-signup gate is clear and before the
// student is sent on: this device's unclaimed guest data goes into the account, on any device and
// at every sign-in until it is claimed. A device with no guest data loads nothing more.
export async function runPostAuthSeam(
  locale: AppLocale,
  mode: ImportMode = "auto",
): Promise<PostAuthStep> {
  if (readGuestData(getLocalStorage()) === null) return "done";
  try {
    const { importThisDevice } = await import("@/lib/account-import/run");
    const outcome = await importThisDevice(mode, locale);
    return outcome === "has_server_data" ? "choose" : outcome;
  } catch {
    // The chunk itself did not load.
    return "failed";
  }
}
