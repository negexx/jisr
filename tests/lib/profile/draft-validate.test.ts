import { describe, expect, it } from "vitest";

import { DraftSchema } from "@/data-schema/draft";
import { DRAFT_SCHEMA_VERSION } from "@/lib/profile/draft";
import { parseDraft } from "@/lib/profile/draft-validate";

import { cloneValue, compare, fuzz, newTally } from "../differential";

const FULL: Record<string, unknown> = {
  schemaVersion: 1,
  step: 3,
  nationality: "MA",
  credential: {
    country: "MA",
    type: "bac",
    track: "sciences",
    status: "expected",
    overall: { scale: "ma-20", value: "14," },
    subjects: [{ subject: "math", grade: { scale: "ma-20", value: "15.5" } }],
  },
  priorHigherEducationYears: "0",
  languages: [
    { language: "fr", level: "B2", certificate: null },
    { language: "en", level: "", certificate: "ielts" },
    { language: "de" },
  ],
  fields: ["computer-science", "not a slug on purpose"],
  studyLanguages: ["fr"],
  destinations: ["FR"],
  budget: { amount: "9000", currency: "EUR", period: "year" },
  institutionType: "public",
};

type Editable = Record<string, unknown>;

function edited(change: (draft: Editable) => void): unknown {
  const copy = cloneValue(FULL) as Editable;
  change(copy);
  return copy;
}

const VALID: Array<[string, unknown]> = [
  ["full draft", FULL],
  ["bare draft", { schemaVersion: 1, step: 0 }],
  ["step only large", { schemaVersion: 1, step: 9_000_000 }],
  ["explicit undefined optionals", { schemaVersion: 1, step: 1, nationality: undefined }],
  ["empty strings", { schemaVersion: 1, step: 0, nationality: "", fields: [""] }],
  ["200 character string", { schemaVersion: 1, step: 0, nationality: "x".repeat(200) }],
  ["null budget", { schemaVersion: 1, step: 0, budget: null }],
  ["undefined budget", { schemaVersion: 1, step: 0, budget: undefined }],
  ["empty budget", { schemaVersion: 1, step: 0, budget: {} }],
  ["empty credential", { schemaVersion: 1, step: 0, credential: {} }],
  ["null overall", { schemaVersion: 1, step: 0, credential: { overall: null } }],
  ["undefined overall", { schemaVersion: 1, step: 0, credential: { overall: undefined } }],
  ["empty arrays", { schemaVersion: 1, step: 0, languages: [], fields: [], destinations: [] }],
  ["month budget", { schemaVersion: 1, step: 0, budget: { period: "month" } }],
  ["no status", { schemaVersion: 1, step: 0, credential: { type: "bac" } }],
  ["language with only a code", { schemaVersion: 1, step: 0, languages: [{ language: "fr" }] }],
  [
    "null certificate",
    { schemaVersion: 1, step: 0, languages: [{ language: "fr", certificate: null }] },
  ],
  [
    "duplicate languages are fine while typing",
    {
      schemaVersion: 1,
      step: 0,
      languages: [{ language: "fr" }, { language: "fr" }],
    },
  ],
];

