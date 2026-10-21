import "server-only";

import { and, count, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { Profile } from "@/data-schema/profile";
import type * as schema from "@/db/schema";
import {
  checklistProgress,
  feedbackReports,
  profiles,
  savedPrograms,
  user,
  userDataState,
} from "@/db/schema";
import { CHECKLIST_STEP_IDS, type ChecklistStepId } from "@/domain/types";
import { MAX_SAVED_PROGRAMS } from "@/lib/constants";
import { isRecord } from "@/lib/guards";
import { MAX_PLAN_PROGRAMS, type PlanProgress } from "@/lib/plan/progress";
import type { SavedProgram } from "@/lib/saved/saved";

import { rowsToPlanProgress, rowsToSavedList, rowToProfile, savedProgramToRow } from "./rows";

// The database half of the account Server Actions. Every function takes the database and an
// already-authenticated user id, so the race specs can drive two real connections through the
// same code the "use server" wrappers in account-actions.ts call. Input is validated by the
// wrapper (account-inputs.ts); nothing here reads a session.

export const FEEDBACK_REPORTS_PER_DAY = 20;

export type AccountDb = NodePgDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<AccountDb["transaction"]>[0]>[0];

export type ActionError =
  | "unauthenticated"
  | "consent_required"
  | "invalid"
  | "saved_limit"
  | "rate_limited";
export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: ActionError };

export type ProfileConflict = {
  ok: false;
  error: "conflict";
  current: { profile: Profile; revision: number };
};
export type SaveProfileResult = ActionResult<{ revision: number }> | ProfileConflict;

// Everything the account holds, in the shapes the stores speak. A profile this build cannot read
// comes back as null with its revision, so the next save replaces it instead of conflicting.
export type AccountData = {
  profile: Profile | null;
  revision: number;
  saved: SavedProgram[];
  plan: PlanProgress;
};

export type FeedbackInput = {
  record: string;
  path: string;
  sourceUrl: string;
  snapshotVersion: string;
  note?: string | undefined;
};

const SQLSTATE = /^[0-9A-Z]{5}$/;

// The driver error is the only source of a SQLSTATE; Drizzle wraps it as `cause`.
export function sqlState(error: unknown): string | null {
  for (let at = error; isRecord(at); at = at.cause) {
    if (typeof at.code === "string" && SQLSTATE.test(at.code)) return at.code;
  }
  return null;
}

function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

// Serialises this user's writes that must see each other's effect (the saved-programme cap, the
// plan-programme cap, the feedback rate limit). FOR UPDATE on the user row also conflicts with the
// FOR KEY SHARE an insert takes through its foreign key. False when the user row is gone, e.g. the
// account was deleted while the session was still being presented.
export async function lockUser(tx: Transaction, userId: string): Promise<boolean> {
  const locked = await tx
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, userId))
    .for("update");
  return locked.length > 0;
}

// The revision a new profile row starts at: one above every revision this user's profile ever
// had. A profile deleted (Clear my data, an import that replaces it with none) leaves its revision
// in user_data_state, so a revision is never handed out twice and a device still holding an old
// one gets `conflict` rather than matching a newer row by accident.
export function nextProfileRevision(userId: string) {
  return sql<number>`coalesce((select ${userDataState.profileRevision} from ${userDataState} where ${userDataState.userId} = ${userId}), 0) + 1`;
}

// Deletes the profile row and raises the revision floor to its revision. Callers hold lockUser.
export async function retireProfile(tx: Transaction, userId: string): Promise<void> {
  const [gone] = await tx
    .delete(profiles)
    .where(eq(profiles.userId, userId))
    .returning({ revision: profiles.revision });
  if (gone === undefined) return;
  await tx
    .insert(userDataState)
    .values({ userId, profileRevision: gone.revision })
    .onConflictDoUpdate({
      target: userDataState.userId,
      set: { profileRevision: sql`greatest(${userDataState.profileRevision}, ${gone.revision})` },
    });
}

async function savedItems(tx: Transaction, userId: string): Promise<SavedProgram[]> {
  const rows = await tx.select().from(savedPrograms).where(eq(savedPrograms.userId, userId));
  return rowsToSavedList(rows).items;
}

