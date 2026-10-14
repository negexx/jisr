import { describe, expect, it } from "vitest";

import { ProfileSchema } from "@/data-schema/profile";
import { CHECKLIST_STEP_IDS } from "@/domain/types";
import { type PlanProgress, parsePlanProgress } from "@/lib/plan/progress";
import { parseSaved, type SavedList } from "@/lib/saved/saved";
import {
  planProgressToRows,
  profileToRow,
  rowsToPlanProgress,
  rowsToSavedList,
  rowToProfile,
  savedProgramToRow,
} from "@/lib/server/rows";

const USER_ID = "user-1";
const DONE_AT = new Date("2026-10-14T09:30:00.000Z");

const SAVED: SavedList = {
  schemaVersion: 1,
  items: [
    {
      slug: "xx-prog-a",
      country: "FR",
      field: "computer-science",
      snapshotVersion: "0123456789ab",
      savedAt: "2026-09-01",
    },
    {
      slug: "xx-prog-b",
      country: "DE",
      field: "engineering",
      snapshotVersion: "ba9876543210",
      savedAt: "2026-09-12",
    },
  ],
};

const PROFILE = ProfileSchema.parse({
  schemaVersion: 1,
  nationality: "MA",
  credential: {
    country: "MA",
    type: "bac",
    track: "sciences-maths-a",
    status: "expected",
    overall: { scale: "ma-20", value: 15.25 },
    subjects: [{ subject: "mathematics", grade: { scale: "ma-20", value: 17 } }],
  },
  priorHigherEducationYears: 0,
  languages: [{ language: "fr", level: "B2", certificate: null }],
  fields: ["computer-science"],
  studyLanguages: ["fr", "en"],
  destinations: ["FR", "DE"],
  budget: { amountMinor: 900_00, currency: "EUR", period: "month" },
  institutionType: "any",
});

describe("saved programme rows", () => {
  it("round-trips a SavedList losslessly", () => {
    const rows = SAVED.items.map((item) => savedProgramToRow(USER_ID, item));
    expect(rowsToSavedList(rows)).toEqual(SAVED);
  });

  it("maps one item to a row keyed by user and slug", () => {
    const [item] = SAVED.items;
    if (!item) throw new Error("fixture has no items");
    expect(savedProgramToRow(USER_ID, item)).toEqual({ userId: USER_ID, ...item });
  });

  it("orders by saved_at ascending whatever order the rows arrive in", () => {
    const rows = [...SAVED.items].reverse().map((item) => savedProgramToRow(USER_ID, item));
    expect(rowsToSavedList(rows).items.map((item) => item.slug)).toEqual([
      "xx-prog-a",
      "xx-prog-b",
    ]);
  });

  it("breaks a same-day tie by slug so the order is deterministic", () => {
    const sameDay = ["xx-prog-c", "xx-prog-a", "xx-prog-b"].map((slug) =>
      savedProgramToRow(USER_ID, {
        slug,
        country: "FR",
        field: "engineering",
        snapshotVersion: "0123456789ab",
        savedAt: "2026-09-01",
      }),
    );
    expect(rowsToSavedList(sameDay).items.map((item) => item.slug)).toEqual([
      "xx-prog-a",
      "xx-prog-b",
      "xx-prog-c",
    ]);
  });

  it("returns what the client validator accepts", () => {
    const rows = SAVED.items.map((item) => savedProgramToRow(USER_ID, item));
    expect(parseSaved(rowsToSavedList(rows))).toEqual(SAVED);
  });

  it("maps no rows to the empty list", () => {
    expect(rowsToSavedList([])).toEqual({ schemaVersion: 1, items: [] });
  });
});

describe("checklist progress rows", () => {
  const PROGRESS: PlanProgress = {
    schemaVersion: 1,
    done: {
      "xx-prog-a": ["documents", "visa", "departure"],
      "xx-prog-b": ["submit"],
    },
  };

  it("round-trips PlanProgress losslessly", () => {
    const rows = planProgressToRows(USER_ID, PROGRESS, DONE_AT);
    expect(rowsToPlanProgress(rows)).toEqual(PROGRESS);
  });

  it("emits one row per ticked step", () => {
    const rows = planProgressToRows(USER_ID, PROGRESS, DONE_AT);
    expect(rows).toHaveLength(4);
    expect(rows).toContainEqual({
      userId: USER_ID,
      programSlug: "xx-prog-b",
      stepId: "submit",
      doneAt: DONE_AT,
    });
  });

  it("returns steps in checklist order whatever order the rows arrive in", () => {
    const rows = [...CHECKLIST_STEP_IDS].reverse().map((stepId) => ({
      userId: USER_ID,
      programSlug: "xx-prog-a",
      stepId,
      doneAt: DONE_AT,
    }));
    expect(rowsToPlanProgress(rows).done["xx-prog-a"]).toEqual([...CHECKLIST_STEP_IDS]);
  });

  it("returns what the client validator accepts", () => {
    const rows = planProgressToRows(USER_ID, PROGRESS, DONE_AT);
    expect(parsePlanProgress(rowsToPlanProgress(rows))).toEqual(PROGRESS);
  });

  it("ignores a row with a step id outside the checklist instead of throwing", () => {
    const rows = [
      { userId: USER_ID, programSlug: "xx-prog-a", stepId: "not-a-step", doneAt: DONE_AT },
      { userId: USER_ID, programSlug: "xx-prog-a", stepId: "visa", doneAt: DONE_AT },
    ];
    expect(rowsToPlanProgress(rows).done).toEqual({ "xx-prog-a": ["visa"] });
  });

  it("maps no rows to the empty record", () => {
    expect(rowsToPlanProgress([])).toEqual({ schemaVersion: 1, done: {} });
  });

  it("keeps an own property named like an object builtin off the prototype", () => {
    const rows = [{ userId: USER_ID, programSlug: "__proto__", stepId: "visa", doneAt: DONE_AT }];
    const result = rowsToPlanProgress(rows);
    expect(Object.getPrototypeOf(result.done)).toBe(Object.prototype);
    expect(Object.keys(result.done)).toEqual(["__proto__"]);
  });
});

describe("profile row", () => {
  it("round-trips a Profile through the jsonb document", () => {
    const row = profileToRow(USER_ID, PROFILE);
    expect(row.userId).toBe(USER_ID);
    const stored = JSON.parse(JSON.stringify(row.data));
    expect(rowToProfile({ ...row, data: stored, revision: 3, updatedAt: DONE_AT })).toEqual(
      PROFILE,
    );
  });

  it("returns null for a stored document the schema no longer accepts", () => {
    // What the jsonb column can hold after a schema change: the database returns it untyped.
    const outdated = JSON.parse('{"schemaVersion":2}');
    const row = { userId: USER_ID, data: outdated, revision: 0, updatedAt: DONE_AT };
    expect(rowToProfile(row)).toBeNull();
  });
});
