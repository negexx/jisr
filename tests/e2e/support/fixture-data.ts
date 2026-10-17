export { MATCH_FILTERS_KEY } from "@/lib/matches/filter-store";
export { PLAN_KEY } from "@/lib/plan/progress";
export { DRAFT_KEY, PROFILE_KEY } from "@/lib/profile/storage";
export { SAVED_KEY } from "@/lib/saved/saved";
export {
  E2E_EXPECTED,
  E2E_FILTERS,
  E2E_FILTERS_WITH_BUDGET,
  E2E_FILTERS_XB_ONLY,
  E2E_NOW,
  E2E_PROFILE,
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
