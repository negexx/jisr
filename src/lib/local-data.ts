import { planStore } from "@/lib/plan/store";
import { profileStore } from "@/lib/profile/store";
import { savedStore } from "@/lib/saved/store";

// Clear my data on this device: the guest's data and the account cache (clearLocalData). The
// sign-in hint stays: it is managed only by sign-in, sign-out and account deletion. A same-tab
// removal fires no `storage` event, so the other stores must re-read explicitly.
export function clearAllLocalData(): void {
  profileStore.clear();
  savedStore.reload();
  planStore.reload();
}