async function doneSteps(
  tx: Transaction,
  userId: string,
  programSlug: string,
): Promise<ChecklistStepId[]> {
  const rows = await tx
    .select({ stepId: checklistProgress.stepId })
    .from(checklistProgress)
    .where(
      and(eq(checklistProgress.userId, userId), eq(checklistProgress.programSlug, programSlug)),
    );
  const present = new Set(rows.map((row) => row.stepId));
  return CHECKLIST_STEP_IDS.filter((stepId) => present.has(stepId));
}

// One read-only snapshot, so the three parts never mix states from before and after a write.
export async function loadAccountDataFor(
  db: AccountDb,
  userId: string,
): Promise<ActionResult<AccountData>> {
  return db.transaction(
    async (tx) => {
      const [profileRow] = await tx.select().from(profiles).where(eq(profiles.userId, userId));
      const saved = await savedItems(tx, userId);
      const planRows = await tx
        .select()
        .from(checklistProgress)
        .where(eq(checklistProgress.userId, userId));
      return ok({
        profile: profileRow === undefined ? null : rowToProfile(profileRow),
        revision: profileRow?.revision ?? 0,
        saved,
        plan: rowsToPlanProgress(planRows),
      });
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export async function saveProgramFor(
  db: AccountDb,
  userId: string,
  item: SavedProgram,
): Promise<ActionResult<{ items: SavedProgram[] }>> {
  return db.transaction(async (tx) => {
    if (!(await lockUser(tx, userId))) return { ok: false, error: "unauthenticated" };
    const current = await savedItems(tx, userId);
    const already = current.some((saved) => saved.slug === item.slug);
    if (!already && current.length >= MAX_SAVED_PROGRAMS) {
      return { ok: false, error: "saved_limit" };
    }
    await tx.insert(savedPrograms).values(savedProgramToRow(userId, item)).onConflictDoNothing();
    return ok({ items: await savedItems(tx, userId) });
  });
}

export async function unsaveProgramFor(
  db: AccountDb,
  userId: string,
  slug: string,
): Promise<ActionResult<{ items: SavedProgram[] }>> {
  return db.transaction(async (tx) => {
    await tx
      .delete(savedPrograms)
      .where(and(eq(savedPrograms.userId, userId), eq(savedPrograms.slug, slug)));
    await tx
      .delete(checklistProgress)
      .where(and(eq(checklistProgress.userId, userId), eq(checklistProgress.programSlug, slug)));
    return ok({ items: await savedItems(tx, userId) });
  });
}

export async function setStepDoneFor(
  db: AccountDb,
  userId: string,
  slug: string,
  step: ChecklistStepId,
  done: boolean,
): Promise<ActionResult<{ steps: ChecklistStepId[] }>> {
  return db.transaction(async (tx) => {
    if (!done) {
      await tx
        .delete(checklistProgress)
        .where(
          and(
            eq(checklistProgress.userId, userId),
            eq(checklistProgress.programSlug, slug),
            eq(checklistProgress.stepId, step),
          ),
        );
      return ok({ steps: await doneSteps(tx, userId, slug) });
    }
    if (!(await lockUser(tx, userId))) return { ok: false, error: "unauthenticated" };
    const known = await tx
      .selectDistinct({ programSlug: checklistProgress.programSlug })
      .from(checklistProgress)
      .where(eq(checklistProgress.userId, userId));
    const isNewProgram = !known.some((row) => row.programSlug === slug);
    // Bounds what one account can store; rowsToPlanProgress would drop the surplus on read anyway.
    if (isNewProgram && known.length >= MAX_PLAN_PROGRAMS) return { ok: false, error: "invalid" };
    await tx
      .insert(checklistProgress)
      .values({ userId, programSlug: slug, stepId: step })
      .onConflictDoNothing();
    return ok({ steps: await doneSteps(tx, userId, slug) });
  });
}

export async function forgetProgressFor(
  db: AccountDb,
  userId: string,
  slug: string,
): Promise<ActionResult<void>> {
  await db
    .delete(checklistProgress)
    .where(and(eq(checklistProgress.userId, userId), eq(checklistProgress.programSlug, slug)));
  return ok(undefined);
}

async function conflictWithCurrent(db: AccountDb, userId: string): Promise<SaveProfileResult> {
  const [row] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  // No row, or a document this build cannot read: there is no version to offer the student.
  const profile = row === undefined ? null : rowToProfile(row);
  if (row === undefined) {
    // An account deleted while its session was still being presented has no row to offer either.
    const [owner] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId));
    return { ok: false, error: owner === undefined ? "unauthenticated" : "invalid" };
  }
  if (profile === null) return { ok: false, error: "invalid" };
  return { ok: false, error: "conflict", current: { profile, revision: row.revision } };
}

// Compare-and-set: the write succeeds only against the revision the caller last saw. After a
// concurrent commit Postgres re-evaluates the UPDATE's WHERE (READ COMMITTED), so of two writers
// holding the same revision exactly one matches a row; no lock is needed.
export async function saveProfileFor(
  db: AccountDb,
  userId: string,
  profile: Profile,
  expectedRevision: number,
): Promise<SaveProfileResult> {
  const [updated] = await db
    .update(profiles)
    .set({ data: profile, revision: sql`${profiles.revision} + 1`, updatedAt: sql`now()` })
    .where(and(eq(profiles.userId, userId), eq(profiles.revision, expectedRevision)))
    .returning({ revision: profiles.revision });
  if (updated !== undefined) return ok({ revision: updated.revision });

  if (expectedRevision === 0) {
    // Creating the row reads the revision floor, so it takes the user lock that Clear my data and
    // the import hold while they move that floor.
    const created = await db.transaction(async (tx) => {
      if (!(await lockUser(tx, userId))) return "gone" as const;
      const [row] = await tx
        .insert(profiles)
        .values({ userId, data: profile, revision: nextProfileRevision(userId) })
        .onConflictDoNothing()
        .returning({ revision: profiles.revision });
      return row?.revision ?? null;
    });
    // The user row is gone (account deleted mid-session), as lockUser reports for the other actions.
    if (created === "gone") return { ok: false, error: "unauthenticated" };
    if (created !== null) return ok({ revision: created });
  }
  return conflictWithCurrent(db, userId);
}

export async function createFeedbackReportFor(
  db: AccountDb,
  userId: string,
  report: FeedbackInput,
): Promise<ActionResult<void>> {
  return db.transaction(async (tx) => {
    if (!(await lockUser(tx, userId))) return { ok: false, error: "unauthenticated" };
    const [recent] = await tx
      .select({ total: count() })
      .from(feedbackReports)
      .where(
        and(
          eq(feedbackReports.userId, userId),
          sql`${feedbackReports.createdAt} > now() - interval '24 hours'`,
        ),
      );
    if ((recent?.total ?? 0) >= FEEDBACK_REPORTS_PER_DAY) {
      return { ok: false, error: "rate_limited" };
    }
    const note = report.note === undefined || report.note === "" ? null : report.note;
    await tx.insert(feedbackReports).values({
      userId,
      record: report.record,
      path: report.path,
      sourceUrl: report.sourceUrl,
      snapshotVersion: report.snapshotVersion,
      note,
    });
    return ok(undefined);
  });
}

// Clear my data while signed in. The import marker is cleared too: it only says that the account's
// rows came from a device, and once they are gone a later sign-in with guest data imports it again
// instead of asking whether to keep an empty account. Feedback reports, the consent record and the
// sign-in itself are not user data here; account deletion removes them.
export async function clearAccountDataFor(
  db: AccountDb,
  userId: string,
): Promise<ActionResult<void>> {
  return db.transaction(async (tx) => {
    if (!(await lockUser(tx, userId))) return { ok: false, error: "unauthenticated" };
    await tx.delete(savedPrograms).where(eq(savedPrograms.userId, userId));
    await tx.delete(checklistProgress).where(eq(checklistProgress.userId, userId));
    await retireProfile(tx, userId);
    // The marker row stays for its revision floor; only the import marker itself is cleared.
    await tx
      .update(userDataState)
      .set({ importedAt: null })
      .where(eq(userDataState.userId, userId));
    return ok(undefined);
  });
}
