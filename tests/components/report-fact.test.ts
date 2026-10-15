import { describe, expect, it } from "vitest";

import { REPORT_FACT_KEYS, reportFactKey } from "@/components/report-outdated/report-fact";
import { COST_CATEGORIES } from "@/lib/i18n/vocabulary";

import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

describe("reportFactKey", () => {
  it.each([
    ["programs/x", "tuition", "tuition"],
    ["programs/x", "teachingLanguages", "teachingLanguages"],
    ["programs/x", "durationYears", "duration"],
    ["programs/x", "requirements", "requirements"],
    ["programs/x", "requirements.rules.lang-fr", "requirements"],
    ["programs/x", "intakes", "deadline"],
    ["programs/x", "applicationChannel", "applicationChannel"],
    ["programs/x", "documents", "documents"],
    ["programs/x", "somethingNew", "program"],
    ["scholarships/x", "support", "scholarshipAmount"],
    ["scholarships/x", "deadline", "scholarshipDeadline"],
    ["scholarships/x", "documents", "scholarshipDocuments"],
    ["scholarships/x", "requirements.rules.r1", "scholarshipEligibility"],
    ["scholarships/x", "", "scholarship"],
    ["institutions/x", "", "institution"],
    ["application-channels/x", "", "applicationChannel"],
    ["admission-routes/x", "guidance.crous", "admissionRoute"],
    ["grading-scales/x", "", "gradeConversion"],
    ["grade-conversions/x", "", "gradeConversion"],
    ["credential-types/x", "", "credential"],
    ["cost-profiles/fr-paris", "lines.housing", "housing"],
    ["cost-profiles/fr-paris", "lines.application_visa", "application_visa"],
    ["cost-profiles/fr-paris", "lines.unknown", "other"],
    ["somewhere/x", "", "other"],
  ] as const)("maps %s %j to %s", (record, path, key) => {
    expect(reportFactKey(record, path)).toBe(key);
  });

  it("has a key for every cost category a cost line can carry", () => {
    for (const category of COST_CATEGORIES) {
      expect(REPORT_FACT_KEYS).toContain(category);
    }
  });

  it.each([
    ["fr", fr],
    ["en", en],
    ["ar", ar],
  ] as const)("has a label for every key in %s", (_locale, catalog) => {
    expect(Object.keys(catalog.reportOutdated.facts).sort()).toEqual([...REPORT_FACT_KEYS].sort());
    for (const label of Object.values(catalog.reportOutdated.facts)) {
      expect(label.trim().length).toBeGreaterThan(0);
    }
  });
});
