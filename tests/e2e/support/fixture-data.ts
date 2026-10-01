export { DRAFT_KEY, PROFILE_KEY } from "@/lib/profile/storage";
export {
  E2E_EXPECTED,
  E2E_NOW,
  E2E_PROFILE,
  E2E_PROFILE_WITH_BUDGET,
  E2E_SCHOLARSHIP_SLUGS,
  E2E_SLUGS,
} from "../../fixtures/e2e/profiles";

export const BASE_ORIGIN = "http://localhost:3100";

// Fixed ids of the program page sections (program-sections.tsx): structure, not copy.
export const PROGRAM_SECTION_IDS = [
  "overview",
  "requirements",
  "tuition",
  "costs",
  "deadline",
  "procedure",
  "documents",
  "scholarships",
  "links",
  "verified",
] as const;
