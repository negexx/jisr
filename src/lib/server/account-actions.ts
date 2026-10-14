"use server";

import type { z } from "zod";

import type { Profile } from "@/data-schema/profile";
import { db } from "@/db";
import type { ChecklistStepId } from "@/domain/types";
import { isRecord } from "@/lib/guards";
import type { SavedProgram } from "@/lib/saved/saved";

import {
  FeedbackInputSchema,
  ProfileWriteInputSchema,
  ProgramSlugInputSchema,
  SavedProgramInputSchema,
  StepToggleInputSchema,
} from "./account-inputs";
import {
  type ActionResult,
  createFeedbackReportFor,
  type FeedbackInput,
  forgetProgressFor,
  type SaveProfileResult,
  saveProfileFor,
  saveProgramFor,
  setStepDoneFor,
  unsaveProgramFor,
} from "./account-store";
import { requireAccountReady } from "./session";

export type {
  ActionError,
  ActionResult,
  FeedbackInput,
  ProfileConflict,
  SaveProfileResult,
} from "./account-store";

const SQLSTATE = /^[0-9A-Z]{5}$/;

// The driver error is the only source of a SQLSTATE; Drizzle wraps it as `cause`.
function sqlState(error: unknown): string | null {
  for (let at = error; isRecord(at); at = at.cause) {
    if (typeof at.code === "string" && SQLSTATE.test(at.code)) return at.code;
  }
  return null;
}

// Drizzle puts the failed statement's parameters into the error message, and these actions
// carry the profile, saved programmes and feedback notes: a query error must never reach a log
// or a response as it is. The caller gets a fixed message; the log gets the action and SQLSTATE.
async function guarded<T>(action: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    console.error(`[account] ${action} failed`, { sqlState: sqlState(error) });
    throw new Error(`account action ${action} failed`);
  }
}

type Refusal = { ok: false; error: "unauthenticated" | "consent_required" | "invalid" };

// The first step of every action is the session and consent check, before any input is read.
async function withReadyAccount<Input, Result>(
  action: string,
  schema: z.ZodType<Input>,
  input: unknown,
  run: (userId: string, input: Input) => Promise<Result>,
): Promise<Result | Refusal> {
  const ready = await requireAccountReady();
  if (!ready.ok) return ready;
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return guarded(action, () => run(ready.userId, parsed.data));
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
