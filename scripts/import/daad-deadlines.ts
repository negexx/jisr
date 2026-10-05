import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { mentionsInternationalApplicants, pageText } from "./evidence";
import { staleProposalFiles, writeCalendarProposals } from "./fr-calendar";
import { type Proposal, ProposalSchema } from "./proposals";
import { DATA_DIR, STAGING_DIR } from "./staging";

// The DAAD register page of a programme prints its application periods in a fixed shape:
//   Application periods The following is valid for applicants from: all countries
//   For the winter semester: until 15 July
// "all countries" (or "non-EU countries") includes a Moroccan applicant, so this is the deadline for
// the audience of the app, stated by the register. This reads that block by code into an intake-only
// proposal; nothing is guessed and no model is called. The verifier re-fetches the quote and the
// audit sample reads the result. Whatever does not fit the grammar below stays unknown.
export type DaadIntake = {
  startDate: null;
  applicationOpens: string | null;
  applicationDeadline: string | null;
  recurringDeadline: { month: number; day: number } | null;
};

export type DaadSkipReason =
  | "no-block"
  | "no-qualifying-audience"
  | "unparsed"
  | "summer-only"
  | "semester-unclear"
  | "past"
  | "ambiguous";

export type DaadOutcome =
  | { ok: true; intake: DaadIntake; quote: string }
  | { ok: false; reason: DaadSkipReason };

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

type Day = { day: number; month: number; year: number | null };

// "15 July" or "15 July 2027"; the month name must end the word ("Julyish" is not a date).
const DAY = String.raw`(\d{1,2})\s+(${MONTH_NAMES.join("|")})(?:\s+(\d{4}))?(?![A-Za-z\d])`;
const UNTIL = new RegExp(String.raw`^until\s+${DAY}$`, "i");
const RANGE = new RegExp(String.raw`^${DAY}\s*-\s*${DAY}$`, "i");
const PIECE =
  /^The following is valid for applicants from:\s*(.*?)\s*(?:For the (winter|summer) semester:\s*)?((?:until\s+)?\d.*)$/;

