import { readFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { pageText } from "./evidence";
import { DATA_DIR } from "./staging";

// The national dates for Italy are VISA deadlines (the MUR procedures note: visa applications for
// Laurea courses by 30 November 2026 for 2026/27 and 31 October 2027 for 2027/28; a university may
// set an earlier date per course). They are not admission deadlines, so they are not turned into
// programme intakes: they live in the note of the route ma-bac-to-it. This command re-reads the
// Universitaly page, parses the two deadlines by code and checks that the route note still states
// them in English and French. It writes nothing.
const PAGE = "https://www.universitaly.it/en/studenti-stranieri";
const ROUTE_FILE = path.join(DATA_DIR, "admission-routes", "ma-bac-to-it.yaml");
const CONDITION_ID = "universitaly-preenrolment-and-visa";

const MONTHS = [
  { it: "gennaio", en: "January", fr: "janvier" },
  { it: "febbraio", en: "February", fr: "février" },
  { it: "marzo", en: "March", fr: "mars" },
  { it: "aprile", en: "April", fr: "avril" },
  { it: "maggio", en: "May", fr: "mai" },
  { it: "giugno", en: "June", fr: "juin" },
  { it: "luglio", en: "July", fr: "juillet" },
  { it: "agosto", en: "August", fr: "août" },
  { it: "settembre", en: "September", fr: "septembre" },
  { it: "ottobre", en: "October", fr: "octobre" },
  { it: "novembre", en: "November", fr: "novembre" },
  { it: "dicembre", en: "December", fr: "décembre" },
];
const MONTH_PATTERN = MONTHS.map((m) => m.it).join("|");
const APOSTROPHE = "[’']";
const DATE = `(\\d{1,2})\\s+(${MONTH_PATTERN})\\s+(\\d{4})`;

export type VisaDeadline = { academicYear: string; date: string };

function isoDate(day: string, month: string, year: string): string | null {
  const index = MONTHS.findIndex((m) => m.it === month.toLowerCase());
  const d = Number(day);
  const y = Number(year);
  if (index === -1) return null;
  const check = new Date(Date.UTC(y, index, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== index || check.getUTCDate() !== d) {
    return null;
  }
  return `${year}-${String(index + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// "Per l'anno accademico 2026/2027, le domande di visto dovranno essere presentate ... entro e non
// oltre il 30 novembre 2026" and "Per l'anno accademico 2027/2028, invece, il termine ultimo per la
// presentazione delle domande di visto è fissato al 31 ottobre 2027".
export function parseVisaDeadlines(text: string): VisaDeadline[] {
  const flat = text.replace(/\s+/g, " ");
  const patterns = [
    new RegExp(
      `anno accademico (\\d{4}/\\d{4}),? le domande di visto dovranno essere presentate[^.]{0,160}?entro e non oltre il ${DATE}`,
      "gi",
    ),
    new RegExp(
      `anno accademico (\\d{4}/\\d{4}),? invece,? il termine ultimo per la presentazione delle domande di visto (?:è|e${APOSTROPHE}|e) fissato al ${DATE}`,
      "gi",
    ),
  ];
  const found: VisaDeadline[] = [];
  for (const pattern of patterns) {
    for (const m of flat.matchAll(pattern)) {
      const [, academicYear, day, month, year] = m;
      if (academicYear === undefined || day === undefined || month === undefined) continue;
      if (year === undefined) continue;
      const date = isoDate(day, month, year);
      if (date !== null) found.push({ academicYear, date });
    }
  }
  return found.sort((a, b) => a.date.localeCompare(b.date));
}

export function dateInNote(note: string, iso: string, locale: "en" | "fr"): boolean {
  const [year, month, day] = iso.split("-");
  const name = MONTHS[Number(month) - 1]?.[locale];
  if (year === undefined || name === undefined || day === undefined) return false;
  return new RegExp(`(?<!\\d)${Number(day)}\\s+${name}\\s+${year}`, "i").test(note);
}

export function checkRouteDates(
  deadlines: readonly VisaDeadline[],
  note: { en: string; fr: string },
): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  if (deadlines.length === 0) {
    problems.push("no visa deadline could be parsed from the page: the wording changed");
  }
  for (const d of deadlines) {
    for (const locale of ["en", "fr"] as const) {
      if (!dateInNote(note[locale], d.date, locale)) {
        problems.push(
          `${d.academicYear}: the page says ${d.date}, the ${locale} route note does not`,
        );
      }
    }
  }
  return { ok: problems.length === 0, problems };
}

type Condition = { id?: string; note?: { en?: { text?: string }; fr?: { text?: string } } };

async function main(): Promise<void> {
  const route = parse(await readFile(ROUTE_FILE, "utf8")) as { conditions?: Condition[] };
  const condition = route.conditions?.find((c) => c.id === CONDITION_ID);
  const note = {
    en: condition?.note?.en?.text ?? "",
    fr: condition?.note?.fr?.text ?? "",
  };
  const deadlines = parseVisaDeadlines(await pageText(PAGE));
  for (const d of deadlines)
    console.log(`page: visa applications for ${d.academicYear} by ${d.date}`);
  const result = checkRouteDates(deadlines, note);
  if (result.ok) {
    console.log("OK: the route note states every visa deadline the page states");
    return;
  }
  for (const p of result.problems) console.log(`PROBLEM: ${p}`);
  process.exitCode = 1;
}

if (process.argv[1]?.endsWith("it-calendar.ts") === true) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
