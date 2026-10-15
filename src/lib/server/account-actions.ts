"use server";

import type { Profile } from "@/data-schema/profile";
import { db } from "@/db";
import type { ChecklistStepId } from "@/domain/types";
import type { SavedProgram } from "@/lib/saved/saved";
import { guarded, withReadyAccount } from "./account-guard";
import {
  FeedbackInputSchema,
  ProfileWriteInputSchema,
  ProgramSlugInputSchema,
  SavedProgramInputSchema,
  StepToggleInputSchema,
} from "./account-inputs";
import {
  type AccountData,
  type ActionResult,
  clearAccountDataFor,
  createFeedbackReportFor,
  type FeedbackInput,
  forgetProgressFor,
  loadAccountDataFor,
  type SaveProfileResult,
  saveProfileFor,
  saveProgramFor,
  setStepDoneFor,
  unsaveProgramFor,
} from "./account-store";
import { requireAccountReady } from "./session";

export type {
  AccountData,
  ActionError,
  ActionResult,
  FeedbackInput,
  ProfileConflict,
  SaveProfileResult,
} from "./account-store";

// The read side of the account (hydration). It takes no input, so there is nothing to validate.
export async function loadAccountData(): Promise<ActionResult<AccountData>> {
  const ready = await guarded("loadAccountData", requireAccountReady);
  if (!ready.ok) return ready;
  return guarded("loadAccountData", () => loadAccountDataFor(db, ready.userId));
}

export async function saveProgram(
  item: SavedProgram,
): Promise<ActionResult<{ items: SavedProgram[] }>> {
  return withReadyAccount("saveProgram", SavedProgramInputSchema, item, (userId, valid) =>
    saveProgramFor(db, userId, valid),
  );
}

export async function unsaveProgram(
  slug: string,
): Promise<ActionResult<{ items: SavedProgram[] }>> {
  return withReadyAccount("unsaveProgram", ProgramSlugInputSchema, slug, (userId, valid) =>
    unsaveProgramFor(db, userId, valid),
  );
}

export async function setStepDone(
  slug: string,
  step: ChecklistStepId,
  done: boolean,
): Promise<ActionResult<{ steps: ChecklistStepId[] }>> {
  return withReadyAccount(
    "setStepDone",
    StepToggleInputSchema,
    { slug, step, done },
    (userId, valid) => setStepDoneFor(db, userId, valid.slug, valid.step, valid.done),
  );
}

export async function forgetProgress(slug: string): Promise<ActionResult<void>> {
  return withReadyAccount("forgetProgress", ProgramSlugInputSchema, slug, (userId, valid) =>
    forgetProgressFor(db, userId, valid),
  );
}

export async function saveProfile(
  profile: Profile,
  expectedRevision: number,
): Promise<SaveProfileResult> {
  return withReadyAccount(
    "saveProfile",
    ProfileWriteInputSchema,
    { profile, expectedRevision },
    (userId, valid) => saveProfileFor(db, userId, valid.profile, valid.expectedRevision),
  );
}

export async function createFeedbackReport(report: FeedbackInput): Promise<ActionResult<void>> {
  return withReadyAccount("createFeedbackReport", FeedbackInputSchema, report, (userId, valid) =>
    createFeedbackReportFor(db, userId, valid),
  );
}

// Clear my data while signed in: the account's profile, saved programmes, ticked steps and import
// marker. The sign-in itself, the consent record and feedback reports stay (account deletion
// removes those).
export async function clearAccountData(): Promise<ActionResult<void>> {
  const ready = await guarded("clearAccountData", requireAccountReady);
  if (!ready.ok) return ready;
  return guarded("clearAccountData", () => clearAccountDataFor(db, ready.userId));
}
