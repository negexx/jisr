import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import type { Profile } from "@/data-schema/profile";
import { CHECKLIST_STEP_IDS } from "@/domain/types";

import { user } from "./auth";

// Lengths below are schema bounds, not product limits: Server Actions validate tighter
// (todo 13) and these only stop an unvalidated writer from filling a row.
export const EMAIL_MAX_LENGTH = 320;
export const FEEDBACK_NOTE_MAX_LENGTH = 1000;
export const FEEDBACK_RECORD_MAX_LENGTH = 200;
export const FEEDBACK_PATH_MAX_LENGTH = 200;
export const FEEDBACK_SOURCE_URL_MAX_LENGTH = 2048;
export const SNAPSHOT_VERSION_MAX_LENGTH = 64;

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

const ownedBy = () =>
  text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });

const stepIdList = sql.raw(CHECKLIST_STEP_IDS.map((id) => `'${id}'`).join(", "));

export const profiles = pgTable("profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  data: jsonb("data").$type<Profile>().notNull(),
  // Compare-and-set counter: a write names the revision it read and bumps it by one.
  revision: integer("revision").notNull().default(0),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

// One row per saved programme. Order is saved_at, then created_at, then slug (rowsToSavedList).
export const savedPrograms = pgTable(
  "saved_programs",
  {
    userId: ownedBy(),
    slug: text("slug").notNull(),
    country: text("country").notNull(),
    field: text("field").notNull(),
    // Provenance, not a foreign key: the slug may stop existing in a newer snapshot.
    snapshotVersion: varchar("snapshot_version", { length: SNAPSHOT_VERSION_MAX_LENGTH }).notNull(),
    savedAt: date("saved_at", { mode: "string" }).notNull(),
    // Orders same-day saves; clock_timestamp() (not now()) differs per row inside one transaction.
    createdAt: timestamptz("created_at").notNull().default(sql`clock_timestamp()`),
  },
  (table) => [primaryKey({ columns: [table.userId, table.slug] })],
);

// One row per ticked step; an unticked step has no row.
export const checklistProgress = pgTable(
  "checklist_progress",
  {
    userId: ownedBy(),
    programSlug: text("program_slug").notNull(),
    stepId: text("step_id").notNull(),
    doneAt: timestamptz("done_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.programSlug, table.stepId] }),
    check("checklist_progress_step_id_check", sql`${table.stepId} in (${stepIdList})`),
  ],
);

// Identity of the reported fact = the FactRef fields (record, path, source_url) plus the
// snapshot version the student was looking at.
export const feedbackReports = pgTable(
  "feedback_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownedBy(),
    record: varchar("record", { length: FEEDBACK_RECORD_MAX_LENGTH }).notNull(),
    path: varchar("path", { length: FEEDBACK_PATH_MAX_LENGTH }).notNull(),
    sourceUrl: varchar("source_url", { length: FEEDBACK_SOURCE_URL_MAX_LENGTH }).notNull(),
    snapshotVersion: varchar("snapshot_version", { length: SNAPSHOT_VERSION_MAX_LENGTH }).notNull(),
    note: varchar("note", { length: FEEDBACK_NOTE_MAX_LENGTH }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [index("feedback_reports_user_created_idx").on(table.userId, table.createdAt)],
);

// Pre-account: keyed by the normalised email (normalizeEmail), so it has no user FK and
// is not erased by account deletion. Rows expire lazily (expires_at), no sweeper.
export const pendingSignups = pgTable("pending_signups", {
  email: varchar("email", { length: EMAIL_MAX_LENGTH }).primaryKey(),
  consentVersion: text("consent_version"),
  consentedAt: timestamptz("consented_at"),
  ageConfirmed: boolean("age_confirmed").notNull().default(false),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  expiresAt: timestamptz("expires_at").notNull(),
});

export const AUTH_EMAIL_KINDS = ["magic-link", "delete-account"] as const;
export type AuthEmailKind = (typeof AUTH_EMAIL_KINDS)[number];

const authEmailKindList = sql.raw(AUTH_EMAIL_KINDS.map((kind) => `'${kind}'`).join(", "));

// Pre-account, keyed by the normalised email (normalizeEmail) and the kind of email, so it has
// no user FK and is not erased by account deletion (todo 19 deletes it explicitly). One row per
// (address, kind) records when the last auth email was released; claimEmailSendSlot is the only
// writer and enforces the resend cooldown atomically.
export const emailCooldowns = pgTable(
  "email_cooldowns",
  {
    email: varchar("email", { length: EMAIL_MAX_LENGTH }).notNull(),
    kind: text("kind").notNull(),
    lastSentAt: timestamptz("last_sent_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.email, table.kind] }),
    check("email_cooldowns_kind_check", sql`${table.kind} in (${authEmailKindList})`),
  ],
);

// One row per UTC day: how many auth emails were released that day, across every address and kind
// (claimDailyEmailSlot is the only writer). Holds no personal data; rows of past days are deleted
// on a later send.
export const authEmailDays = pgTable(
  "auth_email_days",
  {
    day: date("day", { mode: "string" }).primaryKey(),
    sent: integer("sent").notNull().default(0),
  },
  (table) => [check("auth_email_days_sent_check", sql`${table.sent} >= 0`)],
);

export const userDataState = pgTable("user_data_state", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  // Set once when the guest data was imported; null means the import has not happened (or the
  // account's data was cleared since).
  importedAt: timestamptz("imported_at"),
  // The highest revision a deleted profile row of this user had. A new profile row starts above it,
  // so revisions never repeat and a device still holding an old one gets `conflict`.
  profileRevision: integer("profile_revision").notNull().default(0),
});
