import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { parse } from "yaml";

// How many programmes hold a value for each fact, per country: the measure of how much research is
// left. A fact "holds a value" when it is not null and, for a list, not empty.
type Row = { key: string; label: string };
const ROWS: readonly Row[] = [
  { key: "n", label: "programmes" },
  { key: "tuition", label: "tuition" },
  { key: "tuition official", label: "tuition (official)" },
  { key: "language", label: "teaching language" },
  { key: "intakes", label: "intakes" },
  { key: "channel", label: "application channel" },
  { key: "documents", label: "documents" },
  { key: "duration", label: "duration" },
  { key: "rules", label: "requirement rules" },
];

const FACTS: readonly { key: string; field: string }[] = [
  { key: "tuition", field: "tuition" },
  { key: "language", field: "teachingLanguages" },
  { key: "intakes", field: "intakes" },
  { key: "channel", field: "applicationChannel" },
  { key: "documents", field: "documents" },
  { key: "duration", field: "durationYears" },
];

type Loose = Record<string, unknown>;

const asObject = (value: unknown): Loose =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Loose) : {};

function holdsValue(fact: unknown): boolean {
  const value = asObject(fact).value;
  if (value === null || value === undefined) return false;
  return !Array.isArray(value) || value.length > 0;
}

export function coverageOf(
  records: readonly Record<string, unknown>[],
): Record<string, Record<string, number>> {
  const table: Record<string, Record<string, number>> = {};
  for (const record of records) {
    const country = typeof record.country === "string" ? record.country : "?";
    const counts = table[country] ?? Object.fromEntries(ROWS.map((row) => [row.key, 0] as const));
    table[country] = counts;
    const bump = (key: string): void => {
      counts[key] = (counts[key] ?? 0) + 1;
    };
    bump("n");
    for (const { key, field } of FACTS) if (holdsValue(record[field])) bump(key);
    if (holdsValue(record.tuition) && asObject(record.tuition).info_kind === "official")
      bump("tuition official");
    const rules = asObject(record.requirements).rules;
    if (Array.isArray(rules) && rules.length > 0) bump("rules");
  }
  return table;
}

export function renderCoverage(table: Record<string, Record<string, number>>): string {
  const countries = Object.keys(table).sort();
  const line = (cells: readonly string[]): string => `| ${cells.join(" | ")} |`;
  return [
    line(["Fact", ...countries]),
    line(["---", ...countries.map(() => "---:")]),
    ...ROWS.map((row) =>
      line([row.label, ...countries.map((country) => String(table[country]?.[row.key] ?? 0))]),
    ),
  ].join("\n");
}

if (process.argv[1]?.endsWith("coverage.ts") === true) {
  const dir = path.join("data", "programs");
  const records = readdirSync(dir)
    .filter((name) => name.endsWith(".yaml"))
    .map((name) => asObject(parse(readFileSync(path.join(dir, name), "utf8"))));
  console.log(renderCoverage(coverageOf(records)));
}
