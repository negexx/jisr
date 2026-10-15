import { eq } from "drizzle-orm";

import type { Profile } from "@/data-schema/profile";
import {
  account,
  checklistProgress,
  feedbackReports,
  pendingSignups,
  profiles,
  savedPrograms,
  user,
  userDataState,
} from "@/db/schema";
import { normalizeEmail } from "@/lib/auth/normalize-email";

import type { AccountDb } from "./account-store";
import { byCodeUnit } from "./rows";

// The database half of the data export (GDPR Art. 20; the route handler is account-export.ts). Like
// account-store.ts it takes the database and an already-authenticated user id.
//
// Every column is named: a column added later to any of these tables (a regenerated auth schema, a
// migration) reaches the file only if it is added here on purpose. Session, verification and OAuth
// token columns, the password hash and the session's user agent and IP are never selected, and from
// `account` only the provider id and the link date are.

export const ACCOUNT_EXPORT_FORMAT = "jisr-account-export";
export const ACCOUNT_EXPORT_SCHEMA_VERSION = 1;

export type AccountExport = {
  format: typeof ACCOUNT_EXPORT_FORMAT;
  schemaVersion: typeof ACCOUNT_EXPORT_SCHEMA_VERSION;
  exportedAt: string;
  account: {
    email: string;
    emailVerified: boolean;
    name: string;
    image: string | null;
    createdAt: string;
    updatedAt: string;
    signInMethods: { provider: string; createdAt: string }[];
  };
  consent: { consentVersion: string | null; consentedAt: string | null };
  // The stored document as it is, even when this build can no longer parse it.
  profile: { data: Profile; revision: number; updatedAt: string } | null;
  savedPrograms: {
    slug: string;
    country: string;
    field: string;
    snapshotVersion: string;
    savedAt: string;
    createdAt: string;
  }[];
  checklistProgress: { programSlug: string; stepId: string; doneAt: string }[];
  feedbackReports: {
    id: string;
    record: string;
    path: string;
    sourceUrl: string;
    snapshotVersion: string;
    note: string | null;
    createdAt: string;
  }[];
  dataState: { importedAt: string | null; profileRevision: number } | null;
  // The consent and age evidence recorded before the account existed, keyed by the address.
  pendingSignup: {
    consentVersion: string | null;
    consentedAt: string | null;
    ageConfirmed: boolean;
    createdAt: string;
    expiresAt: string;
  } | null;
};

function iso(date: Date): string {
  return date.toISOString();
}

function isoOrNull(date: Date | null): string | null {
  return date === null ? null : iso(date);
}

// One read-only snapshot, so the sections never mix states from before and after a write. Null when
// the user row is gone, e.g. the account was deleted while its session was still being presented.
export async function exportAccountDataFor(
  db: AccountDb,
  userId: string,
  exportedAt: Date,
): Promise<AccountExport | null> {
  return db.transaction(
    async (tx) => {
      const [owner] = await tx
        .select({
          email: user.email,
          emailVerified: user.emailVerified,
          name: user.name,
          image: user.image,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          consentVersion: user.consentVersion,
          consentedAt: user.consentedAt,
        })
        .from(user)
        .where(eq(user.id, userId));
      if (owner === undefined) return null;

      const methods = await tx
        .select({ provider: account.providerId, createdAt: account.createdAt })
        .from(account)
        .where(eq(account.userId, userId));
      const [profileRow] = await tx
        .select({
          data: profiles.data,
          revision: profiles.revision,
          updatedAt: profiles.updatedAt,
        })
        .from(profiles)
        .where(eq(profiles.userId, userId));
      const saved = await tx
        .select({
          slug: savedPrograms.slug,
          country: savedPrograms.country,
          field: savedPrograms.field,
          snapshotVersion: savedPrograms.snapshotVersion,
          savedAt: savedPrograms.savedAt,
          createdAt: savedPrograms.createdAt,
        })
        .from(savedPrograms)
        .where(eq(savedPrograms.userId, userId));
      const ticks = await tx
        .select({
          programSlug: checklistProgress.programSlug,
          stepId: checklistProgress.stepId,
          doneAt: checklistProgress.doneAt,
        })
        .from(checklistProgress)
        .where(eq(checklistProgress.userId, userId));
      const reports = await tx
        .select({
          id: feedbackReports.id,
          record: feedbackReports.record,
          path: feedbackReports.path,
          sourceUrl: feedbackReports.sourceUrl,
          snapshotVersion: feedbackReports.snapshotVersion,
          note: feedbackReports.note,
          createdAt: feedbackReports.createdAt,
        })
        .from(feedbackReports)
        .where(eq(feedbackReports.userId, userId));
      const [state] = await tx
        .select({
          importedAt: userDataState.importedAt,
          profileRevision: userDataState.profileRevision,
        })
        .from(userDataState)
        .where(eq(userDataState.userId, userId));
      const [pending] = await tx
        .select({
          consentVersion: pendingSignups.consentVersion,
          consentedAt: pendingSignups.consentedAt,
          ageConfirmed: pendingSignups.ageConfirmed,
          createdAt: pendingSignups.createdAt,
          expiresAt: pendingSignups.expiresAt,
        })
        .from(pendingSignups)
        .where(eq(pendingSignups.email, normalizeEmail(owner.email)));

      return {
        format: ACCOUNT_EXPORT_FORMAT,
        schemaVersion: ACCOUNT_EXPORT_SCHEMA_VERSION,
        exportedAt: iso(exportedAt),
        account: {
          email: owner.email,
          emailVerified: owner.emailVerified,
          name: owner.name,
          image: owner.image,
          createdAt: iso(owner.createdAt),
          updatedAt: iso(owner.updatedAt),
          signInMethods: [...methods]
            .sort(
              (a, b) =>
                a.createdAt.getTime() - b.createdAt.getTime() || byCodeUnit(a.provider, b.provider),
            )
            .map((method) => ({ provider: method.provider, createdAt: iso(method.createdAt) })),
        },
        consent: {
          consentVersion: owner.consentVersion,
          consentedAt: isoOrNull(owner.consentedAt),
        },
        profile:
          profileRow === undefined
            ? null
            : {
                data: profileRow.data,
                revision: profileRow.revision,
                updatedAt: iso(profileRow.updatedAt),
              },
        savedPrograms: [...saved]
          .sort(
            (a, b) =>
              byCodeUnit(a.savedAt, b.savedAt) ||
              a.createdAt.getTime() - b.createdAt.getTime() ||
              byCodeUnit(a.slug, b.slug),
          )
          .map((row) => ({ ...row, createdAt: iso(row.createdAt) })),
        checklistProgress: [...ticks]
          .sort(
            (a, b) => byCodeUnit(a.programSlug, b.programSlug) || byCodeUnit(a.stepId, b.stepId),
          )
          .map((row) => ({ ...row, doneAt: iso(row.doneAt) })),
        feedbackReports: [...reports]
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || byCodeUnit(a.id, b.id))
          .map((row) => ({ ...row, createdAt: iso(row.createdAt) })),
        dataState:
          state === undefined
            ? null
            : { importedAt: isoOrNull(state.importedAt), profileRevision: state.profileRevision },
        pendingSignup:
          pending === undefined
            ? null
            : {
                consentVersion: pending.consentVersion,
                consentedAt: isoOrNull(pending.consentedAt),
                ageConfirmed: pending.ageConfirmed,
                createdAt: iso(pending.createdAt),
                expiresAt: iso(pending.expiresAt),
              },
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