function toDay(
  dayText: string | undefined,
  monthText: string | undefined,
  yearText: string | undefined,
): Day | null {
  if (dayText === undefined || monthText === undefined) return null;
  const month = MONTH_NAMES.findIndex((name) => name.toLowerCase() === monthText.toLowerCase()) + 1;
  const day = Number(dayText);
  const year = yearText === undefined ? null : Number(yearText);
  // a real calendar date (2000 is a leap year: 29 February without a year is allowed)
  const probe = new Date(Date.UTC(year ?? 2000, month - 1, day));
  if (month < 1 || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return { day, month, year };
}

const iso = (d: Day & { year: number }): string =>
  `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;

type Period = { opens: Day | null; deadline: Day };

function parseTail(tail: string): Period | null {
  const until = UNTIL.exec(tail);
  if (until !== null) {
    const deadline = toDay(until[1], until[2], until[3]);
    return deadline === null ? null : { opens: null, deadline };
  }
  const range = RANGE.exec(tail);
  if (range === null) return null;
  const opens = toDay(range[1], range[2], range[3]);
  const deadline = toDay(range[4], range[5], range[6]);
  if (opens === null || deadline === null) return null;
  // a dated range must not end before it starts
  if (opens.year !== null && deadline.year !== null) {
    if (iso({ ...opens, year: opens.year }) > iso({ ...deadline, year: deadline.year }))
      return null;
  }
  return { opens, deadline };
}

// Only the audience shapes the register prints: "all countries", "non-EU countries" or "EU countries
// non-EU countries", optionally followed by country names ("... Iceland Norway"). Anything else (a
// semester label that did not parse, a qualifier) is an audience we do not understand.
const qualifies = (audience: string): boolean =>
  /^(?:all countries|(?:EU countries )?non-EU countries(?: [A-Z][A-Za-z]+)*)$/.test(audience);

function periodBlock(text: string): string | null {
  const marker = "Application periods";
  const start = text.indexOf(marker);
  if (start < 0) return null;
  const rest = text.slice(start + marker.length);
  const end = rest.search(/More information on application periods|Joint degree/);
  return (end < 0 ? rest.slice(0, 600) : rest.slice(0, end)).trim();
}

// `labelled`: the piece says "For the winter semester"; an unlabelled period belongs to whichever
// semester the programme begins in, which only the page's "Beginning" field can tell.
type Candidate = { intake: DaadIntake; quote: string; past: boolean; labelled: boolean };

type Beginning = "winter" | "summer" | "both" | "unknown";

function beginningOf(text: string): Beginning {
  const field = /Beginning (.{0,60}?) Application periods/.exec(text)?.[1]?.toLowerCase() ?? "";
  const winter = field.includes("winter");
  const summer = field.includes("summer");
  return winter && summer ? "both" : winter ? "winter" : summer ? "summer" : "unknown";
}

function candidateOf(piece: string, today: string): Candidate | "summer" | null {
  const match = PIECE.exec(piece);
  if (match === null) return null;
  const [, audience = "", semester, tail = ""] = match;
  if (!qualifies(audience)) return null;
  if (semester === "summer") return "summer";
  const period = parseTail(tail);
  if (period === null) return null;
  const { opens, deadline } = period;
  const dated = deadline.year !== null;
  const intake: DaadIntake = {
    startDate: null,
    applicationOpens:
      opens !== null && opens.year !== null && deadline.year !== null
        ? iso({ ...opens, year: opens.year })
        : null,
    applicationDeadline: deadline.year === null ? null : iso({ ...deadline, year: deadline.year }),
    recurringDeadline: dated ? null : { month: deadline.month, day: deadline.day },
  };
  const past = intake.applicationDeadline !== null && intake.applicationDeadline < today;
  return { intake, quote: piece, past, labelled: semester === "winter" };
}

// `today` is an ISO date. Winter-semester periods whose audience is "all countries" or "non-EU
// countries" count, and so do unlabelled ones when the programme begins in the winter semester only;
// with several of them the deadlines must agree.
export function daadDeadline(text: string, today: string): DaadOutcome {
  const block = periodBlock(text);
  if (block === null) return { ok: false, reason: "no-block" };
  const pieces = block
    .split(/(?=The following is valid for applicants from:)/)
    .map((piece) => piece.trim())
    .filter((piece) => piece.startsWith("The following is valid for applicants from:"));
  if (pieces.length === 0) return { ok: false, reason: "unparsed" };
  const usable: Candidate[] = [];
  let summer = false;
  let audienceSeen = false;
  for (const piece of pieces) {
    const header = PIECE.exec(piece);
    if (header !== null && qualifies(header[1] ?? "")) audienceSeen = true;
    const candidate = candidateOf(piece, today);
    if (candidate === "summer") summer = true;
    else if (candidate !== null) usable.push(candidate);
  }
  if (!audienceSeen) {
    return {
      ok: false,
      reason: PIECE.test(pieces[0] ?? "") ? "no-qualifying-audience" : "unparsed",
    };
  }
  if (usable.length === 0) return { ok: false, reason: summer ? "summer-only" : "unparsed" };
  const beginning = beginningOf(text);
  const eligible = usable.filter((c) => c.labelled || beginning === "winter");
  if (eligible.length === 0)
    return { ok: false, reason: beginning === "summer" ? "summer-only" : "semester-unclear" };
  const distinct = new Set(eligible.map((c) => JSON.stringify(c.intake)));
  if (distinct.size > 1) return { ok: false, reason: "ambiguous" };
  const [first] = eligible;
  if (first === undefined) return { ok: false, reason: "unparsed" };
  if (first.past) return { ok: false, reason: "past" };
  if (!mentionsInternationalApplicants(first.quote))
    return { ok: false, reason: "no-qualifying-audience" };
  return { ok: true, intake: first.intake, quote: first.quote };
}

export type DaadProgramme = { slug: string; url: string };

export async function buildDaadProposals(input: {
  programmes: readonly DaadProgramme[];
  textOf: (url: string) => Promise<string>;
  today: string;
}): Promise<{ proposals: Proposal[]; skipped: { slug: string; reason: string }[] }> {
  const proposals: Proposal[] = [];
  const skipped: { slug: string; reason: string }[] = [];
  for (const { slug, url } of input.programmes) {
    let text: string;
    try {
      text = await input.textOf(url);
    } catch {
      skipped.push({ slug, reason: "page unreadable" });
      continue;
    }
    const outcome = daadDeadline(text, input.today);
    if (!outcome.ok) {
      skipped.push({ slug, reason: outcome.reason });
      continue;
    }
    proposals.push(
      ProposalSchema.parse({
        slug,
        programmePage: url,
        facts: {
          intakes: { value: [outcome.intake], evidence: [{ url, quote: outcome.quote }] },
        },
      }),
    );
  }
  return { proposals, skipped };
}

const DAAD_PAGE = /^https:\/\/www2\.daad\.de\/.*\/international-programmes\/en\/detail\/\d+\/?$/;

// Enrichment never replaces an official value, so a record that already holds intakes (even without a
// deadline) cannot take this proposal.
const holdsIntakes = (record: Record<string, unknown>): boolean => {
  const intakes = record.intakes;
  const value =
    typeof intakes === "object" && intakes !== null && "value" in intakes ? intakes.value : null;
  return Array.isArray(value) && value.length > 0;
};

// The German programmes of a data directory whose programme page is a DAAD register page and that
// hold no intakes yet.
export async function readDaadProgrammes(dataDir: string): Promise<DaadProgramme[]> {
  const programsDir = path.join(dataDir, "programs");
  const found: DaadProgramme[] = [];
  for (const file of (await readdir(programsDir)).sort()) {
    if (!file.startsWith("de-") || !file.endsWith(".yaml")) continue;
    const record = parse(await readFile(path.join(programsDir, file), "utf8")) as Record<
      string,
      unknown
    > | null;
    if (record === null || typeof record.slug !== "string") continue;
    const sources = record.sources as { programme?: { url?: unknown } } | undefined;
    const candidates = [record.officialUrl, sources?.programme?.url];
    const url = candidates.find((u): u is string => typeof u === "string" && DAAD_PAGE.test(u));
    if (url === undefined || holdsIntakes(record)) continue;
    found.push({ slug: record.slug, url });
  }
  return found;
}

async function main(argv: readonly string[]): Promise<void> {
  const dry = argv.includes("--dry-run");
  const programmes = await readDaadProgrammes(DATA_DIR);
  const today = new Date().toISOString().slice(0, 10);
  const { proposals, skipped } = await buildDaadProposals({
    programmes,
    textOf: pageText,
    today,
  });
  const out = path.join(STAGING_DIR, "proposals-de-deadlines");
  await writeCalendarProposals(proposals, out, dry);
  console.log(
    `${dry ? "would write" : "wrote"} ${proposals.length} deadline proposals to ${out} (${programmes.length} DAAD programmes without a deadline)`,
  );
  const reasons = new Map<string, number>();
  for (const { reason } of skipped) reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  for (const [reason, count] of [...reasons].sort()) console.log(`  skipped, ${reason}: ${count}`);
  const stale = await staleProposalFiles(out, proposals);
  if (stale.length > 0)
    console.warn(
      `warning: ${stale.length} proposal file(s) in ${out} were not produced by this run (kept, not deleted): ${stale.slice(0, 5).join(", ")}${stale.length > 5 ? ", ..." : ""}`,
    );
}

if (process.argv[1]?.endsWith("daad-deadlines.ts") === true) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
