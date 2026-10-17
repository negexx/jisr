import { describe, expect, it } from "vitest";

import {
  CEFR_LEVELS as ORACLE_CEFR_LEVELS,
  INFO_KINDS as ORACLE_INFO_KINDS,
} from "@/data-schema/primitives";
import {
  PROFILE_SCHEMA_VERSION as ORACLE_PROFILE_VERSION,
  ProfileSchema,
} from "@/data-schema/profile";
import { CEFR_LEVELS, INFO_KINDS, PROFILE_SCHEMA_VERSION } from "@/lib/constants";
import { parseProfile } from "@/lib/profile/validate";

import { E2E_PROFILE } from "../../fixtures/e2e/profiles";
import { cloneValue, compare, fuzz, newTally } from "../differential";

const BASE: Record<string, unknown> = {
  schemaVersion: 2,
  nationality: "MA",
  credential: {
    country: "MA",
    type: "bac",
    track: "sciences-maths",
    status: "obtained",
    overall: { scale: "ma-20", value: 14.5 },
    subjects: [
      { subject: "math", grade: { scale: "ma-20", value: 15 } },
      { subject: "physics", grade: { scale: "ma-20", value: 13.25 } },
    ],
  },
  priorHigherEducationYears: 0,
  languages: [
    { language: "fr", level: "B2", certificate: "delf" },
    { language: "en", level: "unknown", certificate: null },
  ],
};

type Editable = Record<string, unknown> & { credential: Record<string, unknown> };

function edited(change: (profile: Editable) => void): unknown {
  const copy = cloneValue(BASE) as Editable;
  change(copy);
  return copy;
}

function withCredential(key: string, value: unknown): unknown {
  return edited((p) => {
    p.credential[key] = value;
  });
}

const VALID: Array<[string, unknown]> = [
  ["base profile", BASE],
  ["e2e profile", E2E_PROFILE],
  ["inherited enumerable keys that are all in the shape", Object.create(BASE)],
  ["class instance root", Object.assign(new (class Loaded {})(), BASE)],
  ["symbol key is ignored", { ...BASE, [Symbol("ignored")]: 1 }],
  ["no overall grade", withCredential("overall", null)],
  ["no subjects", withCredential("subjects", [])],
  ["expected credential", withCredential("status", "expected")],
  ["negative grade", withCredential("overall", { scale: "s", value: -3 })],
  ["huge grade", withCredential("overall", { scale: "s", value: 1e300 })],
  ["negative zero grade", withCredential("overall", { scale: "s", value: -0 })],
  ["no languages", edited((p) => (p.languages = []))],
  ["prior years 3", edited((p) => (p.priorHigherEducationYears = 3))],
  [
    "every CEFR level",
    edited((p) => {
      p.languages = [...ORACLE_CEFR_LEVELS, "unknown"].map((level, index) => ({
        language: String.fromCharCode(97, 97 + index),
        level,
        certificate: null,
      }));
    }),
  ],
];

