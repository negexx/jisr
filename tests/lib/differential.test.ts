import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { isValidIsoDate } from "@/data-schema/dates";
import { CountryCodeSchema, IsoDateSchema, SlugSchema } from "@/data-schema/primitives";
import { ProfileSchema } from "@/data-schema/profile";
import { ManifestSchema } from "@/data-schema/snapshot";
import { CHECKLIST_STEP_IDS, type ChecklistStepId } from "@/domain/types";
import { readGuestData } from "@/lib/account-import/guest-data";
import { safeReturnPath } from "@/lib/auth/callback-urls";
import { looksLikeEmail } from "@/lib/auth/email-shape";
import { forgetSession, lookupSession } from "@/lib/auth/session-client";
import {
  ACCOUNT_FIELD_MAX_LENGTH,
  ACCOUNT_PROFILE_JSON_LIMIT,
  ACCOUNT_SLUG_MAX_LENGTH,
  LOCALES,
  MAX_SAVED_PROGRAMS,
  PLAN_SCHEMA_VERSION,
  SAVED_SCHEMA_VERSION,
} from "@/lib/constants";
import { MAX_PLAN_PROGRAMS, PLAN_KEY, parsePlanProgress } from "@/lib/plan/progress";
import { parseAccountProfile } from "@/lib/profile/account-profile";
import { PROFILE_KEY } from "@/lib/profile/storage";
import { parseSaved, SAVED_KEY } from "@/lib/saved/saved";
import {
  GuestImportPayloadSchema,
  SavedProgramInputSchema,
  SignInEmailSchema,
} from "@/lib/server/account-inputs";
import {
  type ChecklistProgressRow,
  type ProfileRow,
  rowsToPlanProgress,
  rowsToSavedList,
  rowToProfile,
  type SavedProgramRow,
} from "@/lib/server/rows";

import { E2E_PROFILE } from "../fixtures/e2e/profiles";
import { compare, fuzz, mutate, newTally, preview, type Rng, seededRng } from "./differential";
import { createFakeStorage } from "./profile/fake-storage";

// The browser reads account data with hand-written, Zod-free parsers (client-reachable code may not
// import Zod: tests/lib/client-imports.test.ts). The server checks the same documents with Zod. These
// tests hold the two sides together in the pattern of tests/lib/profile/validate.test.ts: a table of
// hand-picked inputs, then seeded mutation fuzzing, and `compare` / `fuzz` fail at the input where
// the parser and its twin disagree.
//
//   - parseSaved, parsePlanProgress and parseAccountProfile (the jisr.* and jisr.account.* caches)
//     against Zod twins written here. The first two repair a document instead of refusing it, and
//     their twins say how.
//   - Those parsers against the server's input schemas: a document the server accepts is read back
//     unchanged, and what the browser keeps is accepted by the server, except a slug or a field
//     longer than the server's bound (readGuestData leaves those out of an import).
//   - looksLikeEmail against the sign-in schema (never stricter), safeReturnPath against the URL
//     parser, the consent fields of lookupSession against a Zod twin, and rows read from the
//     database through the parsers.
//
// The import scanner has its own file (differential-scanner.test.ts). Already covered elsewhere:
// parseProfile (tests/lib/profile/validate.test.ts), parseDraft (draft-validate.test.ts) and
// parseManifest, aliases included (tests/lib/snapshot/manifest-guard.test.ts).

const VERSION = "0123456789ab";
const OLDER_VERSION = "ba9876543210";

type Json = Record<string, unknown>;

