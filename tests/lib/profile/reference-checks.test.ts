import { describe, expect, it } from "vitest";

import type { Profile } from "@/data-schema/profile";
import {
  certificatesFor,
  checkProfileAgainstReference,
  type ProfileIssueCode,
  scaleForCredentialType,
} from "@/lib/profile/reference-checks";

import { profile } from "../../fixtures/domain/builders";
import { coreShard } from "./core-fixture";
import { forbidConsole } from "./no-console";

forbidConsole();

const core = coreShard();
const grade = (value: number, scale = "xx-test-scale-20") => ({ scale, value });

const cases: [ProfileIssueCode, string, Profile][] = [
  [
    "unknown_credential_type",
    "credential.type",
    profile({ credential: { type: "xx-test-missing-type" } }),
  ],
  ["unknown_credential_type", "credential.type", profile({ credential: { country: "XB" } })],
  [
    "track_not_in_type",
    "credential.track",
    profile({ credential: { track: "xx-test-track-other" } }),
  ],
  [
    "unknown_scale",
    "credential.overall.scale",
    profile({ credential: { overall: grade(14, "xx-test-scale-none") } }),
  ],
  [
    "grade_out_of_range",
    "credential.overall.value",
    profile({ credential: { overall: grade(21) } }),
  ],
  [
    "unknown_scale",
    "credential.subjects.0.grade.scale",
    profile({
      credential: { subjects: [{ subject: "xx-test-math", grade: grade(10, "xx-test-nope") }] },
    }),
  ],
  [
    "grade_out_of_range",
    "credential.subjects.0.grade.value",
    profile({ credential: { subjects: [{ subject: "xx-test-math", grade: grade(-1) }] } }),
  ],
  [
    "unknown_subject",
    "credential.subjects.0.subject",
    profile({ credential: { subjects: [{ subject: "xx-test-art", grade: grade(10) }] } }),
  ],
  [
    "unknown_certificate",
    "languages.0.certificate",
    profile({ languages: [{ language: "fr", level: "B2", certificate: "xx-test-cert-none" }] }),
  ],
  [
    "certificate_language_mismatch",
    "languages.0.certificate",
    profile({ languages: [{ language: "fr", level: "B2", certificate: "xx-test-cert-en" }] }),
  ],
  ["unknown_country", "nationality", profile({ nationality: "ZZ" })],
  ["unknown_country", "credential.country", profile({ credential: { country: "ZZ" } })],
];

describe("checkProfileAgainstReference", () => {
  it("reports no issue for a clean profile", () => {
    expect(checkProfileAgainstReference(profile(), core)).toEqual([]);
  });

  it("accepts a profile with no overall grade and no certificate", () => {
    const clean = profile({
      credential: { overall: null, subjects: [] },
      languages: [{ language: "en", level: "unknown", certificate: null }],
    });
    expect(checkProfileAgainstReference(clean, core)).toEqual([]);
  });

  it.each(cases)("flags %s at %s", (code, path, candidate) => {
    expect(checkProfileAgainstReference(candidate, core)).toContainEqual({ code, path });
  });

  it("carries only a code and a path, never a value", () => {
    const issues = checkProfileAgainstReference(profile({ nationality: "ZZ" }), core);
    expect(issues).toEqual([{ code: "unknown_country", path: "nationality" }]);
  });

  it("does not report track_not_in_type when the type itself is unknown", () => {
    const codes = checkProfileAgainstReference(
      profile({ credential: { type: "xx-test-missing-type", track: "xx-test-nothing" } }),
      core,
    ).map((issue) => issue.code);
    expect(codes).toEqual(["unknown_credential_type"]);
  });

  it.each([
    ["the minimum", 0, false],
    ["the maximum", 20, false],
    ["just below the minimum", -0.01, true],
    ["just above the maximum", 20.01, true],
    ["not a number", Number.NaN, true],
  ])("boundary: %s is out of range = %s", (_label, value, outOfRange) => {
    const issues = checkProfileAgainstReference(
      profile({ credential: { overall: grade(value) } }),
      core,
    );
    expect(issues.some((issue) => issue.code === "grade_out_of_range")).toBe(outOfRange);
  });

  it("checks a grade against its own scale, not the credential's", () => {
    const onHundred = profile({ credential: { overall: grade(85, "xx-test-scale-100") } });
    expect(checkProfileAgainstReference(onHundred, core)).toEqual([]);
  });
});

describe("certificatesFor", () => {
  it("returns only the certificates of that language", () => {
    expect(certificatesFor("en", core).map((c) => c.slug)).toEqual([
      "xx-test-cert-en",
      "xx-test-cert-en-2",
    ]);
    expect(certificatesFor("fr", core).map((c) => c.slug)).toEqual(["xx-test-cert-fr"]);
  });

  it("returns an empty list for a language without certificates", () => {
    expect(certificatesFor("de", core)).toEqual([]);
  });
});

describe("scaleForCredentialType", () => {
  it("returns the credential type's grading scale", () => {
    expect(scaleForCredentialType("xx-test-cred", core)?.slug).toBe("xx-test-scale-20");
  });

  it("returns undefined for an unknown type or a missing scale", () => {
    expect(scaleForCredentialType("xx-test-nope", core)).toBeUndefined();
    const withoutScales = { ...core, gradingScales: [] };
    expect(scaleForCredentialType("xx-test-cred", withoutScales)).toBeUndefined();
  });
});
