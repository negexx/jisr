import type { AppLocale } from "@/i18n/routing";
import { hydrateAccountData } from "@/lib/account-sync/client";
import { getLocalStorage } from "@/lib/local-storage";
import { planStore } from "@/lib/plan/store";
import { profileStore } from "@/lib/profile/store";
import { savedStore } from "@/lib/saved/store";
import { type ImportMode, importGuestData } from "@/lib/server/import";
import { getSnapshotClient } from "@/lib/snapshot/use-snapshot";

import { clearClaimedGuestData, readGuestData, withoutRenamedDuplicates } from "./guest-data";

export type ImportOutcome = "done" | "has_server_data" | "failed";

// Loaded by the post-auth step only when this device holds guest data, so the Server Action
// reference and the manifest request stay off every other sign-in.
export async function importThisDevice(
  mode: ImportMode,
  locale: AppLocale,
): Promise<ImportOutcome> {
  const storage = getLocalStorage();
  const guest = readGuestData(storage);
  // Another tab may have imported or cleared it since the step began.
  if (guest === null) return "done";
  let result: Awaited<ReturnType<typeof importGuestData>>;
  try {
    // The manifest's alias map is the only source of former slugs; no shard is fetched.
    const { aliases } = await getSnapshotClient().load({ structural: [] }, locale);
    const saved = withoutRenamedDuplicates(guest.saved, { aliases });
    result = await importGuestData({ ...guest, saved }, mode);
  } catch {
    return "failed";
  }
  if (!result.ok) return result.error === "has_server_data" ? "has_server_data" : "failed";

  // These keys now belong to the account. A same-tab removal fires no `storage` event, so the
  // stores re-read, and the account cache is read again to show what was just imported.
  clearClaimedGuestData(storage);
  savedStore.reload();
  planStore.reload();
  profileStore.reload();
  await hydrateAccountData();
  return "done";
}
