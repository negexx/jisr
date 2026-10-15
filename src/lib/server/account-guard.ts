import "server-only";

import type { z } from "zod";

import { sqlState } from "./account-store";
import { requireAccountReady } from "./session";

// Shared by the account Server Action modules. It is not a "use server" module itself: every
// export of one becomes a callable endpoint, and these helpers take a callback.

// Drizzle puts the failed statement's parameters into the error message, and these actions
// carry the profile, saved programmes and feedback notes: a query error must never reach a log
// or a response as it is. The caller gets a fixed message; the log gets the action and SQLSTATE.
export async function guarded<T>(action: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    console.error(`[account] ${action} failed`, { sqlState: sqlState(error) });
    throw new Error(`account action ${action} failed`);
  }
}

export type Refusal = { ok: false; error: "unauthenticated" | "consent_required" | "invalid" };

// The first step of every action is the session and consent check, before any input is read.
export async function withReadyAccount<Input, Result>(
  action: string,
  schema: z.ZodType<Input>,
  input: unknown,
  run: (userId: string, input: Input) => Promise<Result>,
): Promise<Result | Refusal> {
  // Inside guarded(): the session lookup is a query too, and its error would carry the token.
  const ready = await guarded(action, requireAccountReady);
  if (!ready.ok) return ready;
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  return guarded(action, () => run(ready.userId, parsed.data));
}
