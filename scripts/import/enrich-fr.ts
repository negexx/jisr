import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { isValidIsoDate } from "@/data-schema/dates";
import { COLLECTIONS } from "@/data-schema/records/collections";

import { pageText } from "./evidence";
import { stampVerified } from "./promote";
import { applyVerified, type GetText, ProposalSchema, verifyProposal } from "./proposals";
import { appendLedger, DATA_DIR, type LedgerRow, parseCsv, STAGING_DIR, toYaml } from "./staging";

// The "machine-quoted" tier for French listings. The Parcoursup fiche states, in the same sentences
// on nearly every page, the French level required to enrol; Campus France Maroc states the national
// facts that hold for every programme of a kind (a Licence is six semesters, the BUT is three years,
// the fee a non-EU student pays at a public institution, the mandatory French certificate, the
// platform to apply on). Code reads those sentences, quotes them verbatim, and the same verifier as
// the pilot re-fetches every page and checks that each quote is there and agrees with the value.
// Nobody reads each programme; the extractor is what is tested.
export const MACHINE_LEVEL = "machine-quoted";

const CF = "https://www.maroc.campusfrance.org";
export const PAGES = {
  licence: `${CF}/la-licence-le-diplome-national-de-master-et-le-mastere-specialise`,
  but: "https://www.bielorussie.campusfrance.org/fr/le-but-bachelor-universitaire-de-technologie",
  fees: `${CF}/le-cout-des-etudes-les-bourses`,
  certification: `${CF}/les-certifications-en-francais-obligatoires-pour-campus-france`,
  applyLicence: `${CF}/candidature-en-1ere-annee-de-licence-a-l-universite-et-en-paces`,
  applyBut: `${CF}/candidature-en-1ere-annee-but-a-l-universite-iut`,
  // The 2026/27 application window, which also covers first-year Licence (DAP blanche).
  calendarLicence: `${CF}/calendrier-de-la-procedure-de-candidature-20262027`,
} as const;

export type Evidence = { url: string; quote: string };

// Finds the first match of `pattern` in `text` and returns the sentence exactly as the page has it.
export function sentence(text: string, pattern: RegExp): string | null {
  const match = pattern.exec(text);
  return match === null ? null : match[0].replace(/\s+/g, " ").trim();
}

export type FicheFacts = {
  frenchLevel: { level: string; quote: string } | null;
  distance: string | null;
};

