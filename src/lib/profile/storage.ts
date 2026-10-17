import type { MatchFilters } from "@/data-schema/match-filters";
import type { Profile } from "@/data-schema/profile";
import { AUTH_HINT_KEY } from "@/lib/auth/session-hint";
import { MATCH_FILTERS_VERSION, PROFILE_SCHEMA_VERSION } from "@/lib/constants";
import { getLocalStorage, KEY_PREFIX, removeQuietly, type StorageLike } from "@/lib/local-storage";
import { seedFiltersFromLegacy } from "@/lib/matches/filter-store";
import { parseMatchFilters } from "@/lib/matches/filters";

import { parseProfile } from "./validate";

export { getLocalStorage, KEY_PREFIX, removeQuietly, type StorageLike };

export const PROFILE_KEY = "jisr.profile";
export const DRAFT_KEY = "jisr.profile-draft";

export type ResetReason = "invalid" | "unsupported_version";
export type StoredProfile =
  | { status: "none" }
  | { status: "ok"; profile: Profile; legacyPreferences?: MatchFilters }
  | { status: "reset"; reason: ResetReason };

export type MigrationResult =
  | { ok: true; profile: Profile; legacyPreferences?: MatchFilters }
  | { ok: false; reason: ResetReason };
export type WriteResult = { ok: true } | { ok: false; reason: "invalid" | "storage_unavailable" };

type RawRecord = Record<string, unknown>;

// A migration upgrades a record from version N to N + 1 and, when it strips preference values the
// student had chosen, hands them back so the store can seed the transient filter store once.
type Migration = (raw: RawRecord) => { record: RawRecord; legacyPreferences?: MatchFilters };

const LEGACY_PREFERENCE_KEYS = [
  "fields",
  "studyLanguages",
  "destinations",
  "budget",
  "institutionType",
] as const;

// The v1 preference values are only trusted once parseMatchFilters accepts them; a corrupt record
// seeds nothing rather than a half-parsed filter.
function legacyFiltersFrom(raw: RawRecord): MatchFilters | undefined {
  return (
    parseMatchFilters({
      schemaVersion: MATCH_FILTERS_VERSION,
      fields: raw.fields,
      studyLanguages: raw.studyLanguages,
      destinations: raw.destinations,
      institutionType: raw.institutionType,
      budget: raw.budget,
    }) ?? undefined
  );
}

const MIGRATIONS: Readonly<Record<number, Migration>> = {
  1: (raw) => {
    const legacyPreferences = legacyFiltersFrom(raw);
    const record: RawRecord = { ...raw, schemaVersion: 2 };
    for (const key of LEGACY_PREFERENCE_KEYS) delete record[key];
    return legacyPreferences === undefined ? { record } : { record, legacyPreferences };
  },
};

function isRecord(value: unknown): value is RawRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function applyMigrations(raw: RawRecord): { record: RawRecord; legacyPreferences?: MatchFilters } {
  let record = raw;
  let legacyPreferences: MatchFilters | undefined;
  for (let version = raw.schemaVersion as number; version < PROFILE_SCHEMA_VERSION; version += 1) {
    const migrate = MIGRATIONS[version];
    if (!migrate) return { record: raw };
    const migrated = migrate(record);
    record = migrated.record;
    if (migrated.legacyPreferences !== undefined) legacyPreferences = migrated.legacyPreferences;
  }
  return legacyPreferences === undefined ? { record } : { record, legacyPreferences };
}

// The strip alone, for callers that validate with their own parser (the server read path keeps Zod):
// a record this build cannot read is returned unchanged, and the caller's schema rejects it.
export function migrateProfileRecord(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const { schemaVersion } = raw;
  if (typeof schemaVersion !== "number" || !Number.isInteger(schemaVersion)) return raw;
  if (schemaVersion < 1 || schemaVersion > PROFILE_SCHEMA_VERSION) return raw;
  return applyMigrations(raw).record;
}

export function migrateProfile(raw: unknown): MigrationResult {
  if (!isRecord(raw)) return { ok: false, reason: "invalid" };
  const { schemaVersion } = raw;
  if (typeof schemaVersion !== "number") return { ok: false, reason: "invalid" };
  if (
    !Number.isInteger(schemaVersion) ||
    schemaVersion < 1 ||
    schemaVersion > PROFILE_SCHEMA_VERSION
  ) {
    return { ok: false, reason: "unsupported_version" };
  }

  const { record, legacyPreferences } = applyMigrations(raw);
  // Only the outcome leaves this function: nothing derived from the student's values is reported.
  const parsed = parseProfile(record);
  if (parsed === null) return { ok: false, reason: "invalid" };
  return legacyPreferences === undefined
    ? { ok: true, profile: parsed }
    : { ok: true, profile: parsed, legacyPreferences };
}

// Pure: turns the raw stored string into an outcome without touching storage.
export function decodeProfile(raw: string | null): StoredProfile {
  if (raw === null) return { status: "none" };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { status: "reset", reason: "invalid" };
  }
  const migrated = migrateProfile(json);
  if (!migrated.ok) return { status: "reset", reason: migrated.reason };
  return migrated.legacyPreferences === undefined
    ? { status: "ok", profile: migrated.profile }
    : { status: "ok", profile: migrated.profile, legacyPreferences: migrated.legacyPreferences };
}

// App code must go through the store (save/clear), not call this directly: a same-tab write fires
// no `storage` event, so a direct write would leave the store's cached snapshot stale.
export function readProfile(storage: StorageLike): StoredProfile {
  let raw: string | null;
  try {
    raw = storage.getItem(PROFILE_KEY);
  } catch {
    return { status: "none" };
  }
  const stored = decodeProfile(raw);
  if (stored.status === "reset") removeQuietly(storage, PROFILE_KEY);
  if (stored.status === "ok" && stored.legacyPreferences !== undefined) {
    seedFiltersFromLegacy(storage, stored.legacyPreferences);
  }
  return stored;
}

// App code must go through the store (save/clear), not call this directly: a same-tab write fires
// no `storage` event, so a direct write would leave the store's cached snapshot stale.
export function writeProfile(storage: StorageLike, profile: unknown): WriteResult {
  const parsed = parseProfile(profile);
  if (parsed === null) return { ok: false, reason: "invalid" };
  try {
    storage.setItem(PROFILE_KEY, JSON.stringify(parsed));
  } catch {
    return { ok: false, reason: "storage_unavailable" };
  }
  return { ok: true };
}

// Clear my data never removes these. The sign-in hint is managed only by sign-in, sign-out and
// account deletion: removing it here would make a signed-in device look signed out while its
// session cookie lives on.
const KEPT_BY_CLEAR = new Set<string>([AUTH_HINT_KEY]);

// Every other `jisr.` key goes: the guest's data (profile, draft, saved list, plan progress) and the
// signed-in account's cache. App code must go through the store (save/clear), not call this
// directly: a same-tab write fires no `storage` event, so a direct write would leave the store's
// cached snapshot stale.
export function clearLocalData(storage: StorageLike): void {
  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(KEY_PREFIX) && !KEPT_BY_CLEAR.has(key)) keys.push(key);
    }
  } catch {
    return;
  }
  for (const key of keys) removeQuietly(storage, key);
}
