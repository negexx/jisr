import { eq, sql } from "drizzle-orm";

import type { Profile } from "@/data-schema/profile";
import { checklistProgress, profiles, savedPrograms, userDataState } from "@/db/schema";
import type { ChecklistStepId } from "@/domain/types";
import type { SavedProgram } from "@/lib/saved/saved";

import {
  type AccountDb,
  type ActionResult,
  lockUser,
  nextProfileRevision,
  retireProfile,
  type Transaction,
} from "./account-store";
import { savedProgramToRow } from "./rows";

// The database half of the one-time guest import (importGuestData in import.ts). Like
// account-store.ts it takes the database and an authenticated user id, so the race spec drives two
// real connections through the same code.

export type GuestImportPayload = {
  profile: Profile | null;
  saved: SavedProgram[];
  plan: Record<string, ChecklistStepId[]>;
};

// "auto" never touches an account that already holds data; "replace" is the student's explicit
// choice to make the account hold exactly this device's data.
export type ImportMode = "auto" | "replace";

export type ImportResult = ActionResult<void> | { ok: false; error: "has_server_data" };

const HAS_SERVER_DATA = { ok: false, error: "has_server_data" } as const;

async function holdsData(tx: Transaction, userId: string): Promise<boolean> {
  const [state] = await tx
    .select({ importedAt: userDataState.importedAt })
    .from(userDataState)
    .where(eq(userDataState.userId, userId));
  if (state?.importedAt != null) return true;
  // One query at a time: a transaction is one connection.
  const profile = await tx
    .select({ userId: profiles.userId })
    .from(profiles)
    .where(eq(profiles.userId, userId));
  if (profile.length > 0) return true;
  const saved = await tx
    .select({ userId: savedPrograms.userId })
    .from(savedPrograms)
    .where(eq(savedPrograms.userId, userId))
    .limit(1);
  if (saved.length > 0) return true;
  const ticked = await tx
    .select({ userId: checklistProgress.userId })
    .from(checklistProgress)
    .where(eq(checklistProgress.userId, userId))
    .limit(1);
  return ticked.length > 0;
}

// Returns false when "auto" finds a profile written since holdsData looked. saveProfile's first
// insert takes the user lock too, so nothing can land in between under that lock: the refusal is
// defensive, for a profile write that ever skips the lock.
async function writeProfile(
  tx: Transaction,
  userId: string,
  profile: Profile | null,
  mode: ImportMode,
): Promise<boolean> {
  if (profile === null) {
    if (mode === "replace") await retireProfile(tx, userId);
    return true;
  }
  if (mode === "auto") {
    const created = await tx
      .insert(profiles)
      .values({ userId, data: profile, revision: nextProfileRevision(userId) })
      .onConflictDoNothing()
      .returning({ revision: profiles.revision });
    return created.length > 0;
  }
  // The revision moves on, so another device still holding the old one gets `conflict` from its
  // next saveProfile instead of overwriting what was just imported.
  await tx
    .insert(profiles)
    .values({ userId, data: profile, revision: nextProfileRevision(userId) })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: { data: profile, revision: sql`${profiles.revision} + 1`, updatedAt: sql`now()` },
    });
  return true;
}

// One transaction under the user-row lock (the same lock as the saved-programme cap), so of two
// "auto" imports of one account exactly one finds it empty.
export async function importGuestDataFor(
  db: AccountDb,
  userId: string,
  payload: GuestImportPayload,
  mode: ImportMode,
): Promise<ImportResult> {
  return db.transaction(async (tx) => {
    if (!(await lockUser(tx, userId))) return { ok: false, error: "unauthenticated" };
    if (mode === "auto" && (await holdsData(tx, userId))) return HAS_SERVER_DATA;
    // Nothing is written before this point, so a refusal here leaves the account as it was.
    if (!(await writeProfile(tx, userId, payload.profile, mode))) return HAS_SERVER_DATA;

    if (mode === "replace") {
      await tx.delete(savedPrograms).where(eq(savedPrograms.userId, userId));
      await tx.delete(checklistProgress).where(eq(checklistProgress.userId, userId));
    }
    const total = payload.saved.length;
    if (total > 0) {
      await tx.insert(savedPrograms).values(
        payload.saved.map((item, index) => ({
          ...savedProgramToRow(userId, item),
          // A multi-row INSERT has no guaranteed row order, so each row gets its own created_at:
          // milliseconds apart (what the reader compares), in list order, and all before
          // clock_timestamp() of any save made after this import.
          createdAt: sql`now() - (${total - index}::int * interval '1 millisecond')`,
        })),
      );
    }
    const steps = Object.entries(payload.plan).flatMap(([programSlug, ids]) =>
      ids.map((stepId) => ({ userId, programSlug, stepId })),
    );
    if (steps.length > 0) await tx.insert(checklistProgress).values(steps);

    await tx
      .insert(userDataState)
      .values({ userId, importedAt: sql`now()` })
      .onConflictDoUpdate({ target: userDataState.userId, set: { importedAt: sql`now()` } });
    return { ok: true, value: undefined };
  });
}
