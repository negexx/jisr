import { describe, expect, it } from "vitest";

import { RequirementsSchema, RuleSchema } from "@/data-schema/rules";

const base = { source: "main", info_kind: "official" } as const;

const VALID = {
  credential_type_in: { ...base, id: "r1", kind: "credential_type_in", types: ["xx-test-cred"] },
  credential_track_in: {
    ...base,
    id: "r1",
    kind: "credential_track_in",
    tracks: ["xx-test-track"],
  },
  overall_grade_min: {
    ...base,
    id: "r1",
    kind: "overall_grade_min",
    scale: "xx-test-scale",
    threshold: 12,
  },
  subject_grade_min: {
    ...base,
    id: "r1",
    kind: "subject_grade_min",
    subject: "xx-test-subj",
    scale: "xx-test-scale",
    threshold: null,
  },
  subject_taken: {
    ...base,
    id: "r1",
    kind: "subject_taken",
    subjects: ["xx-test-subj"],
    mode: "any",
  },
  language_proficiency: {
    ...base,
    id: "r1",
    kind: "language_proficiency",
    language: "xx",
    minCefr: "B2",
    certificateRequired: null,
    acceptedTests: [],
  },
  prior_study_years_min: { ...base, id: "r1", kind: "prior_study_years_min", years: 1 },
  manual_check: {
    ...base,
    id: "r1",
    kind: "manual_check",
    note: { fr: { text: "Vérifier", status: "draft" } },
  },
} as const;

function without(value: Record<string, unknown>, key: string): Record<string, unknown> {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

describe("RuleSchema valid rules", () => {
  it.each(Object.entries(VALID))("parses %s", (_kind, rule) => {
    expect(RuleSchema.safeParse(rule).success).toBe(true);
  });
});

describe("RuleSchema explicit nulls", () => {
  it.each([
    ["language_proficiency minCefr", { ...VALID.language_proficiency, minCefr: null }],
    ["overall_grade_min threshold", { ...VALID.overall_grade_min, threshold: null }],
  ])("accepts an explicit null %s", (_label, rule) => {
    expect(RuleSchema.safeParse(rule).success).toBe(true);
  });
});

describe("RuleSchema invalid rules", () => {
  it.each([
    ["overall_grade_min without threshold key", without(VALID.overall_grade_min, "threshold")],
    ["subject_grade_min without threshold key", without(VALID.subject_grade_min, "threshold")],
    ["language_proficiency without minCefr", without(VALID.language_proficiency, "minCefr")],
    [
      "language_proficiency without certificateRequired",
      without(VALID.language_proficiency, "certificateRequired"),
    ],
    ["credential_type_in with empty types", { ...VALID.credential_type_in, types: [] }],
    ["subject_taken with mode some", { ...VALID.subject_taken, mode: "some" }],
    ["prior_study_years_min with years 0", { ...VALID.prior_study_years_min, years: 0 }],
    ["prior_study_years_min with years 1.5", { ...VALID.prior_study_years_min, years: 1.5 }],
    ["unknown kind", { ...base, id: "r1", kind: "mystery" }],
    ["extra key", { ...VALID.credential_type_in, extra: true }],
    ["uppercase id", { ...VALID.credential_type_in, id: "R1" }],
    ["missing source", without(VALID.credential_type_in, "source")],
  ])("rejects %s", (_label, rule) => {
    expect(RuleSchema.safeParse(rule).success).toBe(false);
  });
});

describe("RequirementsSchema", () => {
  it("accepts complete coverage with no rules", () => {
    expect(RequirementsSchema.safeParse({ coverage: "complete", ...base, rules: [] }).success).toBe(
      true,
    );
  });

  it("rejects duplicate rule ids", () => {
    const result = RequirementsSchema.safeParse({
      coverage: "partial",
      ...base,
      rules: [VALID.credential_type_in, VALID.prior_study_years_min],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("rule ids must be unique");
  });

  it("rejects an unknown coverage value", () => {
    expect(RequirementsSchema.safeParse({ coverage: "full", ...base, rules: [] }).success).toBe(
      false,
    );
  });
});
