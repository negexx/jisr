import {
  ACCOUNT_FIELD_MAX_LENGTH,
  ACCOUNT_PROFILE_JSON_LIMIT,
  ACCOUNT_SLUG_MAX_LENGTH,
} from "@/lib/constants";
import { PLAN_KEY, parsePlanProgress } from "@/lib/plan/progress";
import { decodeProfile, PROFILE_KEY, removeQuietly, type StorageLike } from "@/lib/profile/storage";
import { parseSaved, SAVED_KEY, type SavedProgram } from "@/lib/saved/saved";
import type { GuestImportPayload } from "@/lib/server/import";
import { type AliasSource, resolveProgramSlug } from "@/lib/snapshot/resolve-program-slug";

// The guest keys an import claims. They hold only data no account has claimed yet (ruling P6): the
// signed-in cache lives under `jisr.account.`, so these are read straight from storage whatever
// the stores are showing. The guest's unfinished form draft is not part of an import.
export const CLAIMED_GUEST_KEYS = [PROFILE_KEY, SAVED_KEY, PLAN_KEY] as const;

function readKey(storage: StorageLike, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function readJson(storage: StorageLike, key: string): unknown {
  const raw = readKey(storage, key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// The guest parsers accept a little more than the account's input bounds (a slug or field of any
// length, a profile of any size). One such entry would make the server refuse the whole import,
// every time, so it is left out here instead: the account could never hold it, and the rest of the
// device's data is imported.
function fitsAccount(item: SavedProgram): boolean {
  return (
    item.slug.length <= ACCOUNT_SLUG_MAX_LENGTH && item.field.length <= ACCOUNT_FIELD_MAX_LENGTH
  );
}

// What this device would bring into an account, read with the guest parsers; null when there is
// nothing to bring (no readable profile, no saves, no ticks).
export function readGuestData(storage: StorageLike | null): GuestImportPayload | null {
  if (storage === null) return null;
  const stored = decodeProfile(readKey(storage, PROFILE_KEY));
  const profile =
    stored.status === "ok" && JSON.stringify(stored.profile).length <= ACCOUNT_PROFILE_JSON_LIMIT
      ? stored.profile
      : null;
  const saved = (parseSaved(readJson(storage, SAVED_KEY))?.items ?? []).filter(fitsAccount);
  const plan = Object.fromEntries(
    Object.entries(parsePlanProgress(readJson(storage, PLAN_KEY))?.done ?? {}).filter(
      ([slug]) => slug.length <= ACCOUNT_SLUG_MAX_LENGTH,
    ),
  );
  if (profile === null && saved.length === 0 && Object.keys(plan).length === 0) return null;
  return { profile, saved, plan };
}

// A programme renamed since it was saved can be in the list under its former and its current slug.
// The account must not hold both, so only the first saved entry is kept (as the plan page shows it).
export function withoutRenamedDuplicates(
  saved: readonly SavedProgram[],
  source: AliasSource,
): SavedProgram[] {
  const seen = new Set<string>();
  return saved.filter((item) => {
    const resolved = resolveProgramSlug(item.slug, source);
    if (seen.has(resolved)) return false;
    seen.add(resolved);
    return true;
  });
}

// After a successful import these keys belong to the account. Exactly these: the sign-in hint and
// the account cache must survive, or this device would stop syncing.
export function clearClaimedGuestData(storage: StorageLike | null): void {
  if (storage === null) return;
  for (const key of CLAIMED_GUEST_KEYS) removeQuietly(storage, key);
}