const INVALID: Array<[string, unknown]> = [
  ["null root", null],
  ["undefined root", undefined],
  ["string root", "profile"],
  ["number root", 1],
  ["boolean root", true],
  ["array root", [BASE]],
  ["empty object", {}],
  ["schemaVersion 1", edited((p) => (p.schemaVersion = 1))],
  ["schemaVersion 0", edited((p) => (p.schemaVersion = 0))],
  ["schemaVersion as string", edited((p) => (p.schemaVersion = "2"))],
  ["schemaVersion 2.0000001", edited((p) => (p.schemaVersion = 2.0000001))],
  ["missing schemaVersion", edited((p) => delete p.schemaVersion)],
  ["unknown top-level key", edited((p) => (p.extra = 1))],
  ["own __proto__ key", JSON.parse(`${JSON.stringify(BASE).slice(0, -1)},"__proto__":{"x":1}}`)],
  [
    "own constructor key",
    edited((p) => Object.defineProperty(p, "constructor", { value: {}, enumerable: true })),
  ],
  ["inherited enumerable extra key", Object.assign(Object.create({ extra: 1 }), BASE)],
  ["nationality lowercase", edited((p) => (p.nationality = "ma"))],
  ["nationality three letters", edited((p) => (p.nationality = "MAR"))],
  ["nationality trailing newline", edited((p) => (p.nationality = "MA\n"))],
  ["nationality number", edited((p) => (p.nationality = 12))],
  ["nationality missing", edited((p) => delete p.nationality)],
  ["nationality null", edited((p) => (p.nationality = null))],
  ["credential null", edited((p) => (p.credential = null as never))],
  ["credential array", edited((p) => (p.credential = [] as never))],
  ["credential unknown key", withCredential("extra", 1)],
  ["credential country lowercase", withCredential("country", "ma")],
  ["credential type empty", withCredential("type", "")],
  ["credential type uppercase", withCredential("type", "BAC")],
  ["credential type double dash", withCredential("type", "a--b")],
  ["credential type trailing dash", withCredential("type", "a-")],
  ["credential track missing", edited((p) => delete p.credential.track)],
  ["credential status unknown", withCredential("status", "pending")],
  ["credential status missing", edited((p) => delete p.credential.status)],
  ["overall undefined", withCredential("overall", undefined)],
  ["overall missing", edited((p) => delete p.credential.overall)],
  ["overall array", withCredential("overall", [])],
  ["overall unknown key", withCredential("overall", { scale: "s", value: 1, extra: 1 })],
  ["overall value string", withCredential("overall", { scale: "s", value: "14" })],
  ["overall value NaN", withCredential("overall", { scale: "s", value: Number.NaN })],
  [
    "overall value Infinity",
    withCredential("overall", { scale: "s", value: Number.POSITIVE_INFINITY }),
  ],
  [
    "overall value -Infinity",
    withCredential("overall", { scale: "s", value: Number.NEGATIVE_INFINITY }),
  ],
  ["overall value null", withCredential("overall", { scale: "s", value: null })],
  ["overall scale bad slug", withCredential("overall", { scale: "S", value: 1 })],
  ["overall scale missing", withCredential("overall", { value: 1 })],
  ["subjects object", withCredential("subjects", {})],
  ["subjects null", withCredential("subjects", null)],
  ["subject entry array", withCredential("subjects", [[]])],
  [
    "subject entry unknown key",
    withCredential("subjects", [{ subject: "m", grade: { scale: "s", value: 1 }, extra: 1 }]),
  ],
  [
    "subject bad slug",
    withCredential("subjects", [{ subject: "M", grade: { scale: "s", value: 1 } }]),
  ],
  ["subject grade missing", withCredential("subjects", [{ subject: "m" }])],
  [
    "subject grade NaN",
    withCredential("subjects", [{ subject: "m", grade: { scale: "s", value: Number.NaN } }]),
  ],
  [
    "duplicate subject",
    withCredential("subjects", [
      { subject: "m", grade: { scale: "s", value: 1 } },
      { subject: "m", grade: { scale: "s", value: 2 } },
    ]),
  ],
  ["prior years negative", edited((p) => (p.priorHigherEducationYears = -1))],
  ["prior years 4", edited((p) => (p.priorHigherEducationYears = 4))],
  ["prior years float", edited((p) => (p.priorHigherEducationYears = 1.5))],
  ["prior years NaN", edited((p) => (p.priorHigherEducationYears = Number.NaN))],
  ["prior years string", edited((p) => (p.priorHigherEducationYears = "1"))],
  ["prior years missing", edited((p) => delete p.priorHigherEducationYears)],
  ["languages object", edited((p) => (p.languages = {}))],
  ["languages missing", edited((p) => delete p.languages)],
  [
    "language uppercase",
    edited((p) => (p.languages = [{ language: "FR", level: "B2", certificate: null }])),
  ],
  [
    "language three letters",
    edited((p) => (p.languages = [{ language: "fra", level: "B2", certificate: null }])),
  ],
  [
    "language level lowercase",
    edited((p) => (p.languages = [{ language: "fr", level: "b2", certificate: null }])),
  ],
  [
    "language level C3",
    edited((p) => (p.languages = [{ language: "fr", level: "C3", certificate: null }])),
  ],
  [
    "language level missing",
    edited((p) => (p.languages = [{ language: "fr", certificate: null }])),
  ],
  [
    "language certificate missing",
    edited((p) => (p.languages = [{ language: "fr", level: "B2" }])),
  ],
  [
    "language certificate empty",
    edited((p) => (p.languages = [{ language: "fr", level: "B2", certificate: "" }])),
  ],
  [
    "language certificate number",
    edited((p) => (p.languages = [{ language: "fr", level: "B2", certificate: 1 }])),
  ],
  [
    "language unknown key",
    edited((p) => (p.languages = [{ language: "fr", level: "B2", certificate: null, x: 1 }])),
  ],
  [
    "duplicate language",
    edited(
      (p) =>
        (p.languages = [
          { language: "fr", level: "B2", certificate: null },
          { language: "fr", level: "C1", certificate: "delf" },
        ]),
    ),
  ],
  ["legacy fields key", edited((p) => (p.fields = ["computer-science"]))],
  ["legacy studyLanguages key", edited((p) => (p.studyLanguages = ["fr"]))],
  ["legacy destinations key", edited((p) => (p.destinations = ["FR"]))],
  [
    "legacy budget key",
    edited((p) => (p.budget = { amountMinor: 1, currency: "EUR", period: "year" })),
  ],
  ["legacy institutionType key", edited((p) => (p.institutionType = "any"))],
];

