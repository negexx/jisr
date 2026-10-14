import type { ProfileDraft } from "@/data-schema/draft";
import { ACCOUNT_DRAFT_KEY, inAccountMode } from "@/lib/account-cache";

import { parseDraft } from "./draft-validate";
import { DRAFT_KEY, removeQuietly, type StorageLike } from "./storage";

export { DRAFT_SCHEMA_VERSION } from "@/lib/constants";
export type { ProfileDraft };

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
    const parsed = parseDraft(JSON.parse(raw));
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