const INVALID: Array<[string, unknown]> = [
  ["null root", null],
  ["undefined root", undefined],
  ["string root", "draft"],
  ["array root", []],
  ["empty object", {}],
  ["schemaVersion 2", { schemaVersion: 2, step: 0 }],
  ["schemaVersion string", { schemaVersion: "1", step: 0 }],
  ["missing schemaVersion", { step: 0 }],
  ["missing step", { schemaVersion: 1 }],
  ["step negative", { schemaVersion: 1, step: -1 }],
  ["step float", { schemaVersion: 1, step: 1.5 }],
  ["step NaN", { schemaVersion: 1, step: Number.NaN }],
  ["step Infinity", { schemaVersion: 1, step: Number.POSITIVE_INFINITY }],
  ["step unsafe", { schemaVersion: 1, step: 2 ** 53 }],
  ["step string", { schemaVersion: 1, step: "1" }],
  ["step null", { schemaVersion: 1, step: null }],
  ["unknown key", { schemaVersion: 1, step: 0, secret: "x" }],
  ["own __proto__ key", JSON.parse('{"schemaVersion":1,"step":0,"__proto__":{"a":1}}')],
  ["nationality number", edited((d) => (d.nationality = 1))],
  ["nationality null", edited((d) => (d.nationality = null))],
  ["nationality 201 characters", edited((d) => (d.nationality = "x".repeat(201)))],
  ["credential null", edited((d) => (d.credential = null))],
  ["credential array", edited((d) => (d.credential = []))],
  ["credential unknown key", { schemaVersion: 1, step: 0, credential: { extra: 1 } }],
  ["credential country number", { schemaVersion: 1, step: 0, credential: { country: 1 } }],
  [
    "credential type too long",
    { schemaVersion: 1, step: 0, credential: { type: "x".repeat(201) } },
  ],
  ["credential status unknown", { schemaVersion: 1, step: 0, credential: { status: "pending" } }],
  ["credential status null", { schemaVersion: 1, step: 0, credential: { status: null } }],
  ["overall array", { schemaVersion: 1, step: 0, credential: { overall: [] } }],
  ["overall missing value", { schemaVersion: 1, step: 0, credential: { overall: { scale: "s" } } }],
  ["overall missing scale", { schemaVersion: 1, step: 0, credential: { overall: { value: "1" } } }],
  [
    "overall numeric value",
    { schemaVersion: 1, step: 0, credential: { overall: { scale: "s", value: 14 } } },
  ],
  [
    "overall unknown key",
    { schemaVersion: 1, step: 0, credential: { overall: { scale: "s", value: "1", x: 1 } } },
  ],
  [
    "overall value too long",
    { schemaVersion: 1, step: 0, credential: { overall: { scale: "s", value: "1".repeat(201) } } },
  ],
  ["subjects null", { schemaVersion: 1, step: 0, credential: { subjects: null } }],
  ["subjects object", { schemaVersion: 1, step: 0, credential: { subjects: {} } }],
  [
    "subject missing grade",
    { schemaVersion: 1, step: 0, credential: { subjects: [{ subject: "m" }] } },
  ],
  [
    "subject missing name",
    {
      schemaVersion: 1,
      step: 0,
      credential: { subjects: [{ grade: { scale: "s", value: "1" } }] },
    },
  ],
  [
    "subject grade null",
    { schemaVersion: 1, step: 0, credential: { subjects: [{ subject: "m", grade: null }] } },
  ],
  [
    "subject unknown key",
    {
      schemaVersion: 1,
      step: 0,
      credential: { subjects: [{ subject: "m", grade: { scale: "s", value: "1" }, x: 1 }] },
    },
  ],
  ["prior years number", { schemaVersion: 1, step: 0, priorHigherEducationYears: 1 }],
  ["prior years null", { schemaVersion: 1, step: 0, priorHigherEducationYears: null }],
  ["languages null", { schemaVersion: 1, step: 0, languages: null }],
  ["languages object", { schemaVersion: 1, step: 0, languages: {} }],
  ["language missing code", { schemaVersion: 1, step: 0, languages: [{ level: "B2" }] }],
  [
    "language level number",
    { schemaVersion: 1, step: 0, languages: [{ language: "fr", level: 2 }] },
  ],
  [
    "language level null",
    { schemaVersion: 1, step: 0, languages: [{ language: "fr", level: null }] },
  ],
  [
    "language certificate number",
    { schemaVersion: 1, step: 0, languages: [{ language: "fr", certificate: 1 }] },
  ],
  ["language unknown key", { schemaVersion: 1, step: 0, languages: [{ language: "fr", x: 1 }] }],
  ["language entry null", { schemaVersion: 1, step: 0, languages: [null] }],
  ["fields null", { schemaVersion: 1, step: 0, fields: null }],
  ["fields string", { schemaVersion: 1, step: 0, fields: "cs" }],
  ["fields with number", { schemaVersion: 1, step: 0, fields: ["cs", 1] }],
  ["fields entry too long", { schemaVersion: 1, step: 0, fields: ["x".repeat(201)] }],
  ["studyLanguages null", { schemaVersion: 1, step: 0, studyLanguages: null }],
  ["destinations with null", { schemaVersion: 1, step: 0, destinations: [null] }],
  ["budget array", { schemaVersion: 1, step: 0, budget: [] }],
  ["budget unknown key", { schemaVersion: 1, step: 0, budget: { x: 1 } }],
  ["budget amount number", { schemaVersion: 1, step: 0, budget: { amount: 900 } }],
  ["budget amount null", { schemaVersion: 1, step: 0, budget: { amount: null } }],
  ["budget currency number", { schemaVersion: 1, step: 0, budget: { currency: 1 } }],
  ["budget period week", { schemaVersion: 1, step: 0, budget: { period: "week" } }],
  ["budget period null", { schemaVersion: 1, step: 0, budget: { period: null } }],
  ["institution type unknown", { schemaVersion: 1, step: 0, institutionType: "charter" }],
  ["institution type null", { schemaVersion: 1, step: 0, institutionType: null }],
];

describe("parseDraft against DraftSchema", () => {
  it("uses the same schema version as the schema accepts", () => {
    expect(DraftSchema.safeParse({ schemaVersion: DRAFT_SCHEMA_VERSION, step: 0 }).success).toBe(
      true,
    );
    expect(
      DraftSchema.safeParse({ schemaVersion: DRAFT_SCHEMA_VERSION + 1, step: 0 }).success,
    ).toBe(false);
  });

  it.each(VALID)("accepts and returns an equal copy of %s", (_label, input) => {
    const oracle = DraftSchema.safeParse(input);
    expect(oracle.success).toBe(true);
    expect(parseDraft(input)).toEqual(oracle.data);
  });

  it.each(INVALID)("rejects %s exactly as the schema does", (_label, input) => {
    expect(DraftSchema.safeParse(input).success).toBe(false);
    expect(parseDraft(input)).toBeNull();
  });

  it("agrees with the schema on every table row", () => {
    const tally = newTally();
    for (const [label, input] of [...VALID, ...INVALID]) {
      compare(DraftSchema, parseDraft, input, label, tally);
    }
    expect(tally.disagreements).toEqual([]);
    expect(tally.accepted).toBe(VALID.length);
    expect(tally.rejected).toBe(INVALID.length);
  });

  it("agrees with the schema on 3000 seeded mutations of a full draft", () => {
    const tally = fuzz(DraftSchema, parseDraft, FULL, 3000, 7);
    expect(tally.disagreements).toEqual([]);
    expect(tally.accepted).toBeGreaterThan(100);
    expect(tally.rejected).toBeGreaterThan(1000);
  });

  it("agrees with the schema on 1000 seeded mutations of a bare draft", () => {
    const tally = fuzz(DraftSchema, parseDraft, { schemaVersion: 1, step: 0 }, 1000, 99);
    expect(tally.disagreements).toEqual([]);
    expect(tally.accepted).toBeGreaterThan(20);
  });
});
