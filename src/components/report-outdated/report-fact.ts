// Which fact a report button is about, for its accessible name ("Report outdated info: tuition
// fees"): a screen-reader list of buttons must say what each one reports, not repeat one label.
// Derived from the report's record and path, so every surface that files a report names its fact
// without passing a label. Zod-free: it ships with the button.

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

const PROGRAM_PATHS: Record<string, ReportFactKey> = {
  tuition: "tuition",
  teachingLanguages: "teachingLanguages",
  durationYears: "duration",
  requirements: "requirements",
  intakes: "deadline",
  applicationChannel: "applicationChannel",
  documents: "documents",
};

const SCHOLARSHIP_PATHS: Record<string, ReportFactKey> = {
  support: "scholarshipAmount",
  deadline: "scholarshipDeadline",
  documents: "scholarshipDocuments",
  requirements: "scholarshipEligibility",
};

const RECORD_KINDS: Record<string, ReportFactKey> = {
  institutions: "institution",
  "application-channels": "applicationChannel",
  "admission-routes": "admissionRoute",
  "grading-scales": "gradeConversion",
  "grade-conversions": "gradeConversion",
  "credential-types": "credential",
};

function isFactKey(value: string): value is ReportFactKey {
  return (REPORT_FACT_KEYS as readonly string[]).includes(value);
}

export function reportFactKey(record: string, path: string): ReportFactKey {
  const kind = record.split("/")[0] ?? "";
  const [head = "", second = ""] = path.split(".");
  if (kind === "programs") return PROGRAM_PATHS[head] ?? "program";
  if (kind === "scholarships") return SCHOLARSHIP_PATHS[head] ?? "scholarship";
  // Cost lines are `lines.<category>`; a category with no label of its own is still a cost fact.
  if (kind === "cost-profiles") return head === "lines" && isFactKey(second) ? second : "other";
  return RECORD_KINDS[kind] ?? "other";
}
