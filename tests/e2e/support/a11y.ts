import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type TestInfo } from "@playwright/test";

type Impact = "minor" | "moderate" | "serious" | "critical";

const BLOCKING: readonly Impact[] = ["serious", "critical"];
const FINDINGS_FILE = path.resolve("test-results", "a11y-findings.jsonl");

function isImpact(value: unknown): value is Impact {
  return value === "minor" || value === "moderate" || value === "serious" || value === "critical";
}

export type ScanSummary = {
  blocking: Array<{ id: string; impact: Impact; nodes: number; help: string }>;
  advisory: Array<{ id: string; impact: Impact; nodes: number }>;
};

// Zero serious or critical violations is the gate; moderate and minor ones are written to
// test-results/a11y-findings.jsonl (one line per scan) so they are reported, not hidden.
export async function expectNoSeriousViolations(
  page: Page,
  label: string,
  testInfo: TestInfo,
): Promise<ScanSummary> {
  const results = await new AxeBuilder({ page }).analyze();
  const summary: ScanSummary = { blocking: [], advisory: [] };
  for (const violation of results.violations) {
    const impact = violation.impact;
    if (!isImpact(impact)) continue;
    if (BLOCKING.includes(impact)) {
      summary.blocking.push({
        id: violation.id,
        impact,
        nodes: violation.nodes.length,
        help: violation.help,
      });
    } else {
      summary.advisory.push({ id: violation.id, impact, nodes: violation.nodes.length });
    }
  }
  mkdirSync(path.dirname(FINDINGS_FILE), { recursive: true });
  appendFileSync(
    FINDINGS_FILE,
    `${JSON.stringify({ project: testInfo.project.name, label, advisory: summary.advisory })}\n`,
  );
  expect(summary.blocking, `serious or critical accessibility violations on ${label}`).toEqual([]);
  return summary;
}
