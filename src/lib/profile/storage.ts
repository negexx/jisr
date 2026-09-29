import { PROFILE_SCHEMA_VERSION, type Profile, ProfileSchema } from "@/data-schema/profile";

export const KEY_PREFIX = "jisr.";
export const PROFILE_KEY = "jisr.profile";
export const DRAFT_KEY = "jisr.profile-draft";

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

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

  // Only the outcome leaves this function: a Zod error would echo the student's values.
  const parsed = ProfileSchema.safeParse(record);
  return parsed.success ? { ok: true, profile: parsed.data } : { ok: false, reason: "invalid" };
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

export function removeQuietly(storage: StorageLike, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Blocked storage: nothing was stored that we could remove.
  }
}

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

export function writeProfile(storage: StorageLike, profile: unknown): WriteResult {
  const parsed = ProfileSchema.safeParse(profile);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    storage.setItem(PROFILE_KEY, JSON.stringify(parsed.data));
  } catch {
    return { ok: false, reason: "storage_unavailable" };
  }
  return { ok: true };
}

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

export function getLocalStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
