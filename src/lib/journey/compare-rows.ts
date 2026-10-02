// The topics a comparison is made of, in display order. Dependency-free on purpose: the grid imports
// this at runtime while the heavy view model (compare-view.ts) stays behind a dynamic import.
export const COMPARE_ROWS = [
  "result",
  "tuition",
  "cost",
  "language",
  "deadline",
  "scholarships",
  "application",
] as const;
export type CompareRowId = (typeof COMPARE_ROWS)[number];
