import { describe, expect, it } from "vitest";

import type { Profile } from "@/data-schema/profile";
import {
  buildProfile,
  mapReferenceIssues,
  PROFILE_ISSUE_TO_STEP_CODE,
} from "@/lib/profile/form/build";
import { formFromProfile } from "@/lib/profile/form/state";
import { validateStep } from "@/lib/profile/form/validate-step";
import type { ProfileIssueCode } from "@/lib/profile/reference-checks";
import { parseProfile } from "@/lib/profile/validate";

import { E2E_PROFILE } from "../../../fixtures/e2e/profiles";
import { forbidConsole } from "../no-console";
import { at, edited, withRealCore } from "./helpers";

forbidConsole();

const realCore = withRealCore();

const ROUND_TRIPS: Array<[string, Profile]> = [
  ["the E2E profile", E2E_PROFILE],
  [
    "an expected Bac without grades",
    {
      ...E2E_PROFILE,
      credential: {
        ...E2E_PROFILE.credential,
        status: "expected",
        overall: null,
        subjects: [],
      },
    },
  ],
  [
    "decimal grades and several subjects",
    {
      ...E2E_PROFILE,
      credential: {
        ...E2E_PROFILE.credential,
        overall: { scale: "xx-test-scale-20", value: 14.5 },
        subjects: [
          { subject: "xx-test-subject-math", grade: { scale: "xx-test-scale-20", value: 12.25 } },
          { subject: "xx-test-subject-phys", grade: { scale: "xx-test-scale-20", value: 0 } },
        ],
      },
      priorHigherEducationYears: 2,
    },
  ],
];

describe("buildProfile round trip", () => {
  it.each(ROUND_TRIPS)("gives back %s", (_label, profile) => {
    const result = buildProfile(formFromProfile(profile), realCore());
    expect(result).toEqual({ ok: true, profile });
  });

  it("only returns profiles the client validator accepts", () => {
    for (const [, profile] of ROUND_TRIPS) {
      const result = buildProfile(formFromProfile(profile), realCore());
      expect(result.ok && parseProfile(result.profile)).toEqual(profile);
    }
  });
});

describe("buildProfile conversions", () => {
  const base = () => formFromProfile(E2E_PROFILE);
  const build = (change: (form: ReturnType<typeof base>) => void) => {
    const result = buildProfile(edited(base(), change), realCore());
    if (!result.ok) throw new Error(`expected a profile, got ${result.issues.length} issues`);
    return result.profile;
  };

  it("reads comma and dot decimals the same way", () => {
    const comma = build((f) => (f.credential.overall = "14,5"));
    const dot = build((f) => (f.credential.overall = "14.5"));
    expect(comma.credential.overall).toEqual({ scale: "xx-test-scale-20", value: 14.5 });
    expect(dot).toEqual(comma);
  });

  it("keeps a grade typed with a trailing separator or spaces", () => {
    expect(build((f) => (f.credential.overall = "14,")).credential.overall?.value).toBe(14);
    expect(build((f) => (f.credential.overall = " 14 ")).credential.overall?.value).toBe(14);
  });

  it("gives every grade the credential type's scale slug", () => {
    const profile = build((f) => {
      f.credential.subjects = [{ subject: "xx-test-subject-phys", grade: "9,5" }];
    });
    expect(profile.credential.subjects).toEqual([
      { subject: "xx-test-subject-phys", grade: { scale: "xx-test-scale-20", value: 9.5 } },
    ]);
  });

  it("turns an empty overall grade into null", () => {
    const profile = build((f) => {
      f.credential.status = "expected";
      f.credential.overall = "";
    });
    expect(profile.credential.overall).toBeNull();
  });

  it("turns an empty certificate into null and keeps a chosen one", () => {
    const profile = build((f) => {
      at(f.languages, 0).certificate = "";
      at(f.languages, 1).certificate = "xx-test-cert-en";
    });
    expect(profile.languages.map((row) => row.certificate)).toEqual([null, "xx-test-cert-en"]);
  });

  it("turns years into a number", () => {
    expect(build((f) => (f.priorHigherEducationYears = " 3 ")).priorHigherEducationYears).toBe(3);
  });
});

describe("buildProfile refusal", () => {
  it("returns the step issues untouched, in review order", () => {
    const form = edited(formFromProfile(E2E_PROFILE), (f) => {
      f.credential.overall = "1,000";
      f.nationality = "";
    });
    const result = buildProfile(form, realCore());
    expect(result).toEqual({ ok: false, issues: validateStep("review", form, realCore()) });
    expect(result.ok ? [] : result.issues.map((issue) => issue.code)).toEqual([
      "required",
      "ambiguous_number",
    ]);
  });

  it("never throws on an empty form", () => {
    const result = buildProfile(
      edited(formFromProfile(E2E_PROFILE), (f) => {
        f.nationality = "";
        f.credential.type = "";
      }),
      realCore(),
    );
    expect(result.ok).toBe(false);
  });
});

describe("reference issue mapping", () => {
  const codes = [
    "unknown_credential_type",
    "track_not_in_type",
    "unknown_scale",
    "grade_out_of_range",
    "unknown_subject",
    "unknown_certificate",
    "certificate_language_mismatch",
    "unknown_country",
  ] as const;
  const everyCodeListed: [Exclude<ProfileIssueCode, (typeof codes)[number]>] extends [never]
    ? true
    : false = true;

  it("covers every profile issue code", () => {
    expect(everyCodeListed).toBe(true);
    expect(Object.keys(PROFILE_ISSUE_TO_STEP_CODE).sort()).toEqual([...codes].sort());
  });

  it("maps codes and rewrites paths to form paths", () => {
    const form = formFromProfile(E2E_PROFILE);
    const mapped = mapReferenceIssues(
      [
        { code: "grade_out_of_range", path: "credential.overall.value" },
        { code: "grade_out_of_range", path: "credential.subjects.1.grade.value" },
        { code: "unknown_scale", path: "credential.overall.scale" },
        { code: "unknown_scale", path: "credential.subjects.0.grade.scale" },
        { code: "unknown_country", path: "destinations.0" },
        { code: "certificate_language_mismatch", path: "languages.0.certificate" },
        { code: "unknown_certificate", path: "languages.1.certificate" },
        { code: "unknown_credential_type", path: "credential.type" },
        { code: "track_not_in_type", path: "credential.track" },
        { code: "unknown_subject", path: "credential.subjects.0.subject" },
      ],
      form,
      realCore(),
    );
    const range = { min: "0", max: "20" };
    expect(mapped).toEqual([
      { code: "out_of_range", path: "credential.overall", params: range },
      { code: "out_of_range", path: "credential.subjects.1.grade", params: range },
      { code: "unknown_option", path: "credential.type" },
      { code: "unknown_option", path: "credential.type" },
      { code: "unknown_option", path: "destinations.0" },
      { code: "certificate_language_mismatch", path: "languages.0.certificate" },
      { code: "unknown_option", path: "languages.1.certificate" },
      { code: "unknown_option", path: "credential.type" },
      { code: "unknown_option", path: "credential.track" },
      { code: "unknown_option", path: "credential.subjects.0.subject" },
    ]);
  });
});
