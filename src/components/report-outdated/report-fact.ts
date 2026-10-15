import type { ReportCopy } from "./report-context";

// Which fact a report button is about, for its accessible name ("Report outdated info: tuition
// fees"): a screen-reader list of buttons must say what each one reports, not repeat one label.
// The table lives here, on the server (loadReportCopy) and in tests: the page hands the button a
// ready lookup of labels, so the client only splits the record and path (reportContext in
// report-trigger.tsx) and no table ships in the shared chunks a guest loads.

export const REPORT_FACT_KEYS = [
  "tuition",
  "teachingLanguages",
  "duration",
  "requirements",
  "deadline",
  "applicationChannel",
  "documents",
  "program",
  "institution",
  "admissionRoute",
  "gradeConversion",
  "credential",
  "scholarshipAmount",
  "scholarshipDeadline",
  "scholarshipDocuments",
  "scholarshipEligibility",
  "scholarship",
  "housing",
  "food",
  "transport",
  "insurance",
  "application_visa",
  "setup",
  "other",
] as const;

export type ReportFactKey = (typeof REPORT_FACT_KEYS)[number];

// Lookup key: "<record kind>:<first path segment>" (for a cost line, the segment after "lines."),
// then "<record kind>" for anything else in that kind, then "other".
const LOOKUP: Record<string, ReportFactKey> = {
  "programs:tuition": "tuition",
  "programs:teachingLanguages": "teachingLanguages",
  "programs:durationYears": "duration",
  "programs:requirements": "requirements",
  "programs:intakes": "deadline",
  "programs:applicationChannel": "applicationChannel",
  "programs:documents": "documents",
  programs: "program",
  "scholarships:support": "scholarshipAmount",
  "scholarships:deadline": "scholarshipDeadline",
  "scholarships:documents": "scholarshipDocuments",
  "scholarships:requirements": "scholarshipEligibility",
  scholarships: "scholarship",
  institutions: "institution",
  "application-channels": "applicationChannel",
  "admission-routes": "admissionRoute",
  "grading-scales": "gradeConversion",
  "grade-conversions": "gradeConversion",
  "credential-types": "credential",
  "cost-profiles:housing": "housing",
  "cost-profiles:food": "food",
  "cost-profiles:transport": "transport",
  "cost-profiles:insurance": "insurance",
  "cost-profiles:application_visa": "application_visa",
  "cost-profiles:setup": "setup",
  other: "other",
};

export type ReportMessages = Omit<ReportCopy, "factLabels"> & {
  facts: Record<ReportFactKey, string>;
};

/** The button's copy from the `reportOutdated` messages, with the fact lookup resolved. */
export function reportCopyFrom(messages: ReportMessages): ReportCopy {
  const { facts, ...rest } = messages;
  const factLabels = Object.fromEntries(
    Object.entries(LOOKUP).map(([lookup, key]) => [lookup, facts[key]]),
  );
  return { ...rest, factLabels };
}
