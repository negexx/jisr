import { planStore } from "@/lib/plan/store";
import { profileStore } from "@/lib/profile/store";
import { savedStore } from "@/lib/saved/store";

// Everything the guest keeps on this device. The profile store removes every `jisr.` key; a
// same-tab removal fires no `storage` event, so the other stores must re-read explicitly.
export function clearAllLocalData(): void {
  profileStore.clear();
  savedStore.reload();
  planStore.reload();
}
