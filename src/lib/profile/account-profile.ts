import type { Profile } from "@/data-schema/profile";
import { hasOnlyKeys, isInteger, isRecord } from "@/lib/guards";

import { parseProfile } from "./validate";

// The signed-in account's profile as cached on this device: the document and the server revision
// it is based on, kept together so a compare-and-set never pairs a profile with another's revision.
export type AccountProfile = { schemaVersion: 1; profile: Profile | null; revision: number };

const ACCOUNT_PROFILE_VERSION = 1;

export const EMPTY_ACCOUNT_PROFILE: AccountProfile = {
  schemaVersion: ACCOUNT_PROFILE_VERSION,
  profile: null,
  revision: 0,
};

// A cache that does not parse is dropped: the server copy replaces it at the next hydration.
export function parseAccountProfile(raw: unknown): AccountProfile | null {
  if (!isRecord(raw) || !hasOnlyKeys(raw, ["schemaVersion", "profile", "revision"])) return null;
  const { schemaVersion, revision } = raw;
  if (schemaVersion !== ACCOUNT_PROFILE_VERSION || !isInteger(revision) || revision < 0) {
    return null;
  }
  if (raw.profile === null)
    return { schemaVersion: ACCOUNT_PROFILE_VERSION, profile: null, revision };
  const profile = parseProfile(raw.profile);
  return profile === null ? null : { schemaVersion: ACCOUNT_PROFILE_VERSION, profile, revision };
}