function isJson(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// JSON.parse makes "__proto__" an own key, which is how it reaches the browser from storage.
function withOwnProto(base: unknown): unknown {
  return JSON.parse(`${JSON.stringify(base).slice(0, -1)},"__proto__":{"polluted":true}}`);
}

// An array with a hole after its first element, as JSON.parse never makes but a caller can.
function sparse(first: unknown, last: unknown): unknown[] {
  const items: unknown[] = [first];
  items[2] = last;
  return items;
}

const pickFrom = <T>(rng: Rng, items: readonly T[]): T =>
  items[Math.floor(rng() * items.length)] as T;

// The parsers only repair what they can name; this counts the fuzz cases that reached a repair.
function changedBy(parse: (input: unknown) => unknown): (input: unknown) => boolean {
  return (input) => JSON.stringify(parse(input)) !== JSON.stringify(input);
}

// ---------------------------------------------------------------------------------------------
// Saved programmes: parseSaved (jisr.saved and jisr.account.saved)
// ---------------------------------------------------------------------------------------------

function savedItem(slug: string, overrides: Json = {}): Json {
  return {
    slug,
    country: "FR",
    field: "computer-science",
    snapshotVersion: VERSION,
    savedAt: "2026-10-02",
    ...overrides,
  };
}

const savedList = (...items: unknown[]): Json => ({ schemaVersion: 1, items });

const SAVED_BASE = savedList(
  savedItem("xx-a"),
  savedItem("xx-b", { country: "DE", field: "engineering", savedAt: "2026-10-03" }),
  savedItem("xx-c", { snapshotVersion: OLDER_VERSION }),
);

// The same rules as parseSaved, stated with Zod. A bad item is dropped, not fatal, so the document
// is a strict envelope around items that are each checked on their own, then deduplicated by slug
// and capped. Item bounds are the guest's: only the server bounds the length of a slug or a field.
const SavedItemTwin = z.strictObject({
  slug: SlugSchema,
  country: CountryCodeSchema,
  field: SlugSchema,
  // A row's version is a manifest's version: one format for both.
  snapshotVersion: ManifestSchema.shape.snapshotVersion,
  savedAt: IsoDateSchema,
});

const SavedListTwin = z
  .strictObject({ schemaVersion: z.literal(1), items: z.array(z.unknown()) })
  .transform(({ items }) => {
    const seen = new Set<string>();
    const kept: z.output<typeof SavedItemTwin>[] = [];
    for (const item of items) {
      if (kept.length >= 12) break;
      const parsed = SavedItemTwin.safeParse(item);
      if (!parsed.success || seen.has(parsed.data.slug)) continue;
      seen.add(parsed.data.slug);
      kept.push(parsed.data);
    }
    return { schemaVersion: 1, items: kept };
  });

const manyItems = (count: number) =>
  Array.from({ length: count }, (_, index) => savedItem(`xx-p${index}`));

// Documents the twin accepts; a bad item inside one is repaired (dropped), not fatal.
const SAVED_VALID: Array<[string, unknown]> = [
  ["empty list", savedList()],
  ["three programmes", SAVED_BASE],
  [
    "a programme saved against an older snapshot",
    savedList(savedItem("xx-a", { snapshotVersion: OLDER_VERSION })),
  ],
  ["twelve programmes", savedList(...manyItems(12))],
  ["thirteen programmes: only the first twelve are kept", savedList(...manyItems(13))],
  [
    "a duplicate slug: the second is dropped",
    savedList(savedItem("xx-a"), savedItem("xx-a", { country: "DE" })),
  ],
  [
    "a lowercase country is dropped",
    savedList(savedItem("xx-a", { country: "fr" }), savedItem("xx-b")),
  ],
  [
    "three letters of country are dropped",
    savedList(savedItem("xx-a", { country: "FRA" }), savedItem("xx-b")),
  ],
  [
    "an impossible date is dropped",
    savedList(savedItem("xx-a", { savedAt: "2026-02-30" }), savedItem("xx-b")),
  ],
  [
    "a date with a time is dropped",
    savedList(savedItem("xx-a", { savedAt: "2026-10-02T10:00:00Z" }), savedItem("xx-b")),
  ],
  [
    "a short version is dropped",
    savedList(savedItem("xx-a", { snapshotVersion: "0123456789a" }), savedItem("xx-b")),
  ],
  [
    "an uppercase version is dropped",
    savedList(savedItem("xx-a", { snapshotVersion: "0123456789AB" }), savedItem("xx-b")),
  ],
  [
    "a version with a trailing newline is dropped",
    savedList(savedItem("xx-a", { snapshotVersion: `${VERSION}\n` }), savedItem("xx-b")),
  ],
  ["a bad slug is dropped", savedList(savedItem("Xx-A"), savedItem("xx-b"))],
  [
    "a bad field is dropped",
    savedList(savedItem("xx-a", { field: "Computer Science" }), savedItem("xx-b")),
  ],
  ["an extra item key is dropped", savedList(savedItem("xx-a", { note: "x" }), savedItem("xx-b"))],
  ["a missing item key is dropped", savedList({ slug: "xx-a", country: "FR" }, savedItem("xx-b"))],
  [
    "an item with an own __proto__ key is dropped",
    savedList(withOwnProto(savedItem("xx-a")), savedItem("xx-b")),
  ],
  [
    "items that are not objects are dropped",
    savedList(null, 3, "xx-a", [], undefined, savedItem("xx-b")),
  ],
  [
    "an item with a slug of 200 characters is kept: only the server bounds it",
    savedList(savedItem("x".repeat(200))),
  ],
  [
    "a sparse items array",
    { schemaVersion: 1, items: sparse(savedItem("xx-a"), savedItem("xx-b")) },
  ],
  ["inherited keys that are all in the shape", Object.create(SAVED_BASE)],
  ["a symbol key on the document is ignored", { ...SAVED_BASE, [Symbol("ignored")]: 1 }],
  ["a class instance as the document", Object.assign(new (class Loaded {})(), SAVED_BASE)],
];

const SAVED_INVALID: Array<[string, unknown]> = [
  ["null", null],
  ["undefined", undefined],
  ["a string", "saved"],
  ["a number", 1],
  ["an array", [SAVED_BASE]],
  ["an empty object", {}],
  ["schemaVersion 2", { ...SAVED_BASE, schemaVersion: 2 }],
  ["schemaVersion 0", { ...SAVED_BASE, schemaVersion: 0 }],
  ["schemaVersion as a string", { ...SAVED_BASE, schemaVersion: "1" }],
  ["a missing schemaVersion", { items: [] }],
  ["an unknown key", { ...SAVED_BASE, extra: 1 }],
  ["an own __proto__ key", withOwnProto(SAVED_BASE)],
  ["an inherited extra key", Object.assign(Object.create({ extra: 1 }), SAVED_BASE)],
  ["items missing", { schemaVersion: 1 }],
  ["items null", { schemaVersion: 1, items: null }],
  ["items an object", { schemaVersion: 1, items: {} }],
  ["items a string", { schemaVersion: 1, items: "xx-a" }],
];

describe("parseSaved against its Zod twin", () => {
  it("shares the schema version and the cap with the twin", () => {
    expect(SAVED_SCHEMA_VERSION).toBe(1);
    expect(MAX_SAVED_PROGRAMS).toBe(12);
  });

  it("agrees with the twin on every table row, and repairs a list where the twin does", () => {
    const tally = newTally();
    for (const [label, input] of [...SAVED_VALID, ...SAVED_INVALID]) {
      compare(SavedListTwin, parseSaved, input, label, tally);
    }
    expect(tally.disagreements).toEqual([]);
    expect(tally.accepted).toBe(SAVED_VALID.length);
    expect(tally.rejected).toBe(SAVED_INVALID.length);
  });

  it("agrees with the twin on 4000 seeded mutations of a saved list", () => {
    const tally = fuzz(
      SavedListTwin,
      parseSaved,
      SAVED_BASE,
      4000,
      20261015,
      changedBy(parseSaved),
    );
    expect(tally.disagreements).toEqual([]);
    expect(tally.accepted).toBeGreaterThan(300);
    expect(tally.rejected).toBeGreaterThan(300);
    expect(tally.probed).toBeGreaterThan(100);
  });

  it("agrees with the twin on 1500 seeded mutations of a full list", () => {
    const tally = fuzz(SavedListTwin, parseSaved, savedList(...manyItems(12)), 1500, 7);
    expect(tally.disagreements).toEqual([]);
    expect(tally.accepted).toBeGreaterThan(100);
  });
});

// What the browser keeps and what the server accepts. The server's input schemas are tighter in one
// way only: the length of a slug and of a field.
function overBounds(item: unknown): boolean {
  if (!isJson(item)) return false;
  const { slug, field } = item;
  return (
    (typeof slug === "string" && slug.length > ACCOUNT_SLUG_MAX_LENGTH) ||
    (typeof field === "string" && field.length > ACCOUNT_FIELD_MAX_LENGTH)
  );
}

function withinBounds(item: Json): Json {
  const { slug, field } = item;
  return {
    ...item,
    slug: typeof slug === "string" && slug.length > ACCOUNT_SLUG_MAX_LENGTH ? "xx-a" : slug,
    field:
      typeof field === "string" && field.length > ACCOUNT_FIELD_MAX_LENGTH
        ? "computer-science"
        : field,
  };
}

const ONE_TICK = { "xx-z": ["visa"] };
const ONE_SAVED = savedItem("xx-z");

function serverAcceptsSaved(items: unknown): boolean {
  return GuestImportPayloadSchema.safeParse({ profile: null, saved: items, plan: ONE_TICK })
    .success;
}

describe("parseSaved against the server's schemas", () => {
  it("keeps every programme the server accepts, and keeps nothing else but over-long slugs and fields", () => {
    const rng = seededRng(20261016);
    const problems: string[] = [];
    let serverAccepted = 0;
    let boundsOnly = 0;
    for (let index = 0; index < 4000; index += 1) {
      const candidate = mutate(savedItem("xx-a"), rng, 1 + Math.floor(rng() * 3));
      const server = SavedProgramInputSchema.safeParse(candidate).success;
      const client = parseSaved(savedList(candidate))?.items.length === 1;
      if (server) serverAccepted += 1;
      if (server && !client)
        problems.push(`dropped a programme the server accepts: ${preview(candidate)}`);
      if (client && !server) {
        const explained =
          isJson(candidate) &&
          overBounds(candidate) &&
          SavedProgramInputSchema.safeParse(withinBounds(candidate)).success;
        if (explained) boundsOnly += 1;
        else
          problems.push(
            `kept a programme the server refuses for another reason: ${preview(candidate)}`,
          );
      }
    }
    expect(problems).toEqual([]);
    expect(serverAccepted).toBeGreaterThan(200);
    expect(boundsOnly).toBeGreaterThan(0);
  });

  it("returns a list the server accepts, and a list the server accepts comes back unchanged", () => {
    const rng = seededRng(20261017);
    const problems: string[] = [];
    let identical = 0;
    for (let index = 0; index < 3000; index += 1) {
      const doc = mutate(SAVED_BASE, rng, 1 + Math.floor(rng() * 3));
      const parsed = parseSaved(doc);
      if (parsed !== null && !serverAcceptsSaved(parsed.items) && !parsed.items.some(overBounds)) {
        problems.push(`the browser keeps a list the server refuses: ${preview(parsed)}`);
      }
      const items = isJson(doc) ? doc.items : undefined;
      if (Array.isArray(items) && serverAcceptsSaved(items)) {
        identical += 1;
        const again = parseSaved({ schemaVersion: 1, items });
        if (JSON.stringify(again) !== JSON.stringify({ schemaVersion: 1, items })) {
          problems.push(`a list the server accepts is changed by the browser: ${preview(items)}`);
        }
      }
    }
    expect(problems).toEqual([]);
    expect(identical).toBeGreaterThan(100);
  });

  it("uses one version format for a manifest and for a saved row", () => {
    const version = ManifestSchema.shape.snapshotVersion;
    for (const value of [VERSION, OLDER_VERSION, "000000000000", "ffffffffffff"]) {
      expect(version.safeParse(value).success).toBe(true);
      expect(
        SavedProgramInputSchema.safeParse(savedItem("xx-a", { snapshotVersion: value })).success,
      ).toBe(true);
      expect(
        parseSaved(savedList(savedItem("xx-a", { snapshotVersion: value })))?.items,
      ).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Ticked steps: parsePlanProgress (jisr.plan and jisr.account.plan)
// ---------------------------------------------------------------------------------------------

const planDoc = (done: unknown): Json => ({ schemaVersion: 1, done });
const PLAN_BASE = planDoc({ "xx-a": ["documents", "visa"], "xx-b": ["submit"] });

const StepTwin = z.enum(CHECKLIST_STEP_IDS);

// The same rules as parsePlanProgress: a strict envelope around a plain object whose entries are
// each repaired on their own (a bad slug, a value that is not a list, unknown or repeated steps and
// an empty list are dropped, steps come back in checklist order), at most 50 programmes.
const PlanTwin = z
  .strictObject({ schemaVersion: z.literal(1), done: z.record(z.string(), z.unknown()) })
  .transform(({ done }) => {
    const kept: Record<string, ChecklistStepId[]> = {};
    for (const [slug, value] of Object.entries(done)) {
      if (Object.keys(kept).length >= 50) break;
      const steps = z.array(z.unknown()).safeParse(value);
      if (!SlugSchema.safeParse(slug).success || !steps.success) continue;
      const valid = new Set(steps.data.filter((step) => StepTwin.safeParse(step).success));
      const ordered = CHECKLIST_STEP_IDS.filter((id) => valid.has(id));
      if (ordered.length > 0) kept[slug] = ordered;
    }
    return { schemaVersion: 1, done: kept };
  });

const manyPrograms = (count: number) =>
  Object.fromEntries(Array.from({ length: count }, (_, index) => [`xx-p${index}`, ["visa"]]));

// Documents the twin accepts; a bad entry inside one is repaired (dropped), not fatal.
const PLAN_VALID: Array<[string, unknown]> = [
  ["no ticks", planDoc({})],
  ["two programmes", PLAN_BASE],
  ["steps out of checklist order", planDoc({ "xx-a": ["visa", "documents", "submit"] })],
  ["every step", planDoc({ "xx-a": [...CHECKLIST_STEP_IDS] })],
  ["a repeated step is dropped", planDoc({ "xx-a": ["visa", "visa"] })],
  [
    "an unknown and a non-string step are dropped",
    planDoc({ "xx-a": ["visa", "lunch", 3, null, {}] }),
  ],
  [
    "a programme whose steps are all unknown is dropped",
    planDoc({ "xx-a": ["lunch"], "xx-b": ["visa"] }),
  ],
  ["an empty list is dropped", planDoc({ "xx-a": [], "xx-b": ["visa"] })],
  [
    "a value that is not a list is dropped",
    planDoc({ "xx-a": "visa", "xx-b": { visa: true }, "xx-c": ["visa"] }),
  ],
  ["a bad slug is dropped", planDoc({ "Xx A": ["visa"], "xx-b": ["visa"] })],
  ["an empty slug is dropped", planDoc({ "": ["visa"] })],
  [
    "a slug of 200 characters is kept: only the server bounds it",
    planDoc({ ["x".repeat(200)]: ["visa"] }),
  ],
  ["a slug named like an Object property", planDoc({ constructor: ["visa"], toString: ["visa"] })],
  [
    "an own __proto__ key is dropped",
    JSON.parse('{"schemaVersion":1,"done":{"__proto__":["visa"],"xx-a":["visa"]}}'),
  ],
  [
    "slugs that look like array indexes",
    planDoc({ b: ["visa"], "2": ["visa"], a: ["visa"], "1": ["visa"] }),
  ],
  ["fifty programmes", planDoc(manyPrograms(50))],
  ["fifty-one programmes: only the first fifty are kept", planDoc(manyPrograms(51))],
  [
    "fifty-one programmes with a bad one first: the cap counts the kept",
    planDoc({ "Bad Slug": ["visa"], ...manyPrograms(50) }),
  ],
  ["a sparse step list", planDoc({ "xx-a": sparse("visa", "documents") })],
  ["a null-prototype done", planDoc(Object.assign(Object.create(null), { "xx-a": ["visa"] }))],
  [
    "a non-enumerable programme is ignored",
    planDoc(
      Object.defineProperty({ "xx-a": ["visa"] }, "xx-hidden", {
        value: ["visa"],
        enumerable: false,
      }),
    ),
  ],
  ["inherited programmes are ignored", planDoc(Object.create({ "xx-inherited": ["visa"] }))],
  ["inherited keys that are all in the shape", Object.create(PLAN_BASE)],
  ["a symbol key on the document is ignored", { ...PLAN_BASE, [Symbol("ignored")]: 1 }],
];

const PLAN_INVALID: Array<[string, unknown]> = [
  ["null", null],
  ["undefined", undefined],
  ["a string", "plan"],
  ["a number", 1],
  ["an array", [PLAN_BASE]],
  ["an empty object", {}],
  ["schemaVersion 2", { ...PLAN_BASE, schemaVersion: 2 }],
  ["schemaVersion as a string", { ...PLAN_BASE, schemaVersion: "1" }],
  ["a missing schemaVersion", { done: {} }],
  ["an unknown key", { ...PLAN_BASE, extra: 1 }],
  ["an own __proto__ key", withOwnProto(PLAN_BASE)],
  ["an inherited extra key", Object.assign(Object.create({ extra: 1 }), PLAN_BASE)],
  ["done missing", { schemaVersion: 1 }],
  ["done null", planDoc(null)],
  ["done an array", planDoc([])],
  ["done an array of lists", planDoc([["visa"]])],
  ["done a string", planDoc("xx-a")],
  ["done a class instance", planDoc(new (class Done {})())],
];

describe("parsePlanProgress against its Zod twin", () => {
  it("shares the schema version, the cap and the step ids with the twin", () => {
    expect(PLAN_SCHEMA_VERSION).toBe(1);
    expect(MAX_PLAN_PROGRAMS).toBe(50);
    expect(StepTwin.options).toEqual([...CHECKLIST_STEP_IDS]);
  });

  it("agrees with the twin on every table row", () => {
    const tally = newTally();
    for (const [label, input] of [...PLAN_VALID, ...PLAN_INVALID]) {
      compare(PlanTwin, parsePlanProgress, input, label, tally);
    }
    expect(tally.disagreements).toEqual([]);
    expect(tally.accepted).toBe(PLAN_VALID.length);
    expect(tally.rejected).toBe(PLAN_INVALID.length);
  });

  it("agrees with the twin on 4000 seeded mutations of a plan", () => {
    const tally = fuzz(
      PlanTwin,
      parsePlanProgress,
      PLAN_BASE,
      4000,
      20261015,
      changedBy(parsePlanProgress),
    );
    expect(tally.disagreements).toEqual([]);
    expect(tally.accepted).toBeGreaterThan(300);
    expect(tally.rejected).toBeGreaterThan(300);
    expect(tally.probed).toBeGreaterThan(100);
  });

  it("agrees with the twin on 1500 seeded mutations of a plan with every step ticked", () => {
    const base = planDoc({ "xx-a": [...CHECKLIST_STEP_IDS], "xx-b": [...CHECKLIST_STEP_IDS] });
    const tally = fuzz(PlanTwin, parsePlanProgress, base, 1500, 11, changedBy(parsePlanProgress));
    expect(tally.disagreements).toEqual([]);
    expect(tally.probed).toBeGreaterThan(50);
  });

  // The one place z.record is stricter than the parser, and not reachable from storage: JSON has no
  // symbol keys, and the stores only write objects built in code.
  it("ignores an enumerable symbol key on done, where z.record refuses the whole document", () => {
    const done = { "xx-a": ["visa"], [Symbol("k")]: ["visa"] };
    expect(PlanTwin.safeParse(planDoc(done)).success).toBe(false);
    expect(parsePlanProgress(planDoc(done))).toEqual(planDoc({ "xx-a": ["visa"] }));
  });
});

const stepsInChecklistOrder = (steps: readonly string[]) =>
  CHECKLIST_STEP_IDS.filter((id) => steps.includes(id));

function serverAcceptsPlan(done: unknown): boolean {
  return GuestImportPayloadSchema.safeParse({ profile: null, saved: [ONE_SAVED], plan: done })
    .success;
}

function hasLongSlug(done: Record<string, unknown>): boolean {
  return Object.keys(done).some((slug) => slug.length > ACCOUNT_SLUG_MAX_LENGTH);
}

describe("parsePlanProgress against the server's schema", () => {
  it("returns ticks the server accepts, and ticks the server accepts come back as they were, in checklist order", () => {
    const rng = seededRng(20261018);
    const problems: string[] = [];
    let identical = 0;
    for (let index = 0; index < 4000; index += 1) {
      const doc = mutate(PLAN_BASE, rng, 1 + Math.floor(rng() * 3));
      const parsed = parsePlanProgress(doc);
      if (parsed !== null && !serverAcceptsPlan(parsed.done) && !hasLongSlug(parsed.done)) {
        problems.push(`the browser keeps ticks the server refuses: ${preview(parsed)}`);
      }
      const done = isJson(doc) ? doc.done : undefined;
      const server = GuestImportPayloadSchema.safeParse({
        profile: null,
        saved: [ONE_SAVED],
        plan: done,
      });
      if (server.success) {
        identical += 1;
        const expected = Object.fromEntries(
          Object.entries(server.data.plan).map(([slug, steps]) => [
            slug,
            stepsInChecklistOrder(steps),
          ]),
        );
        const again = parsePlanProgress({ schemaVersion: 1, done });
        if (JSON.stringify(again) !== JSON.stringify({ schemaVersion: 1, done: expected })) {
          problems.push(`ticks the server accepts are changed by the browser: ${preview(done)}`);
        }
      }
    }
    expect(problems).toEqual([]);
    expect(identical).toBeGreaterThan(100);
  });

  it("keeps a slug longer than the server's bound, the one thing it keeps that the server refuses", () => {
    const tooLong = "x".repeat(ACCOUNT_SLUG_MAX_LENGTH + 1);
    const parsed = parsePlanProgress(planDoc({ [tooLong]: ["visa"], "xx-a": ["visa"] }));
    expect(Object.keys(parsed?.done ?? {})).toEqual([tooLong, "xx-a"]);
    expect(serverAcceptsPlan(parsed?.done)).toBe(false);
    expect(serverAcceptsPlan({ "xx-a": ["visa"] })).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// The signed-in profile cache: parseAccountProfile (jisr.account.profile)
// ---------------------------------------------------------------------------------------------

const accountProfile = (overrides: Json = {}): Json => ({
  schemaVersion: 1,
  profile: E2E_PROFILE,
  revision: 3,
  ...overrides,
});
const ACCOUNT_PROFILE_BASE = accountProfile();

// Strict: the profile is the one parseProfile is proven equal to, the revision a non-negative
// safe integer. A cache that does not parse is dropped and the next hydration replaces it.
const AccountProfileTwin = z.strictObject({
  schemaVersion: z.literal(1),
  profile: ProfileSchema.nullable(),
  revision: z.number().int().min(0),
});

const ACCOUNT_PROFILE_VALID: Array<[string, unknown]> = [
  ["a profile at revision 3", ACCOUNT_PROFILE_BASE],
  ["no profile yet", accountProfile({ profile: null, revision: 0 })],
  ["revision 0 with a profile", accountProfile({ revision: 0 })],
  ["revision 2147483647 (Postgres integer)", accountProfile({ revision: 2_147_483_647 })],
  ["the largest safe revision", accountProfile({ revision: Number.MAX_SAFE_INTEGER })],
  ["revision negative zero", accountProfile({ revision: -0 })],
  ["inherited keys that are all in the shape", Object.create(ACCOUNT_PROFILE_BASE)],
  ["a symbol key is ignored", { ...ACCOUNT_PROFILE_BASE, [Symbol("ignored")]: 1 }],
  [
    "a class instance as the document",
    Object.assign(new (class Cached {})(), ACCOUNT_PROFILE_BASE),
  ],
];

const ACCOUNT_PROFILE_INVALID: Array<[string, unknown]> = [
  ["null", null],
  ["undefined", undefined],
  ["a string", "profile"],
  ["a number", 1],
  ["an array", [ACCOUNT_PROFILE_BASE]],
  ["an empty object", {}],
  ["the bare profile (a guest document)", E2E_PROFILE],
  [
    "a cache holding a v1 profile document",
    accountProfile({
      profile: {
        ...E2E_PROFILE,
        schemaVersion: 1,
        fields: ["xx-test-field-cs"],
        studyLanguages: ["fr"],
        destinations: ["XB"],
        institutionType: "public",
        budget: null,
      },
    }),
  ],
  ["schemaVersion 2", accountProfile({ schemaVersion: 2 })],
  ["schemaVersion as a string", accountProfile({ schemaVersion: "1" })],
  ["a missing schemaVersion", { profile: null, revision: 0 }],
  ["an unknown key", accountProfile({ extra: 1 })],
  ["an own __proto__ key", withOwnProto(ACCOUNT_PROFILE_BASE)],
  ["an inherited extra key", Object.assign(Object.create({ extra: 1 }), ACCOUNT_PROFILE_BASE)],
  ["a missing profile", { schemaVersion: 1, revision: 1 }],
  ["profile undefined", accountProfile({ profile: undefined })],
  [
    "a profile that fails the schema",
    accountProfile({ profile: { ...E2E_PROFILE, nationality: "x" } }),
  ],
  ["a profile with an extra key", accountProfile({ profile: { ...E2E_PROFILE, extra: 1 } })],
  ["a profile as a string", accountProfile({ profile: JSON.stringify(E2E_PROFILE) })],
  ["revision negative", accountProfile({ revision: -1 })],
  ["revision a float", accountProfile({ revision: 1.5 })],
  ["revision NaN", accountProfile({ revision: Number.NaN })],
  ["revision Infinity", accountProfile({ revision: Number.POSITIVE_INFINITY })],
  ["revision unsafe", accountProfile({ revision: 2 ** 53 })],
  ["revision a string", accountProfile({ revision: "3" })],
  ["revision null", accountProfile({ revision: null })],
  ["a missing revision", { schemaVersion: 1, profile: null }],
];

describe("parseAccountProfile against its Zod twin", () => {
  it("accepts and returns an equal copy of a valid cache", () => {
    for (const [label, input] of ACCOUNT_PROFILE_VALID) {
      const oracle = AccountProfileTwin.safeParse(input);
      expect(oracle.success, label).toBe(true);
      expect(parseAccountProfile(input), label).toEqual(oracle.data);
    }
  });

  it("agrees with the twin on every table row", () => {
    const tally = newTally();
    for (const [label, input] of [...ACCOUNT_PROFILE_VALID, ...ACCOUNT_PROFILE_INVALID]) {
      compare(AccountProfileTwin, parseAccountProfile, input, label, tally);
    }
    expect(tally.disagreements).toEqual([]);
    expect(tally.accepted).toBe(ACCOUNT_PROFILE_VALID.length);
    expect(tally.rejected).toBe(ACCOUNT_PROFILE_INVALID.length);
  });

  it("agrees with the twin on 4000 seeded mutations of a cached profile", () => {
    const tally = fuzz(
      AccountProfileTwin,
      parseAccountProfile,
      ACCOUNT_PROFILE_BASE,
      4000,
      20261015,
    );
    expect(tally.disagreements).toEqual([]);
    expect(tally.accepted).toBeGreaterThan(100);
    expect(tally.rejected).toBeGreaterThan(1000);
  });

  it("agrees with the twin on 1000 seeded mutations of a cache with no profile", () => {
    const base = accountProfile({ profile: null, revision: 0 });
    const tally = fuzz(AccountProfileTwin, parseAccountProfile, base, 1000, 5);
    expect(tally.disagreements).toEqual([]);
    expect(tally.accepted).toBeGreaterThan(20);
  });

  it("rejects a cache holding a v1 profile document, so the store re-hydrates from the server", () => {
    const cached = accountProfile({
      profile: { ...E2E_PROFILE, schemaVersion: 1 },
    });
    expect(parseAccountProfile(cached)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// The sign-in address: looksLikeEmail (the form's first pass) against what the server accepts
// ---------------------------------------------------------------------------------------------

const LOCAL_PARTS = [
  "name",
  "Name",
  "first.last",
  "a+tag",
  "o'brien",
  "x_y",
  "a-b",
  "1",
  "é",
  "a..b",
  ".a",
  "a.",
  "a b",
  "a@b",
  "-a",
  "a-",
  "a".repeat(64),
  "",
  "名前",
];
const DOMAINS = [
  "example.com",
  "sub.example.ma",
  "example",
  "example..com",
  "-bad.com",
  "bad-.com",
  "ex ample.com",
  "example.c",
  "example.123",
  "EXAMPLE.COM",
  "a.b.c.d.e",
  "xn--p1ai.xn--p1ai",
  "é.com",
  ".com",
  "example.com.",
  "",
  `${"a".repeat(63)}.com`,
];
const PADDINGS = ["", " ", "\t", "\n", "\u00a0", "\u3000", "\u200b"];
const EMAIL_ALPHABET = [
  "a",
  "B",
  "7",
  ".",
  "-",
  "_",
  "+",
  "'",
  "@",
  " ",
  "\t",
  "é",
  "\u00a0",
  "!",
  "\\",
  '"',
  ",",
];

function emailCandidates(rng: Rng): string[] {
  const grid = LOCAL_PARTS.flatMap((local) =>
    DOMAINS.flatMap((domain) =>
      PADDINGS.map((padding) => `${padding}${local}@${domain}${padding}`),
    ),
  );
  const edited = Array.from({ length: 4000 }, () => {
    const base = Array.from(
      `${LOCAL_PARTS[Math.floor(rng() * 5)]}@${DOMAINS[Math.floor(rng() * 3)]}`,
    );
    for (let round = 1 + Math.floor(rng() * 3); round > 0; round -= 1) {
      const at = Math.floor(rng() * (base.length + 1));
      const character = EMAIL_ALPHABET[Math.floor(rng() * EMAIL_ALPHABET.length)] ?? "";
      if (rng() < 0.4) base.splice(at, 1);
      else base.splice(at, rng() < 0.5 ? 1 : 0, character);
    }
    return base.join("");
  });
  return [
    ...grid,
    ...edited,
    "x".repeat(321),
    `${"a".repeat(300)}@example.com`,
    `${"a".repeat(310)}@ex.com`,
  ];
}

describe("looksLikeEmail against SignInEmailSchema", () => {
  it("never rejects an address the server accepts (it may accept more: it is a first pass)", () => {
    const problems: string[] = [];
    let both = 0;
    let looserOnly = 0;
    for (const candidate of emailCandidates(seededRng(20261015))) {
      const server = SignInEmailSchema.safeParse(candidate).success;
      const client = looksLikeEmail(candidate);
      if (server && client) both += 1;
      if (server && !client)
        problems.push(`the form refuses an address the server accepts: ${preview(candidate)}`);
      if (client && !server) looserOnly += 1;
    }
    expect(problems).toEqual([]);
    expect(both).toBeGreaterThan(500);
    expect(looserOnly).toBeGreaterThan(50);
  });
});

// ---------------------------------------------------------------------------------------------
// The sign-in return path: safeReturnPath against the platform's URL parser
// ---------------------------------------------------------------------------------------------

const SITE = "https://jisr.example";

// The reference for "stays on this site": the WHATWG URL parser, which also turns backslashes into
// slashes, drops tabs and newlines, and resolves dot segments (escaped or not). A path is untouched
// when parsing it against the site changes neither the origin nor a single character.
function stayOnSite(path: string): URL | null {
  try {
    const url = new URL(path, SITE);
    return url.origin === SITE && `${url.pathname}${url.search}${url.hash}` === path ? url : null;
  } catch {
    return null;
  }
}

const WEIRD_SEGMENTS = [
  "..",
  ".",
  "%2e%2e",
  "%2E",
  "%2f",
  "%5c",
  "%",
  "%00",
  "a b",
  "a\tb",
  "a\nb",
  "a\\b",
  "a?b",
  "a#b",
  "a@b",
  "a:b",
  "é",
  "",
  "http:",
  "javascript:alert(1)",
];

function returnPathCandidates(rng: Rng): string[] {
  return Array.from({ length: 12_000 }, () => {
    const first = pickFrom(rng, ["fr", "fr", "en", "ar", "de", "FR", "frx", "fr.", "", "%66r"]);
    const rest = Array.from({ length: Math.floor(rng() * 4) }, () =>
      rng() < 0.75
        ? pickFrom(rng, ["plan", "compare", "programs", "xx-test-prog", "a.b", "a_b~c", "1"])
        : pickFrom(rng, WEIRD_SEGMENTS),
    );
    const prefix =
      rng() < 0.9
        ? "/"
        : // One stray character before the locale is what "starts with a slash" has to catch.
          pickFrom(rng, ["//", "/\\", "", "x", "?", ".", "https://evil.example/", "/ "]);
    const suffix = rng() < 0.8 ? "" : pickFrom(rng, ["/", "?x=1", "#top", "//", "/."]);
    return `${prefix}${[first, ...rest].join("/")}${suffix}`;
  });
}

describe("safeReturnPath against the URL parser", () => {
  it("returns the path untouched or the locale home, and a path it keeps stays on the site", () => {
    const problems: string[] = [];
    let kept = 0;
    let fellBack = 0;
    for (const raw of returnPathCandidates(seededRng(20261023))) {
      for (const locale of LOCALES) {
        const result = safeReturnPath(raw, locale);
        const url = stayOnSite(result);
        if (url === null)
          problems.push(`${preview(raw)} becomes ${preview(result)}, which leaves the site`);
        if (result === `/${locale}`) {
          fellBack += 1;
          continue;
        }
        kept += 1;
        const [, first = "", ...segments] = url?.pathname.split("/") ?? [];
        const knownLocale = LOCALES.some((candidate) => candidate === first);
        const plain = url?.search === "" && url?.hash === "" && !segments.includes("..");
        if (result !== raw || !knownLocale || !plain) {
          problems.push(`${preview(raw)} is kept as ${preview(result)}`);
        }
      }
    }
    expect(problems).toEqual([]);
    expect(kept).toBeGreaterThan(1000);
    expect(fellBack).toBeGreaterThan(10_000);
  });

  it("answers the same for a path and the locale it is asked for, so every locale has a home", () => {
    for (const locale of LOCALES) {
      for (const raw of [
        null,
        undefined,
        "",
        "https://evil.example",
        "//evil.example",
        "/\\evil",
      ]) {
        expect(safeReturnPath(raw, locale)).toBe(`/${locale}`);
      }
      expect(safeReturnPath(`/${locale}/plan`, locale)).toBe(`/${locale}/plan`);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// What the server sends back is what the cache keeps
// ---------------------------------------------------------------------------------------------

function randomSavedRows(rng: Rng): SavedProgramRow[] {
  const count = Math.floor(rng() * 13);
  const slugs = Array.from(
    { length: 40 },
    (_, index) => `xx-${index}-${pickFrom(rng, ["a", "bb", "c-d"])}`,
  );
  const rows = new Map<string, SavedProgramRow>();
  while (rows.size < count) {
    const slug = pickFrom(rng, slugs);
    rows.set(slug, {
      userId: "u1",
      slug,
      country: pickFrom(rng, ["FR", "DE", "NL", "HU", "IT", "ES"]),
      field: pickFrom(rng, ["computer-science", "engineering", "business-economics"]),
      snapshotVersion: pickFrom(rng, [VERSION, OLDER_VERSION, "000000000000", "ffffffffffff"]),
      savedAt: pickFrom(rng, ["2026-10-01", "2026-10-02", "2026-12-31", "2027-02-28"]),
      createdAt: new Date(Date.UTC(2026, 9, 1) + Math.floor(rng() * 1e9)),
    });
  }
  return [...rows.values()];
}

function randomTickRows(rng: Rng): ChecklistProgressRow[] {
  const programs = Math.floor(rng() * 60);
  return Array.from({ length: programs }, (_, index) => `xx-prog-${index}`).flatMap((programSlug) =>
    CHECKLIST_STEP_IDS.filter(() => rng() < 0.4).map((stepId) => ({
      userId: "u1",
      programSlug,
      stepId,
      doneAt: new Date(Date.UTC(2026, 9, 2)),
    })),
  );
}

describe("account rows through the client parsers", () => {
  it("leaves a saved list built from rows unchanged, in the same order", () => {
    const rng = seededRng(20261019);
    for (let round = 0; round < 300; round += 1) {
      const list = rowsToSavedList(randomSavedRows(rng));
      expect(parseSaved(list)).toEqual(list);
    }
  });

  it("leaves a plan built from rows unchanged, however many programmes the account holds", () => {
    const rng = seededRng(20261019);
    for (let round = 0; round < 300; round += 1) {
      const progress = rowsToPlanProgress(randomTickRows(rng));
      expect(parsePlanProgress(progress)).toEqual(progress);
      expect(Object.keys(progress.done).length).toBeLessThanOrEqual(MAX_PLAN_PROGRAMS);
    }
  });

  it("leaves a stored profile document unchanged, and a document this build cannot read as no profile", () => {
    const row = (data: unknown): ProfileRow => ({
      userId: "u1",
      data: data as ProfileRow["data"],
      revision: 7,
      updatedAt: new Date(Date.UTC(2026, 9, 2)),
    });
    const profile = rowToProfile(row(E2E_PROFILE));
    expect(profile).toEqual(E2E_PROFILE);
    expect(parseAccountProfile({ schemaVersion: 1, profile, revision: 7 })).toEqual({
      schemaVersion: 1,
      profile: E2E_PROFILE,
      revision: 7,
    });
    expect(rowToProfile(row({ schemaVersion: 99, future: true }))).toBeNull();
    expect(parseAccountProfile({ schemaVersion: 1, profile: null, revision: 7 })).toEqual({
      schemaVersion: 1,
      profile: null,
      revision: 7,
    });
  });
});

// ---------------------------------------------------------------------------------------------
// What the browser sends: readGuestData against GuestImportPayloadSchema
// ---------------------------------------------------------------------------------------------

function guestStorage(entries: Record<string, string>) {
  const storage = createFakeStorage();
  for (const [key, value] of Object.entries(entries)) storage.seed(key, value);
  return storage;
}

describe("readGuestData against GuestImportPayloadSchema", () => {
  it("leaves out a slug or a field the server would refuse, and imports the rest", () => {
    const payload = readGuestData(
      guestStorage({
        [SAVED_KEY]: JSON.stringify(
          savedList(
            savedItem("xx-ok"),
            savedItem("x".repeat(ACCOUNT_SLUG_MAX_LENGTH + 1)),
            savedItem("xx-long-field", { field: "f".repeat(ACCOUNT_FIELD_MAX_LENGTH + 1) }),
            savedItem("x".repeat(ACCOUNT_SLUG_MAX_LENGTH)),
          ),
        ),
        [PLAN_KEY]: JSON.stringify(
          planDoc({ "xx-ok": ["visa"], ["x".repeat(ACCOUNT_SLUG_MAX_LENGTH + 1)]: ["visa"] }),
        ),
      }),
    );
    expect(payload?.saved.map((item) => item.slug)).toEqual([
      "xx-ok",
      "x".repeat(ACCOUNT_SLUG_MAX_LENGTH),
    ]);
    expect(Object.keys(payload?.plan ?? {})).toEqual(["xx-ok"]);
    expect(GuestImportPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it("leaves out a profile the server would refuse as too large", () => {
    const padded = {
      ...E2E_PROFILE,
      credential: { ...E2E_PROFILE.credential, track: "t".repeat(ACCOUNT_PROFILE_JSON_LIMIT) },
    };
    expect(ProfileSchema.safeParse(padded).success).toBe(true);
    const payload = readGuestData(
      guestStorage({
        [PROFILE_KEY]: JSON.stringify(padded),
        [SAVED_KEY]: JSON.stringify(savedList(savedItem("xx-a"))),
      }),
    );
    expect(payload?.profile).toBeNull();
    expect(GuestImportPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it("sends nothing at all when the device holds nothing the server would take", () => {
    expect(readGuestData(guestStorage({}))).toBeNull();
    expect(
      readGuestData(
        guestStorage({
          [SAVED_KEY]: JSON.stringify(
            savedList(savedItem("x".repeat(ACCOUNT_SLUG_MAX_LENGTH + 1))),
          ),
        }),
      ),
    ).toBeNull();
  });

  it("only ever builds a payload the server accepts, whatever a device holds (2500 seeded devices)", () => {
    const rng = seededRng(20261020);
    const problems: string[] = [];
    const reached = { payload: 0, profile: 0, saved: 0, plan: 0 };
    const stored = (base: unknown): string | null => {
      const roll = rng();
      if (roll < 0.15) return null;
      if (roll < 0.2) return ["", "null", "{", "[]", '"x"', "1"][Math.floor(rng() * 6)] ?? "";
      return JSON.stringify(mutate(base, rng, Math.floor(rng() * 4)));
    };
    for (let index = 0; index < 2500; index += 1) {
      const entries: Record<string, string> = {};
      for (const [key, base] of [
        [PROFILE_KEY, E2E_PROFILE],
        [SAVED_KEY, SAVED_BASE],
        [PLAN_KEY, PLAN_BASE],
      ] as const) {
        const raw = stored(base);
        if (raw !== null) entries[key] = raw;
      }
      const payload = readGuestData(guestStorage(entries));
      if (payload === null) continue;
      reached.payload += 1;
      if (payload.profile !== null) reached.profile += 1;
      if (payload.saved.length > 0) reached.saved += 1;
      if (Object.keys(payload.plan).length > 0) reached.plan += 1;
      if (!GuestImportPayloadSchema.safeParse(payload).success) {
        problems.push(`the server would refuse this device's payload: ${preview(payload)}`);
      }
    }
    expect(problems).toEqual([]);
    expect(reached.payload).toBeGreaterThan(500);
    expect(reached.profile).toBeGreaterThan(100);
    expect(reached.saved).toBeGreaterThan(300);
    expect(reached.plan).toBeGreaterThan(300);
  });
});

// ---------------------------------------------------------------------------------------------
// The session answer: lookupSession reads the consent fields of Better Auth's user
// ---------------------------------------------------------------------------------------------

const client = vi.hoisted(() => ({ getSession: vi.fn<() => Promise<unknown>>() }));
vi.mock("@/lib/auth/client", () => ({ authClient: { getSession: client.getSession } }));

// Anything that is not a version string or a point in time reads as "no record": the account page
// and the consent gate then ask again instead of trusting a malformed field.
const SessionConsentTwin = z.object({
  consentVersion: z.string().nullable().catch(null),
  consentedAt: z
    .union([
      z.date().transform((date) => date.toISOString()),
      z.string().refine((value) => !Number.isNaN(Date.parse(value))),
    ])
    .nullable()
    .catch(null),
});

const CONSENT_VERSIONS: unknown[] = [
  "2026-10-15",
  "",
  "x".repeat(300),
  null,
  undefined,
  1,
  true,
  [],
  {},
  ["2026-10-15"],
];
const CONSENTED_AT: unknown[] = [
  new Date("2026-10-15T23:30:00.000Z"),
  new Date(0),
  new Date(Number.NaN),
  "2026-10-15T23:30:00.000Z",
  "2026-10-15",
  "Oct 15, 2026",
  "1",
  "yesterday",
  "",
  1_760_571_000_000,
  null,
  undefined,
  true,
  {},
  [],
  ["2026-10-15T23:30:00.000Z"],
];

describe("lookupSession against a Zod twin of the consent fields", () => {
  beforeEach(() => {
    client.getSession.mockReset();
    forgetSession();
  });

  it("reads the consent version and time as the twin does, whatever the server sends", async () => {
    const problems: string[] = [];
    for (const consentVersion of CONSENT_VERSIONS) {
      for (const consentedAt of CONSENTED_AT) {
        const user = { id: "u1", email: "amina@example.com", consentVersion, consentedAt };
        client.getSession.mockResolvedValueOnce({ data: { session: {}, user }, error: null });
        forgetSession();
        const result = await lookupSession();
        const expected = SessionConsentTwin.parse(user);
        if (
          result.status !== "signed-in" ||
          result.consentVersion !== expected.consentVersion ||
          result.consentedAt !== expected.consentedAt
        ) {
          problems.push(`${preview({ consentVersion, consentedAt })} -> ${preview(result)}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("reads missing consent fields as no record", async () => {
    client.getSession.mockResolvedValue({ data: { session: {}, user: { id: "u1" } }, error: null });
    expect(await lookupSession()).toMatchObject({ consentVersion: null, consentedAt: null });
  });
});

// ---------------------------------------------------------------------------------------------
// A parser that drifts from its twin fails these tests, at the row that shows the drift
// ---------------------------------------------------------------------------------------------

// A copy of the item whose date is replaced when (and only when) it is not a real date: what a
// parser would see if it stopped checking dates.
function withAnyDateAccepted(item: unknown): unknown {
  return isJson(item) && typeof item.savedAt === "string" && !isValidIsoDate(item.savedAt)
    ? { ...item, savedAt: "2026-10-02" }
    : item;
}

describe("the differential harness catches a diverging parser", () => {
  it("names the table row where a strict parser accepts what its twin refuses", () => {
    const acceptsNegativeRevisions = (raw: unknown) =>
      parseAccountProfile(
        isJson(raw) && typeof raw.revision === "number" && raw.revision < 0
          ? { ...raw, revision: 0 }
          : raw,
      );
    const tally = newTally();
    for (const [label, input] of [...ACCOUNT_PROFILE_VALID, ...ACCOUNT_PROFILE_INVALID]) {
      compare(AccountProfileTwin, acceptsNegativeRevisions, input, label, tally);
    }
    expect(tally.disagreements).toHaveLength(1);
    expect(tally.disagreements[0]).toMatch(/^revision negative: oracle rejects /);
  });

  it("fails on the row where a lenient parser keeps an item its twin drops", () => {
    const keepsLowercaseCountries = (raw: unknown) =>
      parseSaved(
        isJson(raw) && Array.isArray(raw.items)
          ? {
              ...raw,
              items: raw.items.map((item) =>
                isJson(item) && typeof item.country === "string"
                  ? { ...item, country: item.country.toUpperCase() }
                  : item,
              ),
            }
          : raw,
      );
    const tally = newTally();
    expect(() => {
      for (const [label, input] of [...SAVED_VALID, ...SAVED_INVALID]) {
        compare(SavedListTwin, keepsLowercaseCountries, input, label, tally);
      }
    }).toThrow(/a lowercase country is dropped/);
  });

  it("finds the same divergence by fuzzing, without being told where to look", () => {
    const dropsTheDateCheck = (raw: unknown) =>
      parseSaved(
        isJson(raw) && Array.isArray(raw.items)
          ? { ...raw, items: raw.items.map(withAnyDateAccepted) }
          : raw,
      );
    expect(() => fuzz(SavedListTwin, dropsTheDateCheck, SAVED_BASE, 2000, 3)).toThrow(/fuzz#\d+/);
  });
});
