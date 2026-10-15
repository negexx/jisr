import { describe, expect, it } from "vitest";

import { REPORT_FACT_KEYS, reportCopyFrom } from "@/components/report-outdated/report-fact";
import { reportContext } from "@/components/report-outdated/report-trigger";
import { COST_CATEGORIES } from "@/lib/i18n/vocabulary";

import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

const copy = reportCopyFrom(en.reportOutdated);

describe("reportContext with the copy a page builds", () => {
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
  ] as const)("names %s %j as the %s fact", (record, path, key) => {
    expect(reportContext(copy, record, path)).toBe(`: ${en.reportOutdated.facts[key]}`);
  });

  it("names every cost category a cost line can carry", () => {
    for (const category of COST_CATEGORIES) {
      if (category === "tuition") continue;
      expect(reportContext(copy, "cost-profiles/x", `lines.${category}`)).not.toBe(
        `: ${en.reportOutdated.facts.other}`,
      );
    }
  });

  it("puts a no-break space before the colon in French", () => {
    expect(reportContext(reportCopyFrom(fr.reportOutdated), "programs/x", "tuition")).toBe(
      "\u00a0: frais de scolarité",
    );
  });

  it.each([
    ["fr", fr],
    ["en", en],
    ["ar", ar],
  ] as const)("has a label for every fact in %s", (_locale, catalog) => {
    expect(Object.keys(catalog.reportOutdated.facts).sort()).toEqual([...REPORT_FACT_KEYS].sort());
    for (const label of Object.values(catalog.reportOutdated.facts)) {
      expect(label.trim().length).toBeGreaterThan(0);
    }
  });
});
