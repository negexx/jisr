// One source of truth for how the merge tables are compiled: next.config.ts (dev, typegen, build),
// the Vitest global setup and `pnpm cn:build` all pass exactly these options.
// The scan is limited to src/ (the same code Tailwind scans for class names) and the output lives
// outside src/ so the generated file can never feed back into its own token scan.
export const CN_BUILD_OPTIONS = {
  content: ["src/**/*.{ts,tsx}"],
  css: "src/app/globals.css",
  out: "generated/cn-tables.ts",
} as const;
