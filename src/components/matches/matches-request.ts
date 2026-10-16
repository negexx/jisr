import type { Profile } from "@/data-schema/profile";
import { shardsForMatches } from "@/lib/snapshot/plan";
import type { SnapshotRequest } from "@/lib/snapshot/use-snapshot";

// The plan reads only the credential country, so changing a match filter never refetches the shards.
// It stays in memory: never sent, logged or put in a URL.
export function planKey(profile: Profile): string {
  return JSON.stringify([profile.credential.country]);
}

// One request for both the band's summary and the results island: they must never plan differently.
export function matchesRequest(profile: Profile | null): SnapshotRequest | null {
  if (profile === null) return null;
  return {
    key: planKey(profile),
    plan: (manifest) => shardsForMatches(profile, manifest),
  };
}
