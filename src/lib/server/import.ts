"use server";

import { db } from "@/db";

import { withReadyAccount } from "./account-guard";
import { GuestImportInputSchema } from "./account-inputs";
import {
  type GuestImportPayload,
  type ImportMode,
  type ImportResult,
  importGuestDataFor,
} from "./import-store";

export type { GuestImportPayload, ImportMode, ImportResult } from "./import-store";

// Brings this device's unclaimed guest data into the signed-in account. Only a ready account
// (signed in, consent current) can import; "auto" refuses an account that already holds data with
// `has_server_data`, and only the student's explicit choice sends "replace".
export async function importGuestData(
  payload: GuestImportPayload,
  mode: ImportMode,
): Promise<ImportResult> {
  return withReadyAccount(
    "importGuestData",
    GuestImportInputSchema,
    { payload, mode },
    (userId, valid) => importGuestDataFor(db, userId, valid.payload, valid.mode),
  );
}
