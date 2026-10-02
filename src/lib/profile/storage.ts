import type { Profile } from "@/data-schema/profile";
import { PROFILE_SCHEMA_VERSION } from "@/lib/constants";
import { getLocalStorage, KEY_PREFIX, removeQuietly, type StorageLike } from "@/lib/local-storage";

import { parseProfile } from "./validate";

export { getLocalStorage, KEY_PREFIX, removeQuietly, type StorageLike };

export const PROFILE_KEY = "jisr.profile";
export const DRAFT_KEY = "jisr.profile-draft";

export type ResetReason = "invalid" | "unsupported_version";
export type StoredProfile =
  | { status: "none" }
  | { status: "ok"; profile: Profile }
  | { status: "reset"; reason: ResetReason };

export type MigrationResult = { ok: true; profile: Profile } | { ok: false; reason: ResetReason };
export type WriteResult = { ok: true } | { ok: false; reason: "invalid" | "storage_unavailable" };

type RawRecord = Record<string, unknown>;

// Each entry upgrades a record from version N to N + 1. Version 1 is the current version, so the
// table is empty; a future v2 adds `1: (raw) => ({ ...raw, schemaVersion: 2, ...changes })`.
const MIGRATIONS: Readonly<Record<number, (raw: RawRecord) => RawRecord>> = {};

function isRecord(value: unknown): value is RawRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

  let record = raw;
  for (let version = schemaVersion; version < PROFILE_SCHEMA_VERSION; version += 1) {
    const migrate = MIGRATIONS[version];
    if (!migrate) return { ok: false, reason: "unsupported_version" };
    record = migrate(record);
  }

  // Only the outcome leaves this function: nothing derived from the student's values is reported.
  const parsed = parseProfile(record);
  return parsed === null ? { ok: false, reason: "invalid" } : { ok: true, profile: parsed };
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
  return migrated.ok
    ? { status: "ok", profile: migrated.profile }
    : { status: "reset", reason: migrated.reason };
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

// App code must go through the store (save/clear), not call this directly: a same-tab write fires
// no `storage` event, so a direct write would leave the store's cached snapshot stale.
export function clearLocalData(storage: StorageLike): void {
  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(KEY_PREFIX)) keys.push(key);
    }
  } catch {
    return;
  }
  for (const key of keys) removeQuietly(storage, key);
}
