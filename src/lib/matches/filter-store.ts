import type { MatchFilters } from "@/data-schema/match-filters";
import type { StorageLike } from "@/lib/local-storage";
import { EMPTY_MATCH_FILTERS, isEmptyFilters, parseMatchFilters } from "@/lib/matches/filters";

export const MATCH_FILTERS_KEY = "jisr.matches-filters";

// A fresh copy of the shared empty document: a reader owns what it returns, so a caller's
// in-place edit (sort/push) cannot change what "no filters" means for the whole session.
function emptyMatchFilters(): MatchFilters {
  return { ...EMPTY_MATCH_FILTERS, fields: [], studyLanguages: [], destinations: [] };
}

export function readMatchFilters(storage: StorageLike): MatchFilters {
  let raw: string | null;
  try {
    raw = storage.getItem(MATCH_FILTERS_KEY);
  } catch {
    return emptyMatchFilters();
  }
  if (raw === null) return emptyMatchFilters();
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return emptyMatchFilters();
  }
  return parseMatchFilters(json) ?? emptyMatchFilters();
}

// Mirrors writeProfile: parse before writing, so an invalid value never lands.
export function writeMatchFilters(storage: StorageLike, filters: unknown): void {
  const parsed = parseMatchFilters(filters);
  if (parsed === null) return;
  try {
    storage.setItem(MATCH_FILTERS_KEY, JSON.stringify(parsed));
  } catch {
    // Blocked storage: nothing was written.
  }
}

// One-time back-compat: the profile 1→2 migration hands over the preference values it stripped.
// Seed them only when nothing is stored yet (never overwrite a live choice) and only when the
// legacy values are non-default. Returns whether the write actually persisted: a blocked setItem
// drops the write silently, so reading back is the only honest signal.
export function seedFiltersFromLegacy(storage: StorageLike, legacy: MatchFilters): boolean {
  if (isEmptyFilters(legacy)) return false;
  if (!isEmptyFilters(readMatchFilters(storage))) return false;
  writeMatchFilters(storage, legacy);
  return !isEmptyFilters(readMatchFilters(storage));
}
