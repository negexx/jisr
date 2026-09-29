import { describe, expect, it } from "vitest";

import { PROFILE_SCHEMA_VERSION, ProfileSchema } from "@/data-schema/profile";

const PROFILE = {
  schemaVersion: 1,
  nationality: "XA",
  credential: {
    country: "XA",
    type: "xx-test-cred",
    track: "xx-test-track",
    status: "obtained",
    overall: { scale: "xx-test-scale", value: 14 },
    subjects: [{ subject: "xx-test-subj", grade: { scale: "xx-test-scale", value: 15 } }],
  },
  priorHigherEducationYears: 0,
  languages: [{ language: "xx", level: "B2", certificate: null }],
  fields: ["xx-test-field"],
  studyLanguages: ["xx"],
  destinations: [],
  budget: null,
  institutionType: "any",
};

type Mutable = Record<string, unknown> & {
  credential: { subjects: unknown[]; overall: unknown };
  languages: Array<Record<string, unknown>>;
};

const rows: Array<[string, (p: Mutable) => void, boolean]> = [
  ["base profile", () => {}, true],
  [
    "schemaVersion 2",
    (p) => {
      p.schemaVersion = 2;
    },
    false,
  ],
  [
    "empty fields",
    (p) => {
      p.fields = [];
    },
    false,
  ],
  [
    "priorHigherEducationYears 3",
    (p) => {
      p.priorHigherEducationYears = 3;
    },
    true,
  ],
  [
    "priorHigherEducationYears 4",
    (p) => {
      p.priorHigherEducationYears = 4;
    },
    false,
  ],
  [
    "priorHigherEducationYears -1",
    (p) => {
      p.priorHigherEducationYears = -1;
    },
    false,
  ],
  [
    "duplicate subjects",
    (p) => {
      p.credential.subjects.push({
        subject: "xx-test-subj",
        grade: { scale: "xx-test-scale", value: 10 },
      });
    },
    false,
  ],
  [
    "duplicate languages",
    (p) => {
      p.languages.push({ language: "xx", level: "A1", certificate: null });
    },
    false,
  ],
  [
    "level unknown",
    (p) => {
      p.languages = [{ language: "xx", level: "unknown", certificate: null }];
    },
    true,
  ],
  [
    "overall null",
    (p) => {
      p.credential.overall = null;
    },
    true,
  ],
  [
    "fractional budget amount",
    (p) => {
      p.budget = { amountMinor: 1.5, currency: "EUR", period: "month" };
    },
    false,
  ],
  [
    "budget period week",
    (p) => {
      p.budget = { amountMinor: 100, currency: "EUR", period: "week" };
    },
    false,
  ],
  [
    "valid budget",
    (p) => {
      p.budget = { amountMinor: 100000, currency: "EUR", period: "year" };
    },
    true,
  ],
  [
    "extra key",
    (p) => {
      p.extra = true;
    },
    false,
  ],
  [
    "lowercase nationality",
    (p) => {
      p.nationality = "xa";
    },
    false,
  ],
];

describe("ProfileSchema", () => {
  it("exposes the schema version literal", () => {
    expect(PROFILE_SCHEMA_VERSION).toBe(1);
  });

  it.each(rows)("%s", (_label, mutate, ok) => {
    const profile: Mutable = structuredClone(PROFILE);
    mutate(profile);
    expect(ProfileSchema.safeParse(profile).success).toBe(ok);
  });

  it("reports duplicates at the second occurrence", () => {
    const profile: Mutable = structuredClone(PROFILE);
    profile.credential.subjects.push({
      subject: "xx-test-subj",
      grade: { scale: "xx-test-scale", value: 10 },
    });
    profile.languages.push({ language: "xx", level: "A1", certificate: null });
    const result = ProfileSchema.safeParse(profile);
    const paths = result.error?.issues.map((i) => i.path.join(".")) ?? [];
    expect(paths).toContain("credential.subjects.1.subject");
    expect(paths).toContain("languages.1.language");
  });
});
