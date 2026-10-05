import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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

function holdsRules(record: Loose): boolean {
  const rules = asObject(record.requirements).rules;
  return Array.isArray(rules) && rules.length > 0;
}

// An intake has a deadline when it states a date or a recurring (month, day).
function holdsDeadline(record: Loose): boolean {
  const value = asObject(record.intakes).value;
  if (!Array.isArray(value)) return false;
  return value.some((intake) => {
    const item = asObject(intake);
    const date = item.applicationDeadline;
    const hasDate = date !== null && date !== undefined && date !== "";
    return hasDate || (item.recurringDeadline !== null && item.recurringDeadline !== undefined);
  });
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
    if (holdsRules(record)) bump("rules");
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

// Detail mode: the same facts (plus "deadline": an intake with a date or a recurring one), per
// institution and per programme.
const DETAIL_FACTS: readonly { key: string; held: (record: Loose) => boolean }[] = [
  { key: "tuition", held: (r) => holdsValue(r.tuition) },
  { key: "language", held: (r) => holdsValue(r.teachingLanguages) },
  { key: "intakes", held: (r) => holdsValue(r.intakes) },
  { key: "deadline", held: holdsDeadline },
  { key: "channel", held: (r) => holdsValue(r.applicationChannel) },
  { key: "documents", held: (r) => holdsValue(r.documents) },
  { key: "duration", held: (r) => holdsValue(r.durationYears) },
  { key: "rules", held: holdsRules },
];

export type ProgrammeDetail = {
  country: string;
  institution: string;
  institutionName: string;
  slug: string;
  name: string;
  held: Record<string, boolean>;
  missing: string[];
};

const textOr = (value: unknown, fallback: string): string =>
  typeof value === "string" && value !== "" ? value : fallback;

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function detailOf(
  records: readonly Record<string, unknown>[],
  institutionNames: Readonly<Record<string, string>>,
): ProgrammeDetail[] {
  const rows = records.map((record): ProgrammeDetail => {
    const institution = textOr(record.institution, "?");
    const slug = textOr(record.slug, "?");
    const held = Object.fromEntries(DETAIL_FACTS.map(({ key, held: fn }) => [key, fn(record)]));
    return {
      country: textOr(record.country, "?"),
      institution,
      institutionName: institutionNames[institution] ?? institution,
      slug,
      name: textOr(record.name, slug),
      held,
      missing: DETAIL_FACTS.filter(({ key }) => held[key] !== true).map(({ key }) => key),
    };
  });
  return rows.sort(
    (a, b) =>
      byText(a.country, b.country) ||
      byText(a.institutionName, b.institutionName) ||
      byText(a.institution, b.institution) ||
      byText(a.slug, b.slug),
  );
}

type Group = { country: string; institution: string; name: string; rows: ProgrammeDetail[] };

// Rows arrive sorted, so one institution's programmes are adjacent.
function groupByInstitution(rows: readonly ProgrammeDetail[]): Group[] {
  const groups: Group[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last?.country === row.country && last.institution === row.institution) last.rows.push(row);
    else
      groups.push({
        country: row.country,
        institution: row.institution,
        name: row.institutionName,
        rows: [row],
      });
  }
  return groups;
}

const tableCell = (value: string): string => value.replace(/\|/g, "\\|");

export function renderDetail(rows: readonly ProgrammeDetail[]): string {
  const groups = groupByInstitution(rows);
  const keys = DETAIL_FACTS.map(({ key }) => key);
  const line = (cells: readonly string[]): string => `| ${cells.join(" | ")} |`;
  const out: string[] = ["# Coverage by institution", ""];
  for (const country of [...new Set(groups.map((g) => g.country))]) {
    out.push(
      `## ${country}`,
      "",
      line(["Institution", "Slug", "Programmes", ...keys, "All facts"]),
      line(["---", "---", ...Array<string>(keys.length + 2).fill("---:")]),
    );
    for (const group of groups.filter((g) => g.country === country)) {
      const held = (key: string): string =>
        String(group.rows.filter((row) => row.held[key] === true).length);
      const all = String(group.rows.filter((row) => row.missing.length === 0).length);
      out.push(
        line([
          tableCell(group.name),
          group.institution,
          String(group.rows.length),
          ...keys.map(held),
          all,
        ]),
      );
    }
    out.push("");
  }
  out.push("# Programmes with missing facts", "");
  let any = false;
  for (const group of groups) {
    const incomplete = group.rows.filter((row) => row.missing.length > 0);
    if (incomplete.length === 0) continue;
    any = true;
    out.push(`## ${group.country} / ${group.name} (${group.institution})`, "");
    for (const row of incomplete)
      out.push(`- ${row.slug} (${row.name}): ${row.missing.join(", ")}`);
    out.push("");
  }
  if (!any) out.push("None.", "");
  return out.join("\n");
}

const csvCell = (value: string): string =>
  /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export function renderCsv(rows: readonly ProgrammeDetail[]): string {
  const keys = DETAIL_FACTS.map(({ key }) => key);
  const header = [
    "country",
    "institution_slug",
    "institution_name",
    "programme_slug",
    "programme_name",
    ...keys,
    "missing_count",
  ];
  const body = rows.map((row) =>
    [
      row.country,
      row.institution,
      row.institutionName,
      row.slug,
      row.name,
      ...keys.map((key) => (row.held[key] === true ? "1" : "0")),
      String(row.missing.length),
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...body].join("\n");
}

function readYamlDir(dir: string): Loose[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".yaml"))
    .sort()
    .map((name) => asObject(parse(readFileSync(path.join(dir, name), "utf8"))));
}

type Options = { detail: boolean; out: string | null; csv: string | null };

function parseArgs(argv: readonly string[]): Options {
  const options: Options = { detail: false, out: null, csv: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--detail") options.detail = true;
    else if (arg === "--out" || arg === "--csv") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--"))
        throw new Error(`${arg} needs a file path`);
      options[arg === "--out" ? "out" : "csv"] = value;
      i += 1;
    } else throw new Error(`unknown argument: ${arg ?? ""}`);
  }
  if (options.out !== null && !options.detail) throw new Error("--out needs --detail");
  return options;
}

// Returns what to print; writes a file only for --out / --csv.
export function runCoverage(argv: readonly string[], dataDir: string): string {
  const options = parseArgs(argv);
  const records = readYamlDir(path.join(dataDir, "programs"));
  if (!options.detail && options.csv === null) return renderCoverage(coverageOf(records));
  const names: Record<string, string> = {};
  for (const institution of readYamlDir(path.join(dataDir, "institutions"))) {
    if (typeof institution.slug === "string" && typeof institution.name === "string")
      names[institution.slug] = institution.name;
  }
  const rows = detailOf(records, names);
  if (options.csv !== null) writeFileSync(options.csv, `${renderCsv(rows)}\n`);
  if (!options.detail) return renderCoverage(coverageOf(records));
  const report = renderDetail(rows);
  if (options.out === null) return report;
  writeFileSync(options.out, `${report}\n`);
  return "";
}

if (process.argv[1]?.endsWith("coverage.ts") === true) {
  try {
    const output = runCoverage(process.argv.slice(2), "data");
    if (output !== "") console.log(output);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