describe("parseProfile against ProfileSchema", () => {
  it("uses the same schema version and vocabularies as the schema", () => {
    expect(PROFILE_SCHEMA_VERSION).toBe(ORACLE_PROFILE_VERSION);
    expect(CEFR_LEVELS).toEqual(ORACLE_CEFR_LEVELS);
    expect(INFO_KINDS).toEqual(ORACLE_INFO_KINDS);
  });

  it.each(VALID)("accepts and returns an equal copy of %s", (_label, input) => {
    const oracle = ProfileSchema.safeParse(input);
    expect(oracle.success).toBe(true);
    const parsed = parseProfile(input);
    expect(parsed).toEqual(oracle.data);
    expect(parsed).not.toBe(input);
  });

  it.each(INVALID)("rejects %s exactly as the schema does", (_label, input) => {
    expect(ProfileSchema.safeParse(input).success).toBe(false);
    expect(parseProfile(input)).toBeNull();
  });

  it("agrees with the schema on every table row", () => {
    const tally = newTally();
    for (const [label, input] of [...VALID, ...INVALID]) {
      compare(ProfileSchema, parseProfile, input, label, tally);
    }
    expect(tally.disagreements).toEqual([]);
    expect(tally.accepted).toBe(VALID.length);
    expect(tally.rejected).toBe(INVALID.length);
  });

  it("agrees with the schema on 3000 seeded mutations of a valid profile", () => {
    const tally = fuzz(ProfileSchema, parseProfile, BASE, 3000, 20260930);
    expect(tally.disagreements).toEqual([]);
    expect(tally.accepted).toBeGreaterThan(100);
    expect(tally.rejected).toBeGreaterThan(1000);
  });

  it("agrees with the schema on 1000 seeded mutations of a minimal valid profile", () => {
    const minimal = edited((p) => {
      p.credential.overall = null;
      p.credential.subjects = [];
      p.languages = [];
    });
    const tally = fuzz(ProfileSchema, parseProfile, minimal, 1000, 42);
    expect(tally.disagreements).toEqual([]);
    expect(tally.accepted).toBeGreaterThan(50);
  });
});
