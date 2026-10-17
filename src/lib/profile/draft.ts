import type { ProfileDraft } from "@/data-schema/draft";
import { ACCOUNT_DRAFT_KEY, inAccountMode } from "@/lib/account-cache";
import { DRAFT_SCHEMA_VERSION } from "@/lib/constants";
import { isRecord } from "@/lib/guards";

import { parseDraft } from "./draft-validate";
import { DRAFT_KEY, removeQuietly, type StorageLike } from "./storage";

export { DRAFT_SCHEMA_VERSION };
export type { ProfileDraft };

// A draft from v1 still carries the preference fields the profile no longer has: strip them (and
// bump the version) so a half-finished form keeps its bac and languages answers.
const LEGACY_PREFERENCE_KEYS = [
  "fields",
  "studyLanguages",
  "destinations",
  "budget",
  "institutionType",
] as const;

function migrateDraft(raw: unknown): unknown {
  if (!isRecord(raw) || raw.schemaVersion !== 1) return raw;
  const record: Record<string, unknown> = { ...raw, schemaVersion: DRAFT_SCHEMA_VERSION };
  for (const key of LEGACY_PREFERENCE_KEYS) delete record[key];
  return record;
}

// Signed in, the form's draft (grades, nationality) belongs to the account cache: it is wiped at
// sign-out with the rest of `jisr.account.`, and the guest's own draft is left as it was.
function draftKey(): string {
  return inAccountMode() ? ACCOUNT_DRAFT_KEY : DRAFT_KEY;
}

export type DraftWriteResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "storage_unavailable" };

// The draft is not part of the store's state and other tabs are not told about it; only the profile
// form should call this, and clearing the profile goes through the store (`clear`, `save`).
export function readDraft(storage: StorageLike): ProfileDraft | null {
  let raw: string | null;
  try {
    raw = storage.getItem(draftKey());
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed = parseDraft(migrateDraft(JSON.parse(raw)));
    if (parsed !== null) return parsed;
  } catch {
    // Corrupt JSON is handled like any other invalid draft.
  }
  removeQuietly(storage, draftKey());
  return null;
}

// The draft is not part of the store's state and other tabs are not told about it; only the profile
// form should call this, and clearing the profile goes through the store (`clear`, `save`).
export function writeDraft(storage: StorageLike, draft: unknown): DraftWriteResult {
  const parsed = parseDraft(draft);
  if (parsed === null) return { ok: false, reason: "invalid" };
  try {
    storage.setItem(draftKey(), JSON.stringify(parsed));
  } catch {
    return { ok: false, reason: "storage_unavailable" };
  }
  return { ok: true };
}

// The draft is not part of the store's state and other tabs are not told about it; only the profile
// form should call this, and clearing the profile goes through the store (`clear`, `save`).
export function clearDraft(storage: StorageLike): void {
  removeQuietly(storage, draftKey());
}