export function readFiche(text: string): FicheFacts {
  const level =
    /Niveau de français requis pour s['’]inscrire à la formation\s*:\s*([A-C][12])/.exec(text);
  return {
    frenchLevel:
      level === null || level[1] === undefined
        ? null
        : { level: level[1], quote: level[0].replace(/\s+/g, " ").trim() },
    distance: sentence(text, /Cette formation propose un enseignement à distance\./),
  };
}

export type National = {
  licenceDuration: Evidence | null;
  butDuration: Evidence | null;
  tuition: Evidence | null;
  exemption: Evidence | null;
  certification: Evidence | null;
  applyLicence: Evidence | null;
  applyBut: Evidence | null;
  // The Campus France Maroc application calendar ("Du 1er octobre 2026 au 15 novembre 2026 ...").
  // The Licence one is read from the 2026/27 calendar page, with a second quote from that same page
  // that says who the window is for (the first-year Licence line, "DAP blanche").
  butCalendar: Evidence | null;
  licenceCalendar: Evidence | null;
  licenceCalendarAudience: Evidence | null;
  // What the reading left out and why ("several calendar sentences found: not proposing"), for the CLI.
  notes?: string[];
};

// The national sentences, read from the live pages (never typed): if a page changes, the quote is
// not found and the fact is simply not added.
export async function readNational(getText: GetText): Promise<National> {
  const pick = async (url: string, pattern: RegExp): Promise<Evidence | null> => {
    try {
      const quote = sentence(await getText(url), pattern);
      return quote === null ? null : { url, quote };
    } catch {
      return null;
    }
  };
  // A calendar that appears twice with different dates (one per applicant group) is ambiguous: fail
  // closed, with a note. The same sentence repeated is still one calendar.
  const notes: string[] = [];
  const pickCalendar = async (kind: string, url: string): Promise<Evidence | null> => {
    try {
      const text = await getText(url);
      // The same sentence with and without its final full stop is one calendar.
      const all = new Set(
        [...text.matchAll(new RegExp(CALENDAR_SENTENCE.source, "gu"))].map((m) =>
          m[0].replace(/\s+/g, " ").trim().replace(/\.$/, ""),
        ),
      );
      if (all.size > 1) {
        notes.push(`${kind}: several calendar sentences found: not proposing (${url})`);
        return null;
      }
      const quote = sentence(text, CALENDAR_SENTENCE);
      return quote === null ? null : { url, quote };
    } catch {
      return null;
    }
  };
  const national: National = {
    licenceDuration: await pick(
      PAGES.licence,
      /La licence est un diplôme national[^.]*se prépare en six semestres[^.]*\./,
    ),
    butDuration: await pick(PAGES.but, /Le BUT est un diplôme préparé en 3 ans en IUT/),
    tuition: await pick(PAGES.fees, /\d[\d\s {2}]*\d euros pour une année en cycle de Licence/),
    exemption: await pick(
      PAGES.fees,
      /Certains établissements exonèrent les étudiants étrangers[^.]*\./,
    ),
    certification: await pick(
      PAGES.certification,
      /Sauf cas de dispense, la certification de français \(TCF, DELF B2, DALF\) est obligatoire[^.]*\./,
    ),
    applyLicence: await pick(
      PAGES.applyLicence,
      /Vous êtes titulaire ou futur titulaire du Bac marocain[^:]*: vous devrez formuler vos vœux sur la plateforme Études en France/,
    ),
    applyBut: await pick(
      PAGES.applyBut,
      /Bac marocain ou Bac international marocain[^.]*vous devrez formuler vos vœux sur la plateforme Études en France\./,
    ),
    butCalendar: await pickCalendar("BUT", PAGES.applyBut),
    licenceCalendar: await pickCalendar("Licence", PAGES.calendarLicence),
    // Only worth reading when there is a calendar; it is read from the same page.
    licenceCalendarAudience: null,
  };
  if (national.licenceCalendar !== null) {
    national.licenceCalendarAudience = await pick(PAGES.calendarLicence, LICENCE_AUDIENCE);
    if (national.licenceCalendarAudience === null)
      notes.push(
        `Licence: the calendar page does not say who it is for (first-year Licence line): not proposing (${PAGES.calendarLicence})`,
      );
  }
  if (notes.length > 0) national.notes = notes;
  return national;
}

// "Du 1er octobre 2026 au 15 novembre 2026 à 23h59 (heure marocaine)" with or without a final full
// stop (the 2026/27 calendar page continues after the parenthesis). The page's own wording, with the
// dates in words: the numbers below are read from it by code, never typed.
const CALENDAR_SENTENCE =
  /Du\s+\d{1,2}(?:er)?\s+\p{L}+\s+\d{4}\s+au\s+\d{1,2}(?:er)?\s+\p{L}+\s+\d{4}[^.]*?\(heure marocaine\)\.?/u;
// The line of the calendar page that names first-year Licence applicants.
const LICENCE_AUDIENCE = /DAP blanche\s*:\s*1ère année de Licence à l['’]Université \(L1\)/;
const CALENDAR_DATES =
  /^Du\s+(\d{1,2})(?:er)?\s+(\p{L}+)\s+(\d{4})\s+au\s+(\d{1,2})(?:er)?\s+(\p{L}+)\s+(\d{4})\b/u;
const FRENCH_MONTHS = [
  "janvier",
  "fevrier",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "aout",
  "septembre",
  "octobre",
  "novembre",
  "decembre",
];

function isoFromFrench(day: string, month: string, year: string): string | null {
  const bare = month
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const index = FRENCH_MONTHS.indexOf(bare);
  if (index === -1) return null;
  const iso = `${year}-${String(index + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
  return isValidIsoDate(iso) ? iso : null;
}

// The intake a calendar sentence states: applications open on the first date and close on the
// second. The start of the year is not in the sentence. Anything else, or an impossible date, is null.
export function calendarIntakes(
  evidence: Evidence,
): { startDate: null; applicationOpens: string; applicationDeadline: string } | null {
  const match = CALENDAR_DATES.exec(evidence.quote.replace(/\s+/g, " ").trim());
  if (match === null) return null;
  const [, d1, m1, y1, d2, m2, y2] = match;
  if (
    d1 === undefined ||
    m1 === undefined ||
    y1 === undefined ||
    d2 === undefined ||
    m2 === undefined ||
    y2 === undefined
  )
    return null;
  const applicationOpens = isoFromFrench(d1, m1, y1);
  const applicationDeadline = isoFromFrench(d2, m2, y2);
  // ISO dates compare as text: a range that ends before it starts was misread
  return applicationOpens === null ||
    applicationDeadline === null ||
    applicationOpens > applicationDeadline
    ? null
    : { startDate: null, applicationOpens, applicationDeadline };
}

type Rec = Record<string, unknown>;

// Builds the proposal for one listed programme from its fiche and the national sentences.
export function buildProposal(input: {
  slug: string;
  fiche: string;
  isBut: boolean;
  publicInstitution: boolean;
  facts: FicheFacts;
  national: National;
}) {
  const { facts, national: n, isBut } = input;
  const duration = isBut ? n.butDuration : n.licenceDuration;
  const apply = isBut ? n.applyBut : n.applyLicence;
  const tuition = input.publicInstitution ? n.tuition : null;
  const amount = tuition === null ? null : /(\d[\d\s {2}]*\d) euros/.exec(tuition.quote)?.[1];
  const euros = amount === undefined || amount === null ? null : Number(amount.replace(/\D/g, ""));
  const rules: unknown[] = [];
  if (facts.frenchLevel !== null && n.certification !== null) {
    rules.push({
      kind: "language_proficiency",
      language: "fr",
      minCefr: facts.frenchLevel.level,
      certificateRequired: true,
      acceptedTests: ["tcf", "delf-dalf"],
      evidence: [{ url: input.fiche, quote: facts.frenchLevel.quote }, n.certification],
    });
  }
  if (facts.distance !== null) {
    rules.push({
      kind: "manual_check",
      note: {
        fr: "Formation suivie à distance : vérifiez qu'elle convient à votre projet et à votre visa.",
        en: "This programme is taught at a distance: check that it suits your plans and your visa.",
        ar: "هذا التكوين يُتابَع عن بُعد: تحقّقوا من ملاءمته لمشروعكم وللتأشيرة.",
      },
      evidence: [{ url: input.fiche, quote: facts.distance }],
    });
  }
  if (tuition !== null && n.exemption !== null) {
    rules.push({
      kind: "manual_check",
      note: {
        fr: "Droits d'inscription différenciés pour les étudiants hors Union européenne : certains établissements exonèrent, renseignez-vous sur leur site.",
        en: "Differentiated tuition fees apply to students from outside the EU: some institutions exempt them, check the institution's website.",
        ar: "تُطبَّق رسوم تسجيل مختلفة على الطلبة من خارج الاتحاد الأوروبي: بعض المؤسسات تعفيهم منها، استفسروا في موقع المؤسسة.",
      },
      evidence: [n.exemption],
    });
  }
  return ProposalSchema.parse({
    slug: input.slug,
    programmePage: input.fiche,
    facts: {
      ...(duration === null ? {} : { durationYears: { value: 3, evidence: [duration] } }),
      ...(tuition === null || euros === null
        ? {}
        : {
            tuition: {
              value: { amountMinor: euros * 100, currency: "EUR", period: "year" },
              evidence: [tuition],
            },
          }),
      ...(apply === null
        ? {}
        : { applicationChannel: { value: "fr-campus-france", evidence: [apply] } }),
    },
    requirements: { rules },
    notes:
      "Read by code from the Parcoursup fiche (French level, distance learning) and from Campus France national pages (duration, fees for a non-EU student at a public institution, certificate, platform). The national facts are not this programme's own page.",
  });
}

export function isButProgramme(record: Rec): boolean {
  return /^BUT\b/i.test(String(record.name)) || /-but-/.test(String(record.slug));
}

// The proposal enrich-fr makes for one listed record: its fiche and the national sentences.
export async function enrichProposal(input: {
  record: Rec;
  institutionType: unknown;
  fiche: string;
  national: National;
  getText: GetText;
}) {
  return buildProposal({
    slug: String(input.record.slug),
    fiche: input.fiche,
    isBut: isButProgramme(input.record),
    publicInstitution: input.institutionType === "public",
    facts: readFiche(
      input.fiche === "" ? "" : await input.getText(String(input.record.officialUrl)),
    ),
    national: input.national,
  });
}

// Applies a verified proposal to a listed record. A fact that failed verification stays "to be
// checked", exactly as it was.
export async function enrichRecord(input: {
  record: Rec;
  institutionType: unknown;
  fiche: string;
  national: National;
  getText: GetText;
  date: string;
}): Promise<{ record: Rec; facts: string[]; rules: number } | null> {
  const proposal = await enrichProposal(input);
  const verified = await verifyProposal(proposal, String(input.record.name), input.getText);
  if (verified.programmePage === null) return null;
  const applied = applyVerified(input.record, verified, input.date);
  const { _review: _drop, ...rest } = applied;
  const record = stampVerified(rest, input.date) as Rec;
  const check = COLLECTIONS.programs.schema.safeParse(record);
  if (!check.success) return null;
  return { record, facts: Object.keys(verified.facts), rules: verified.requirements?.length ?? 0 };
}

async function main(argv: readonly string[]): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  const dry = argv.includes("--dry-run");
  const limitAt = argv.indexOf("--limit");
  const limit = limitAt === -1 ? Number.POSITIVE_INFINITY : Number(argv[limitAt + 1]);
  const ledger = parseCsv(await readFile(path.join(STAGING_DIR, "PROMOTED.csv"), "utf8"));
  const listing = new Map<string, string>();
  for (const row of ledger)
    if (row.collection === "programs" && row.level === "register-listing" && row.slug)
      listing.set(row.slug, row.sourceId ?? "");

  const institutions = new Map<string, unknown>();
  for (const f of await readdir(path.join(DATA_DIR, "institutions"))) {
    const r = parse(await readFile(path.join(DATA_DIR, "institutions", f), "utf8")) as Rec;
    institutions.set(String(r.slug), r.type);
  }
  const national = await readNational(pageText);
  console.log(
    `national sentences found: ${Object.entries(national).filter(([, v]) => v !== null).length} of ${Object.keys(national).length}`,
  );
  const missing = Object.entries(national)
    .filter(([, v]) => v === null)
    .map(([k]) => k);
  if (missing.length > 0)
    console.log(`  not found (those facts are skipped): ${missing.join(", ")}`);

  const dir = path.join(DATA_DIR, "programs");
  const stats = {
    programmes: 0,
    enriched: 0,
    failed: 0,
    level: 0,
    duration: 0,
    tuition: 0,
    channel: 0,
    distance: 0,
  };
  const rows: LedgerRow[] = [];
  const todo = (await readdir(dir))
    .sort()
    .filter((f) => f.startsWith("fr-") && listing.has(f.slice(0, -5)));
  let next = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < todo.length && stats.enriched < limit) {
        const name = todo[next++];
        if (name === undefined) continue;
        stats.programmes++;
        const file = path.join(dir, name);
        const record = parse(await readFile(file, "utf8")) as Rec;
        const fiche = String(record.officialUrl);
        try {
          const done = await enrichRecord({
            record,
            institutionType: institutions.get(String(record.institution)),
            fiche,
            national,
            getText: pageText,
            date,
          });
          if (done === null) {
            stats.failed++;
            continue;
          }
          stats.enriched++;
          if (done.facts.includes("durationYears")) stats.duration++;
          if (done.facts.includes("tuition")) stats.tuition++;
          if (done.facts.includes("applicationChannel")) stats.channel++;
          if (done.rules > 0) stats.level++;
          if (JSON.stringify(done.record).includes("à distance")) stats.distance++;
          if (!dry) {
            await writeFile(file, toYaml(done.record));
            const sourceId = listing.get(name.slice(0, -5));
            if (sourceId)
              rows.push({
                collection: "programs",
                sourceId,
                slug: name.slice(0, -5),
                date,
                level: MACHINE_LEVEL,
                batch: `enrich-fr-${date}`,
              });
          }
        } catch {
          stats.failed++;
        }
      }
    }),
  );
  if (!dry) await appendLedger(rows, STAGING_DIR);
  console.log(
    `${dry ? "would enrich" : "enriched"} ${stats.enriched} of ${stats.programmes} French listed programmes (${stats.failed} left as they were)`,
  );
  console.log(
    `  with duration ${stats.duration}, tuition ${stats.tuition}, channel ${stats.channel}, requirement rules ${stats.level}`,
  );
}

if (process.argv[1]?.endsWith("enrich-fr.ts") === true) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
