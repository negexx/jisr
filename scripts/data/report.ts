import type { Locale } from "@/data-schema/primitives";

import type { Issue } from "./load-data";
import type { FreshnessRow, ValidationResult } from "./validate";

export type CheckOutput = { stdout: string[]; stderr: string[]; exitCode: 0 | 1 };

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function issueLine(prefix: string, issue: Issue): string {
  const where = issue.path === "" ? "" : `${issue.path}: `;
  return `${prefix} ${issue.file}: ${where}${issue.message}`;
}

function freshnessLine(label: string, row: FreshnessRow): string {
  const where = row.path === "" ? "(record)" : row.path;
  return `${label} ${row.file}: ${where} last verified ${row.lastVerifiedAt}, ${row.ageDays} days ago (${row.class})`;
}

export function formatReport(result: ValidationResult, opts: { strict: boolean }): CheckOutput {
  const errors = [...result.errors].sort((a, b) => compareText(a.file, b.file));
  const warnings = [...result.warnings].sort((a, b) => compareText(a.file, b.file));
  const stale = result.freshness.filter((row) => row.freshness === "stale");
  const aging = result.freshness.filter((row) => row.freshness === "aging");
  const fresh = result.freshness.length - stale.length - aging.length;
  const coverage = (locale: Locale) => {
    const { present, total, reviewed } = result.translations[locale];
    return `${locale} ${present}/${total} (${reviewed} reviewed)`;
  };

  const failedByStrict = errors.length === 0 && opts.strict && stale.length > 0;
  const failed = errors.length > 0 || failedByStrict;
  const verdict = failed
    ? `data:check: FAILED${failedByStrict ? ` (--strict: ${stale.length} stale)` : ""}`
    : "data:check: OK";

  return {
    stderr: errors.map((issue) => issueLine("ERROR", issue)),
    stdout: [
      ...warnings.map((issue) => issueLine("WARN", issue)),
      ...stale.map((row) => freshnessLine("STALE", row)),
      ...aging.map((row) => freshnessLine("AGING", row)),
      `freshness: ${fresh} fresh, ${aging.length} aging, ${stale.length} stale`,
      `translations: ${coverage("fr")}, ${coverage("en")}, ${coverage("ar")}`,
      `data:check: ${result.recordCount} records, ${errors.length} errors, ${warnings.length} warnings`,
      verdict,
    ],
    exitCode: failed ? 1 : 0,
  };
}
