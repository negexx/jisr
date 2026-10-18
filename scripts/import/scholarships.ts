import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";
import { z } from "zod";

import { isValidIsoDate } from "@/data-schema/dates";
import { MonthDaySchema } from "@/data-schema/records/program";
import { ScholarshipRecordSchema, SUPPORT_COVERS } from "@/data-schema/records/scholarship";

import { dropAuditRows } from "./audit";
import { sameSite } from "./discover";
import {
  amountMatches,
  checkDeadline,
  checkRecurringDeadline,
  countDates,
  dateSpans,
  type FactCheck,
  mentionsInternationalApplicants,
  mentionsTranslation,
  normalizeForMatch,
  pageText,
  quoteInText,
  wholeWord,
} from "./evidence";
import { toMinor } from "./money";
import { stampVerified } from "./promote";
import { DocumentProposalSchema, type GetText } from "./proposals";
import { DATA_DIR, STAGING_DIR, stageFile, toYaml } from "./staging";

// A scholarship is proposed (by the assistant, from the provider's official pages) as a value for
// each field plus verbatim quotes. The code re-fetches every cited page and keeps a quote only if it
// is really there, then keeps a fact only if a kept quote supports it: the model proposes, the code
// decides, and what no quote supports stays unknown (null). The staged record goes through the same
// audit sample and promotion as the assistant-prepared programmes.
// Usage: data:scholarship verify <proposal.json> [--dry-run]
const Https = z.string().refine((u) => u.startsWith("https://") && URL.canParse(u), "https url");
const Slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const Ev = z.object({ url: Https, quote: z.string().min(1) });
const Text = z.object({
  fr: z.string().trim().min(1).max(400),
  en: z.string().trim().min(1).max(400).optional(),
});

const ScholarshipProposalObject = z.object({
  slug: Slug,
  name: z.string().trim().min(1),
  provider: z.string().trim().min(1),
  destinations: z.array(z.string().regex(/^[A-Z]{2}$/)).min(1),
  institutions: z.array(Slug).optional(),
  eligibleNationalities: z.array(z.string().regex(/^[A-Z]{2}$/)),
  fields: z.array(Slug),
  summary: Text,
  howToApply: Text,
  officialUrl: Https,
  // Amounts are in major units (EUR 5000 = 5000), whole numbers; code converts to minor units.
  support: z
    .object({
      amount: z
        .object({
          min: z.number().int().nonnegative(),
          max: z.number().int().nonnegative(),
          currency: z.string().regex(/^[A-Z]{3}$/),
          per: z.enum(["month", "year", "once", "total"]),
        })
        .refine((a) => a.min <= a.max, { message: "min must be <= max" })
        .nullable(),
      covers: z.array(z.enum(SUPPORT_COVERS)),
    })
    .nullable(),
  deadline: z
    .string()
    .refine(isValidIsoDate, { message: "Expected a real date YYYY-MM-DD" })
    .nullable(),
  // A deadline the source states with a day and a month but no year ("15 January"): it repeats every
  // year. Never together with a dated deadline (ADR 0009).
  recurringDeadline: MonthDaySchema.nullable().optional(),
  documents: z.array(DocumentProposalSchema).nullable(),
  evidence: z.object({
    eligibility: z.array(Ev),
    level: z.array(Ev),
    support: z.array(Ev).optional(),
    deadline: z.array(Ev).optional(),
    howToApply: z.array(Ev),
  }),
});
export const ScholarshipProposalSchema = ScholarshipProposalObject.refine(
  (p) => !(p.deadline !== null && (p.recurringDeadline ?? null) !== null),
  { message: "a scholarship has a dated deadline or a recurring one, not both" },
);
export type ScholarshipProposal = z.infer<typeof ScholarshipProposalSchema>;

type Quote = { url: string; quote: string };
export type ScholarshipEvidence = { fact: string; url: string; quote: string };
export type ScholarshipVerified =
  | {
      ok: true;
      record: Record<string, unknown>;
      evidence: ScholarshipEvidence[];
      // Facts the proposal made that no quote supports: set to unknown, with the reason.
      notes: string[];
    }
  | { ok: false; reasons: string[] };

// --- level ----------------------------------------------------------------------------------------
// The scholarship itself must be open to bachelor (first-degree) students. A quote that makes it a
// master/doctoral scholarship, or that requires a bachelor's degree to apply, proves the opposite.
// A scheme that lists bachelor AND master as the levels it covers ("bachelor's or master's") is open
// to bachelor students too: Jisr only shows it on bachelor programmes (a both-levels quote).
const GRADUATE_LEVEL =
  /\bmaster|postgraduate|(?<!under)\bgraduate (?:students|studies|programmes?|programs?)|\bph\.?d\b|doctora|\bpromotion\b|laurea magistrale|lauree magistrali|dottorat|post-?\s?laurea|specializzazione|specialistic|secondo (?:livello|ciclo)/i;
const BACHELOR_PREREQUISITE: readonly RegExp[] = [
  /\b(?:hold|holds|holding|holders?|completed|graduates?)\s+(?:of\s+)?(?:an?\s+|the\s+|their\s+)?(?:bachelor|licence|undergraduate degree)/i,
  /\bbachelor['’]?s?(?: degree)?\s+(?:holders?|required|is required)/i,
  /\b(?:with|having|have|has)\s+(?:an?\s+|completed\s+(?:an?\s+)?)?bachelor/i,
  /titulaires?\s+d['’]une\s+licence/i,
  /\bbachelor-?abschluss|abgeschlossen\w*\s+bachelor|\bbachelor-?absolvent/i,
  // graduates of a bachelor have finished it: the scholarship is for what comes after
  /\bbachelor['’]?s?(?:\s+degree)?\s+(?:graduates?|holders?|alumni|diploma)\b/i,
  /\b(?:after|finished|obtained|earned|completed)\s+(?:their\s+|a\s+|an\s+)?bachelor/i,
  // "a bachelor's or master's degree is required": a prerequisite even when both are named
  /\bmaster['’]?s?(?:\s+degree)?\s+(?:holders?|required|is required|is needed|needed)\b/i,
  // possessing, completing or graduating in a bachelor's degree ("in possession of the title of
  // bachelor's degree", "upon completion of", "graduated in", "the final year of")
  /\b(?:in\s+possession\s+of|possess(?:ing|es)?|completion\s+of|graduat\w*\s+(?:in|from)|title\s+of|diploma\s+of|(?:final|last)\s+year\s+of|end\s+of|achieved)\s+(?:an?\s+|the\s+)?(?:title\s+of\s+)?bachelor/i,
  /\bgraduat\w*\s+in\s+(?:an?\s+|the\s+)?bachelor/i,
  // "holding a degree" (with no level named) is a degree holder too
  /\bhold(?:s|ing|ers?)?\s+(?:an?\s+)?(?:\w+\s+)?degree\b/i,
  // Italian: "in possesso della laurea", "laureati", "dopo la laurea"
  /\bin possesso (?:della|del|di)\s+(?:diploma di\s+)?laurea/i,
  /\blaureat[oiae]\b/i,
  /\bdopo la laurea/i,
  /\b(?:conseguito|conseguimento (?:del|della))\s+(?:il\s+|la\s+)?(?:diploma di\s+)?laurea/i,
];
// "bachelor's or master's", "bachelor and master programmes", "Bachelor- und Masterstudiengänge",
// "bachelor- of masteropleiding", "licence ou en master", "Bachelor- oder Masterstudierende",
// "bachelor/master". The master word takes only a study suffix with it (studiengänge, students,
// opleiding, programme ...), never "graduates", "Absolventen", "obtenu": what follows stays visible.
const STUDY_SUFFIX =
  "(?:studieng[äa]ng(?:e|en)?|studierende[nr]?|studium|studien|opleidingen|opleiding|programmes?|programs?|students?|courses?|degrees?)";
const BOTH_LEVELS = new RegExp(
  String.raw`\b(?:bachelor|licence)['’]?s?-?(?:\s+(?:degrees?|students?|programmes?|programs?|courses?|studies))?\s*(?:\/|,|\b(?:or|and|und|oder|of|ou|et|en)\b)\s*(?:en\s+)?master(?:['’]s)?(?:-?${STUDY_SUFFIX}\b|\s+${STUDY_SUFFIX}\b)?`,
  "gi",
);
// Italian: "corsi di laurea e di laurea magistrale", "laurea, laurea magistrale e laurea magistrale a
// ciclo unico": the levels a call covers, a list of first-level and second-level courses.
const BOTH_LEVELS_IT =
  /(?:corsi?\s+di\s+)?laure[ae](?:\s+triennal[ei])?\s*(?:,|\be\b|\bed\b|\bo\b|\/)\s*(?:di\s+)?laurea\s+magistrale(?:\s+a\s+ciclo\s+unico)?(?:\s*(?:,|\be\b|\bed\b|\bo\b)\s*(?:di\s+)?laurea\s+magistrale(?:\s+a\s+ciclo\s+unico)?)*/gi;
// Degree-possession wording: a scheme for people who hold, finished or are about to use a degree is
// for what comes after the bachelor, whatever levels it names. Word-boundary stems on purpose
// ("participating", "education", "undergraduate" must not trip).
const FINISHED_DEGREE =
  /\bdegrees?\b|\bgraduat|\balumn[ia]\b|\bdipl[ôo]m|\bhold(?:s|ers?|ing)?\b|\bcomplet|\bfinish|\bearn|\bobtain|\bpossess|\bprior\b|\bprevious|\balready\b|\brequir|\brecipient|\btitulaire|\bobtenu|\bpostdoc|absolvent|abschluss|abgeschlossen|afgestudeerd|\blaureat|\bpossesso|\bconseguit/i;

// Any graduate wording at all, a both-levels phrase included.
const mentionsGraduate = (quote: string): boolean =>
  GRADUATE_LEVEL.test(quote) || BACHELOR_PREREQUISITE.some((pattern) => pattern.test(quote));
const namesBothLevels = (quote: string): boolean =>
  new RegExp(BOTH_LEVELS.source, "i").test(quote) ||
  new RegExp(BOTH_LEVELS_IT.source, "i").test(quote);
const withoutBothLevels = (quote: string): string =>
  quote.replace(BOTH_LEVELS, " ").replace(BOTH_LEVELS_IT, " ");

// A graduate level or a prerequisite that the quote does not explain away as "bachelor's or
// master's": no prerequisite wording anywhere, and nothing left that is master or doctoral once the
// both-levels phrase is taken out. Master only, or doctoral, is graduate.
function isGraduateLevel(quote: string): boolean {
  if (BACHELOR_PREREQUISITE.some((pattern) => pattern.test(quote))) return true;
  if (!GRADUATE_LEVEL.test(quote)) return false;
  if (!namesBothLevels(quote)) return true;
  const rest = withoutBothLevels(quote);
  return GRADUATE_LEVEL.test(rest) || FINISHED_DEGREE.test(rest);
}

const UNDERGRADUATE: readonly RegExp[] = [
  /\bundergraduate/i,
  /first[- ]degree|\berst(?:es)?\s*studium|\berststudium/i,
  /\bbachelor['’]?s?\s+(?:students?|programmes?|programs?|studies|level|courses?)\b/i,
  /\b(?:for|towards?|pursuing|enrolled in|start(?:ing)?|begin(?:ning)?|entering)\s+(?:an?\s+|the\s+|their\s+)?(?:first[- ]year\s+)?bachelor/i,
  /pour la licence|[ée]tudiants? en licence|premier cycle|cursus de licence/i,
  /\bbachelor-?studi(?:um|engang|e)\b|\bbachelorstudent/i,
  // "enrolling full-time in bachelor's degree courses": enrolment in the courses, not the title
  /\b(?:enrol(?:l)?(?:ing|ed|s)?|enrol(?:l)?ment|registered|registering)\s+(?:full[- ]time\s+)?in\s+(?:an?\s+|the\s+)?bachelor['’]?s?\s+degree\s+(?:courses?|programmes?|programs?)\b/i,
  // "in the first year of Bachelor's degree": the first year only, never a later stage or a title
  /\bin\s+the\s+first[- ]year\s+of\s+(?:an?\s+|the\s+)?bachelor['’]?s?\s+degree\b/i,
  // a scheme open to every programme ("jedes Studium ist förderungsfähig", "every course of study
  // is eligible") covers the first degree; a quote that also names master is mixed and rejected
  /(?<!\bnicht\s)\bjedes studium\b[^.]{0,80}f[öo]rder(?:ungs)?f[äa]hig/i,
  /(?<!\bnot\s)\bevery (?:course of study|degree programme|study programme)\b[^.]{0,80}\beligible\b/i,
  // Italian: "corsi di laurea" (not "laurea magistrale"), "laurea triennale", "primo livello"
  /\bcors[oi]\s+di\s+laurea(?!\s+(?:magistrale|specialistica|di secondo))/i,
  /\blaurea triennale|\blauree triennali|\bprimo livello|\bprimo ciclo/i,
];
// "eligible only after the first degree" is a later stage, whatever else the quote says
const LATER_STAGE = /\bonly after\b|\bnach dem ersten\b|\berst nach\b|\bsolo dopo\b/i;
const isUndergraduate = (quote: string): boolean =>
  !LATER_STAGE.test(quote) &&
  (UNDERGRADUATE.some((pattern) => pattern.test(quote)) || namesBothLevels(quote));

// --- eligibility ----------------------------------------------------------------------------------
const EXCLUSION =
  /not eligible|ineligible|cannot apply|can ?not apply|are excluded|not entitled|\binstead\b|reserved for|must not be (?:from|a national|nationals|citizens?)|should (?:see|refer|consult)|only (?:eu|eea|german|dutch|french) (?:citizens|nationals|students)|exclusively for (?:german|eu\b|eea|dutch|french|national|citizens)|nur f[üu]r (?:deutsche|eu\b)|r[ée]serv[ée]e?s? aux|only (?:for|open to)\s+(?:german|eu\b|eea|dutch|french|national)|nicht\s+(?:berechtigt|bewerben)|k[öo]nnen sich nicht bewerben|ne sont pas|ne peuvent pas|uitgesloten|niet in aanmerking|not open to|(?:except|excluding|other than|tranne|eccetto|sauf|au(?:ß|ss)er|behalve)[^.;]{0,60}(?:morocc|maroc|marokk)|non possono|non pu[oò]\s|non (?:sono|è|e['’]) idone|non (?:vengono|viene) ammess|non benefici|non spett|esclusivamente (?:a|ai|agli|alle|per) (?:i |gli )?(?:student[ei] |cittadin[ie] )?italian|non sono ammess|non hanno diritto|\besclus[oiae]\b|riservat[oiae]\s+(?:ai|agli|alle|a)\s|solo per (?:i |gli )?(?:student|cittadin)/i;

// "Foreign Office / Affairs" is a ministry, not a foreign applicant. Local to this verifier: the
// shared rule stays as it is.
const FOREIGN_MINISTRY = /foreign\s+(?:office|affairs|ministry|minister|policy|service)/gi;
const namesInternational = (quote: string): boolean =>
  mentionsInternationalApplicants(quote.replace(FOREIGN_MINISTRY, " "));

// How a page names a nationality: the country or its region. Small and general; extend per code.
// A bare continent ("Africa" is in "South Africa") or "MENA" is not enough.
const NORTH_AFRICA = "north africa|afrique du nord|nordafrika|nord africa";
const NATIONALITY_NAMES: Record<string, RegExp> = {
  MA: new RegExp(`morocc|maroc|marokk|${NORTH_AFRICA}`, "i"),
  DZ: new RegExp(`alg[eé]ri|${NORTH_AFRICA}`, "i"),
  TN: new RegExp(`tunisi|tunesi|${NORTH_AFRICA}`, "i"),
};
// "all countries except Morocco": the name is there, but as an exclusion.
const EXCEPT_WORDS = "except|excluding|other than|sauf|außer|ausser|behalve|tranne|eccetto";
function namesNationality(code: string, quote: string): boolean {
  const names = NATIONALITY_NAMES[code];
  if (names === undefined || !names.test(quote)) return false;
  return !new RegExp(`(?:${EXCEPT_WORDS})[^.;]{0,60}?(?:${names.source})`, "i").test(quote);
}

// --- official sources -----------------------------------------------------------------------------
const ALLOWED_DOMAINS = new Set([
  "daad.de",
  "nuffic.nl",
  "studyinholland.nl",
  "campusfrance.org",
  "ind.nl",
  "studyinnl.org",
  "ameli.fr",
  "belastingdienst.nl",
  "poliziadistato.it",
  "esteri.it",
  "universitaly.it",
  "xn--bafg-7qa.de", // bafög.de
  "rijksoverheid.nl",
  "duo.nl",
  "service-public.fr", // the French administration's portal (a government site)
]);
const GOVERNMENT_SUFFIXES = [
  "gouv.fr",
  "bund.de",
  "overheid.nl",
  "government.nl",
  "gov.it",
  "gov.hu",
];

// A quote counts only when it is on the provider's own site, a national study-abroad portal or a
// government site; a blog or an aggregator holding the same sentence is not an official source.
export function isOfficialSource(url: string, officialUrl: string): boolean {
  return sameSite(url, officialUrl) || isOfficialHost(url);
}

// The allow-list alone (no provider site to compare with): a national study-abroad portal or a
// government site.
export function isOfficialHost(url: string): boolean {
  let labels: string[];
  try {
    labels = new URL(url).hostname.toLowerCase().split(".");
  } catch {
    return false;
  }
  if (ALLOWED_DOMAINS.has(labels.slice(-2).join("."))) return true;
  // "gov" as the top-level label, or right before a country code (gov.uk, study.gov.ma); not
  // evil.gov.com or gov.evil.com
  const last = labels.at(-1) ?? "";
  if (last === "gov" || (labels.at(-2) === "gov" && last.length === 2)) return true;
  return labels.length > 2 && GOVERNMENT_SUFFIXES.includes(labels.slice(-2).join("."));
}

// --- deadline -------------------------------------------------------------------------------------
// A page often gives one date per applicant group ("EU applicants: 15 March; non-EU applicants:
// 15 January"). A date is the international applicants' application deadline only if ONE clause
// states it, names them, contains no other date and says what the date is (a deadline word, not an
// opening or a results date). A quote that is not clean like that is left for a human: null.
const CLAUSE_BREAK = /;|[()]|[.!?](?:\s|$)|,\s*(?=for\b|und f[üu]r\b|pour les\b)/i;
// What the date is. A results, interview or opening date is not the application deadline, so a
// clause that talks about one is left for a human whatever else it says. Otherwise an unambiguous
// deadline word is enough; "by / until / before / close(s)" must sit right before the date and the
// clause must be about applying (not "interviews take place until ...").
const NOT_A_DEADLINE =
  /\bresults?\b|interview|\bannounce[sd]?\b|\bannouncements?\b|\bnotif(?:y|ied|ies|ications?)\b|\binform(?:ed|s)?\b|\bopens\b|\bopening\b|\bstarts?\b|\bbegins?\b|ergebnis|bekanntgabe|\br[ée]sultats?\b|\bannonc|\bouverture\b|\buitslag|\bopent\b/i;
const DEADLINE_WORD =
  /deadline|apply by|submitted by|received by|no later than|bis zum|date limite|uiterlijk|einsendeschluss|bewerbungsschluss|frist/i;
const BEFORE_DATE_WORD = /\b(?:by|until|before|close[sd]?|closing|bis|avant|sluit\w*)\b|\bjusqu/i;
const APPLICATION_WORD =
  /\bapply\b|application|submit|submission|bewerbung|bewerben|candidature|aanmeld|einreich/i;
const BEFORE_DATE_WINDOW = 20;

function statesDeadline(text: string): boolean {
  const q = normalizeForMatch(text);
  if (NOT_A_DEADLINE.test(q)) return false;
  if (DEADLINE_WORD.test(q)) return true;
  const date = dateSpans(q)[0];
  if (date === undefined || !APPLICATION_WORD.test(q)) return false;
  return BEFORE_DATE_WORD.test(q.slice(Math.max(0, date.start - BEFORE_DATE_WINDOW), date.start));
}

function cleanDeadline(isoDate: string, text: string): FactCheck {
  const stated = checkDeadline(isoDate, text);
  if (!stated.ok) return stated;
  if (!namesInternational(text))
    return {
      ok: false,
      reason: "no accepted quote says the deadline is for international (non-EU) applicants",
    };
  if (countDates(text) !== 1)
    return {
      ok: false,
      reason:
        "the quote gives several dates (several applicant groups or steps) and no clause ties this date alone to international applicants",
    };
  if (!statesDeadline(text))
    return {
      ok: false,
      reason:
        "the clause with this date does not say it is the application deadline (deadline, apply by, until, close ...), or it is a results, interview or opening date",
    };
  return { ok: true };
}

// A dated deadline and a yearless one obey the same clause rules (one applicant group, a deadline
// word, international applicants): only the date check differs.
function inAnyClause(quote: string, check: (text: string) => FactCheck): FactCheck {
  const clauses = quote
    .split(CLAUSE_BREAK)
    .map((c) => c.trim())
    .filter((c) => c !== "");
  if (clauses.some((c) => check(c).ok)) return { ok: true };
  return check(quote);
}

function deadlineFor(isoDate: string, quote: string): FactCheck {
  return inAnyClause(quote, (text) => cleanDeadline(isoDate, text));
}

function cleanRecurringDeadline(month: number, day: number, text: string): FactCheck {
  const stated = checkRecurringDeadline(month, day, text);
  if (!stated.ok) return stated;
  if (!namesInternational(text))
    return {
      ok: false,
      reason: "no accepted quote says the deadline is for international (non-EU) applicants",
    };
  if (countDates(text) !== 1)
    return {
      ok: false,
      reason:
        "the quote gives several dates (several applicant groups or steps) and no clause ties this date alone to international applicants",
    };
  if (!statesDeadline(text))
    return {
      ok: false,
      reason:
        "the clause with this date does not say it is the application deadline (deadline, apply by, until, close ...), or it is a results, interview or opening date",
    };
  return { ok: true };
}

function recurringDeadlineFor(month: number, day: number, quote: string): FactCheck {
  return inAnyClause(quote, (text) => cleanRecurringDeadline(month, day, text));
}

// --- support --------------------------------------------------------------------------------------
// The currency, as the page writes it: a symbol, the code or the word (whole words only, so
// "European" is not the euro).
const CURRENCY_WORDS: Record<string, RegExp> = {
  EUR: /€|\beur\b|\beuros?\b/i,
  USD: /\$|\busd\b|\bdollars?\b/i,
  GBP: /£|\bgbp\b|\bpounds?\b/i,
  CHF: /\bchf\b|\bswiss francs?\b|\bfrancs? suisses?\b/i,
  MAD: /\bmad\b|\bdh\b|\bdirhams?\b/i,
  HUF: /\bhuf\b|\bft\b/i,
};
export function currencyNextTo(
  currency: string,
  quote: string,
  start: number,
  end: number,
): boolean {
  const source = (CURRENCY_WORDS[currency] ?? new RegExp(`\\b${currency}\\b`, "i")).source;
  const before = quote.slice(Math.max(0, start - 12), start);
  const after = quote.slice(end, end + 12);
  return (
    new RegExp(`(?:${source})[\\s\\u00a0]{0,2}$`, "i").test(before) ||
    new RegExp(`^[\\s\\u00a0]{0,2}(?:${source})`, "i").test(after)
  );
}

// What the amount is paid per. An amount whose period the quote does not state next to it is not
// kept: "5,000" once and "5,000" a month are different scholarships. "years" and "first-year" are
// not "per year"; a bare "once" ("once admitted") is not a one-time payment.
const PER_WORDS: Record<"month" | "year" | "once" | "total", RegExp> = {
  month:
    /\b(?:per|each|every)\s+month\b|(?<!\bfor\s)\ba\s+month\b|\bmonthly\b|\/\s*month\b|\bpro monat\b|\bmonatlich\b|\bpar mois\b|\bper maand\b|\bmaandelijks\b|\bmensuel/i,
  year: /\b(?:per|each|every)\s+(?:academic\s+)?year\b|(?<!\bfor\s)\ba\s+year\b|\bannually\b|\byearly\b|\bannual\b|\/\s*year\b|\bpar an\b|\bpro jahr\b|\bj[äa]hrlich\b|\bper jaar\b|\bjaarlijks\b|\bannuel/i,
  once: /\bone[- ]?time\b|\bone[- ]off\b|\blump[- ]sum\b|\beinmalig\b|\bune (?:seule )?fois\b|\beenmalig\b/i,
  total: /\bin total\b|\bau total\b|\binsgesamt\b|\btotal of\b|\bgesamtbetrag\b/i,
};

const CAP =
  /(?:up to|bis zu|jusqu['’][àa]|maximum|max\.?|at most|no more than|not exceeding|h[öo]chstens|maximal)\s*(?:of\s+)?(?:€|£|\$|[a-z]{3}\s?)?\s*$/i;

const WINDOW = 25;
// The same clause: up to 25 characters, stopping at another number or the end of the sentence.
const clauseAfter = (quote: string, from: number, size = WINDOW): string =>
  quote.slice(from, from + size).split(/\d|[.;!?](?:\s|$)/)[0] ?? "";
const clauseBefore = (quote: string, to: number, size = WINDOW): string =>
  quote
    .slice(Math.max(0, to - size), to)
    .split(/\d|[.;!?]\s/)
    .at(-1) ?? "";

// The sentence that holds a position: from the previous sentence break to the next one.
function sentenceAround(quote: string, position: number): string {
  const breaks = [...quote.slice(0, position).matchAll(/[.;!?]\s/g)];
  const last = breaks.at(-1);
  const next = quote.slice(position).search(/[.;!?](?:\s|$)/);
  return quote.slice(
    last === undefined ? 0 : last.index + 1,
    next < 0 ? quote.length : position + next,
  );
}
const numbersIn = (text: string): number =>
  (text.match(/\d+(?:[.,\s ]\d{3})*(?:[.,]\d+)?/g) ?? []).length;

// "The scholarship amounts to EUR 5,000. You will receive this in the first year of your studies.":
// the period of a one-time amount may sit in the next sentence, but only when the amount's own
// sentence (all of it) gives no period, and the next sentence is nothing but "You will receive
// this/it", the once phrase and at most "of your studies": an allow-list, so no recurrence, renewal
// or instalment wording can slip in.
const PAID_OPENER = /^you will receive (?:this|it)\b/i;
const ONCE_PHRASE = /\bin (?:the|your|their) first year\b|\bfor one year only\b|\bone[- ]?time\b/gi;
const OWN_PERIOD =
  /\b(?:monthly|yearly|annual\w*|weekly|quarterly|each|every|per)\b|\bmonths?\b|\byears?\b|\bp\.?\s?m\b|\bp\.?\s?a\b/i;
const ONCE_REMAINDER = /^of (?:your|the|their) (?:studies|programme|study)$/i;
function paidOnceNextSentence(
  quote: string,
  from: number,
  currency: string,
  ownSentence: string,
): boolean {
  if (OWN_PERIOD.test(ownSentence) || PER_WORDS.month.test(ownSentence)) return false;
  if (PER_WORDS.year.test(ownSentence)) return false;
  const rest = quote.slice(from);
  const end = rest.search(/[.!?](?:\s|$)/);
  if (end < 0) return false;
  const money = (CURRENCY_WORDS[currency] ?? new RegExp(`\\b${currency}\\b`, "i")).source;
  const ownTail = new RegExp(String.raw`^[\s ,]*(?:${money})?[\s ,]*$`, "i");
  if (!ownTail.test(rest.slice(0, end))) return false;
  const sentence =
    rest
      .slice(end + 1)
      .trimStart()
      .split(/[.!?](?:\s|$)/)[0] ?? "";
  if (!PAID_OPENER.test(sentence) || !new RegExp(ONCE_PHRASE.source, "i").test(sentence))
    return false;
  const remainder = sentence.replace(PAID_OPENER, " ").replace(ONCE_PHRASE, " ").trim();
  return remainder === "" || ONCE_REMAINDER.test(remainder);
}

type SupportAmount = {
  min: number;
  max: number;
  currency: string;
  per: "month" | "year" | "once" | "total";
};

// Does the quote state this amount range, in this currency, per this period, in one place?
function supportStated(amount: SupportAmount, quote: string): boolean {
  for (const hi of amountMatches(amount.max, quote)) {
    for (const lo of amountMatches(amount.min, quote)) {
      if (lo.start > hi.start) continue;
      // "EUR 900 per month for Master students" is not the amount of a Bachelor scholarship
      // nor is "Master students: EUR 900 per month" (the level named before the amount)
      const near = [clauseAfter(quote, hi.end, 60), clauseBefore(quote, hi.start, 40)];
      const clause = sentenceAround(quote, hi.start);
      if (near.some(mentionsGraduate) || namesBothLevels(clause)) {
        // "EUR 400 per month for Bachelor and Master students": the only amount of a clause that names
        // both levels applies to both and is kept; with two amounts in that clause none can be told
        // apart. A clause that is master only (or doctoral) is not a bachelor amount either way.
        if (numbersIn(clause) !== 1 || isGraduateLevel(clause)) continue;
      }
      // "up to 934 euros a month" is a ceiling, not the amount everybody gets
      if (amount.min === amount.max && CAP.test(quote.slice(Math.max(0, hi.start - 20), hi.start)))
        continue;
      // a range ("800 to 1,000"), not two unrelated numbers
      if (lo.start !== hi.start && hi.start - lo.end > 20) continue;
      if (
        !currencyNextTo(amount.currency, quote, lo.start, lo.end) &&
        !currencyNextTo(amount.currency, quote, hi.start, hi.end)
      )
        continue;
      const after = clauseAfter(quote, hi.end);
      // "a one-time grant of EUR 5,000" and "a total of EUR 8,000" put the word before the amount
      const around =
        amount.per === "once" || amount.per === "total"
          ? `${clauseBefore(quote, lo.start)} ${after}`
          : after;
      if (PER_WORDS[amount.per].test(around)) return true;
      if (amount.per === "once" && paidOnceNextSentence(quote, hi.end, amount.currency, clause))
        return true;
    }
  }
  return false;
}

// What the support covers, as the page writes it. "other" cannot be recognised, so it is never kept.
const COVER_WORDS: Record<(typeof SUPPORT_COVERS)[number], RegExp | null> = {
  tuition:
    /tuition|study fees|fees|studiengeb|collegegeld|frais de scolarit|droits d['’]inscription/i,
  living:
    /living|subsistence|stipend|maintenance|allowance|lebenshaltung|livelihood|frais de vie|levensonderhoud/i,
  housing: /housing|accommodation|\brent\b|unterkunft|miete|logement|huisvesting/i,
  travel: /travel|flight|airfare|reise|voyage|billet d['’]avion|reiskosten/i,
  insurance: /insurance|versicherung|assurance|verzekering/i,
  other: null,
};

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function verifyScholarship(
  proposal: ScholarshipProposal,
  getText: GetText,
  options: { institutions?: ReadonlySet<string> } = {},
): Promise<ScholarshipVerified> {
  const reasons: string[] = [];
  const notes: string[] = [];

  const pages = new Map<string, string | null>();
  const textOf = async (url: string): Promise<string | null> => {
    if (!pages.has(url)) {
      try {
        pages.set(url, await getText(url));
      } catch {
        pages.set(url, null);
      }
    }
    return pages.get(url) ?? null;
  };
  // Quotes found verbatim on their pages; an unreachable page or an invented quote supports nothing.
  // A quote also has to be on an official site (the provider's own, a national portal, a government).
  const dropped: string[] = [];
  const accept = async (label: string, quotes: readonly Quote[] | undefined): Promise<Quote[]> => {
    const kept: Quote[] = [];
    for (const q of quotes ?? []) {
      const text = await textOf(q.url);
      if (text === null || !quoteInText(q.quote, text)) continue;
      if (!isOfficialSource(q.url, proposal.officialUrl)) {
        dropped.push(`${label}: a quote on ${q.url} is not from an official site: dropped`);
        continue;
      }
      kept.push(q);
    }
    return kept;
  };

  if (!proposal.officialUrl.startsWith("https://")) reasons.push("official URL must be https");
  else if ((await textOf(proposal.officialUrl)) === null)
    reasons.push("official URL could not be fetched");

  const institutions = proposal.institutions ?? [];
  if (institutions.length > 0) {
    if (options.institutions === undefined)
      reasons.push("institutions cannot be checked: the list of known institutions was not given");
    else
      for (const slug of institutions)
        if (!options.institutions.has(slug)) reasons.push(`unknown institution slug ${slug}`);
  }

  const eligibilityAll = await accept("eligibility", proposal.evidence.eligibility);
  const eligibility = eligibilityAll.filter((q) => !EXCLUSION.test(q.quote));
  for (const q of eligibilityAll)
    if (EXCLUSION.test(q.quote))
      dropped.push(`eligibility: the quote "${q.quote}" states an exclusion: dropped`);
  const international = eligibility.filter((q) => namesInternational(q.quote));
  if (eligibilityAll.length === 0)
    reasons.push("eligibility: no quote was found verbatim on the cited page(s)");
  else if (eligibility.length === 0)
    reasons.push("eligibility: every accepted quote states an exclusion");
  else if (international.length === 0)
    reasons.push(
      "eligibility: no accepted quote says the scholarship is open to international (non-EU) applicants",
    );
  // a listed nationality needs a quote naming the country or its region; none listed means any
  // international applicant, which is what the international quote supports
  for (const code of proposal.eligibleNationalities) {
    if (NATIONALITY_NAMES[code] === undefined)
      reasons.push(
        `eligibleNationalities: ${code} cannot be checked against a quote yet (add its names to NATIONALITY_NAMES)`,
      );
    else if (eligibility.length > 0 && !eligibility.some((q) => namesNationality(code, q.quote)))
      reasons.push(
        `eligibleNationalities: no accepted eligibility quote names ${code} (the country or its region)`,
      );
  }

  const levelAll = await accept("level", proposal.evidence.level);
  const level = levelAll.filter((q) => isUndergraduate(q.quote) && !isGraduateLevel(q.quote));
  if (
    levelAll.some((q) => isGraduateLevel(q.quote)) ||
    eligibility.some((q) => isGraduateLevel(q.quote))
  )
    reasons.push(
      "level: a quote makes this a graduate (master, doctoral) scholarship or requires a bachelor's degree to apply",
    );
  else if (levelAll.length === 0)
    reasons.push("level: no quote was found verbatim on the cited page(s)");
  else if (level.length === 0)
    reasons.push(
      "level: no accepted quote says the scholarship itself is for bachelor (undergraduate) students",
    );

  const howToApply = await accept("howToApply", proposal.evidence.howToApply);
  if (howToApply.length === 0)
    reasons.push("howToApply: no quote was found verbatim on the cited page(s)");

  const firstInternational = international[0];
  const firstHow = howToApply[0];
  if (reasons.length > 0 || firstInternational === undefined || firstHow === undefined)
    return { ok: false, reasons: [...reasons, ...dropped] };

  // sources: the official page is page-1, then each other page in order of first use
  const sources: Record<string, { url: string; last_verified_at: null }> = {};
  const keys = new Map<string, string>();
  const keyFor = (url: string): string => {
    const known = keys.get(url);
    if (known !== undefined) return known;
    const key = `page-${keys.size + 1}`;
    keys.set(url, key);
    sources[key] = { url, last_verified_at: null };
    return key;
  };
  const officialKey = keyFor(proposal.officialUrl);

  const evidence: ScholarshipEvidence[] = [];
  const cite = (fact: string, quotes: readonly Quote[]): void => {
    for (const q of quotes)
      if (!evidence.some((e) => e.fact === fact && e.url === q.url && e.quote === q.quote))
        evidence.push({ fact, url: q.url, quote: q.quote });
  };
  cite("eligibility", eligibility);
  // which quote named each listed country: the auditor checks it
  for (const code of proposal.eligibleNationalities) {
    const naming = eligibility.find((q) => namesNationality(code, q.quote));
    if (naming !== undefined) cite(`nationality:${code}`, [naming]);
  }
  cite("level", level);
  cite("howToApply", howToApply);

  // --- support -----------------------------------------------------------------------------
  let support: unknown = null;
  let supportSource = officialKey;
  if (proposal.support !== null) {
    const claim = proposal.support;
    const quotes = await accept("support", proposal.evidence.support);
    const amount = claim.amount;
    const coversIn = (list: readonly Quote[]) =>
      claim.covers.filter((cover) => {
        const pattern = COVER_WORDS[cover];
        return pattern !== null && list.some((q) => pattern.test(q.quote));
      });
    if (quotes.length === 0) {
      notes.push("support: no quote was found verbatim on the cited page(s)");
    } else if (amount !== null) {
      const stating = quotes.find((q) => supportStated(amount, q.quote));
      if (stating === undefined) {
        notes.push(
          `support: no accepted quote states ${amount.min}-${amount.max} ${amount.currency} per ${amount.per} (amounts, currency next to the amount, and the period)`,
        );
      } else {
        support = {
          amount: {
            min: toMinor(amount.min, amount.currency),
            max: toMinor(amount.max, amount.currency),
            currency: amount.currency,
            per: amount.per,
          },
          covers: coversIn(quotes),
        };
        supportSource = keyFor(stating.url);
        cite("support", quotes);
      }
    } else {
      const covers = coversIn(quotes);
      if (covers.length === 0) {
        notes.push("support: no accepted quote names anything the support covers");
      } else {
        support = { amount: null, covers };
        const named = quotes.find((q) => COVER_WORDS[covers[0] ?? "other"]?.test(q.quote));
        supportSource = keyFor((named ?? quotes[0] ?? firstHow).url);
        cite("support", quotes);
      }
    }
  }

  // --- deadline ----------------------------------------------------------------------------
  let deadline: string | null = null;
  let deadlineSource = officialKey;
  if (proposal.deadline !== null) {
    const quotes = await accept("deadline", proposal.evidence.deadline);
    if (quotes.length === 0) {
      notes.push("deadline: no quote was found verbatim on the cited page(s)");
    } else {
      const checks = quotes.map((q) => ({
        q,
        check: deadlineFor(proposal.deadline ?? "", q.quote),
      }));
      const passed = checks.find((c) => c.check.ok);
      if (passed === undefined) {
        const first = checks[0]?.check;
        notes.push(
          `deadline: ${first !== undefined && !first.ok ? first.reason : "not supported"}`,
        );
      } else {
        deadline = proposal.deadline;
        deadlineSource = keyFor(passed.q.url);
        cite("deadline", [passed.q]);
      }
    }
  }

  let recurringDeadline: { month: number; day: number } | null = null;
  let recurringDeadlineSource = officialKey;
  if (proposal.recurringDeadline != null) {
    const claim = proposal.recurringDeadline;
    const quotes = await accept("recurringDeadline", proposal.evidence.deadline);
    if (quotes.length === 0) {
      notes.push("recurringDeadline: no quote was found verbatim on the cited page(s)");
    } else {
      const checks = quotes.map((q) => ({
        q,
        check: recurringDeadlineFor(claim.month, claim.day, q.quote),
      }));
      const passed = checks.find((c) => c.check.ok);
      if (passed === undefined) {
        const first = checks[0]?.check;
        notes.push(
          `recurringDeadline: ${first !== undefined && !first.ok ? first.reason : "not supported"}`,
        );
      } else {
        recurringDeadline = { month: claim.month, day: claim.day };
        recurringDeadlineSource = keyFor(passed.q.url);
        cite("recurringDeadline", [passed.q]);
      }
    }
  }

  // --- documents ---------------------------------------------------------------------------
  // A document is kept only when an accepted quote names it as the page writes it; a translation
  // claim needs a quote that names the document and mentions translation, otherwise it is unknown.
  let documents: unknown = null;
  let documentsSource = officialKey;
  if (proposal.documents !== null) {
    const all = [...eligibility, ...level, ...howToApply];
    const normalized = all.map((q) => ({
      q,
      text: normalizeForMatch(q.quote),
      translation: mentionsTranslation(q.quote),
    }));
    const nameRegex = (quotedAs: string) => wholeWord(escapeRegex(normalizeForMatch(quotedAs)));
    const kept = [];
    const naming: Quote[] = [];
    for (const doc of proposal.documents) {
      const regex = nameRegex(doc.quotedAs);
      const hits = normalized.filter((n) => regex.test(n.text));
      if (hits.length === 0) {
        notes.push(`documents: no accepted quote names "${doc.quotedAs}": dropped`);
        continue;
      }
      naming.push(...hits.map((h) => h.q));
      const supported = hits.some((h) => h.translation);
      kept.push({
        slug: doc.slug,
        name: {
          fr: { text: doc.name.fr, status: "draft" },
          ...(doc.name.en === undefined ? {} : { en: { text: doc.name.en, status: "draft" } }),
        },
        translationRequired:
          doc.translationRequired === true && !supported ? null : doc.translationRequired,
      });
    }
    if (kept.length > 0) {
      documents = kept;
      documentsSource = keyFor((naming[0] ?? firstHow).url);
      cite("documents", naming);
    }
  }

  const lt = (text: { fr: string; en?: string | undefined }) => ({
    fr: { text: text.fr, status: "draft" },
    ...(text.en === undefined ? {} : { en: { text: text.en, status: "draft" } }),
  });
  const record: Record<string, unknown> = {
    slug: proposal.slug,
    name: proposal.name,
    provider: proposal.provider,
    destinations: proposal.destinations,
    eligibleNationalities: proposal.eligibleNationalities,
    fields: proposal.fields,
    ...(institutions.length > 0 ? { institutions } : {}),
    level: "bachelor",
    summary: lt(proposal.summary),
    support: { value: support, source: supportSource, info_kind: "official" },
    deadline: { value: deadline, source: deadlineSource, info_kind: "official" },
    ...(recurringDeadline === null
      ? {}
      : {
          recurringDeadline: {
            value: recurringDeadline,
            source: recurringDeadlineSource,
            info_kind: "official",
          },
        }),
    requirements: {
      coverage: "partial",
      source: keyFor(firstInternational.url),
      info_kind: "official",
      rules: [],
    },
    documents: { value: documents, source: documentsSource, info_kind: "official" },
    howToApply: lt(proposal.howToApply),
    officialUrl: proposal.officialUrl,
    sources,
  };
  return { ok: true, record, evidence, notes: [...dropped, ...notes] };
}

// --- revision -------------------------------------------------------------------------------------
// A revision of a scholarship already in data/ (W5). The proposal is verified as a new one would be
// (same quotes, hosts, level and nationality rules), then only the facts it proved replace the record;
// a silent or unproven fact keeps its existing value, and `_review.revises` is what
// `data:promote --replace-revisions` requires. The revision still goes through the 100% audit.
const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

// A fresh LocalizedText wins for the locales it provides (fr, en); every locale it does not provide
// (notably ar, which the proposal schema never carries) is preserved verbatim.
function mergeLocalized(
  existing: unknown,
  fresh: unknown,
): { value: Record<string, unknown>; kept: string[] } {
  const before = asRecord(existing);
  const after = asRecord(fresh);
  const kept = Object.keys(before).filter((locale) => !(locale in after));
  return { value: { ...before, ...after }, kept };
}

// The fresh list replaces the existing one, but a document whose slug is unchanged keeps the name
// locales the fresh reading does not provide (notably ar).
function mergeDocuments(existing: unknown, fresh: unknown, keptLocales: Set<string>): unknown {
  const freshFact = asRecord(fresh);
  const existingFact = asRecord(existing);
  const existingItems: unknown[] = Array.isArray(existingFact.value) ? existingFact.value : [];
  const previous = new Map<string, Record<string, unknown>>();
  for (const item of existingItems) {
    const doc = asRecord(item);
    if (typeof doc.slug === "string") previous.set(doc.slug, doc);
  }
  const freshItems: unknown[] = Array.isArray(freshFact.value) ? freshFact.value : [];
  const value = freshItems.map((item) => {
    const doc = asRecord(item);
    const prior = typeof doc.slug === "string" ? previous.get(doc.slug) : undefined;
    if (prior === undefined) return item;
    const merged = mergeLocalized(prior.name, doc.name);
    for (const locale of merged.kept) keptLocales.add(locale);
    return { ...doc, name: merged.value };
  });
  return { ...freshFact, value };
}

// Facts a verified proposal always states (without eligibility, level and howToApply it is rejected).
const REVISED_ALWAYS = [
  "name",
  "provider",
  "destinations",
  "eligibleNationalities",
  "fields",
  "level",
  "summary",
  "howToApply",
  "officialUrl",
] as const;
// Quote-gated facts: an unproven one keeps the existing value, never resets to null.
const REVISED_GATED = ["support", "deadline", "recurringDeadline", "documents"] as const;

export type RevisedScholarship = { record: Record<string, unknown>; notes: string };

export function reviseScholarship(
  rawExisting: Record<string, unknown>,
  verified: Extract<ScholarshipVerified, { ok: true }>,
  proposal: ScholarshipProposal,
): RevisedScholarship {
  const { _review: _ignored, ...existing } = rawExisting;
  const sources = { ...asRecord(existing.sources) };
  const keyOfUrl = new Map<string, string>();
  for (const [key, value] of Object.entries(sources)) {
    const url = asRecord(value).url;
    if (typeof url === "string") keyOfUrl.set(url, key);
  }
  // Every page the fresh reading cites gets a key: an existing url keeps its key (and its older
  // date), a new url takes the next free "page-N".
  const remap = new Map<string, string>();
  for (const [oldKey, value] of Object.entries(asRecord(verified.record.sources))) {
    const url = asRecord(value).url;
    if (typeof url !== "string") continue;
    const known = keyOfUrl.get(url);
    if (known !== undefined) {
      remap.set(oldKey, known);
      continue;
    }
    let n = 1;
    while (`page-${n}` in sources) n++;
    const key = `page-${n}`;
    sources[key] = { url, last_verified_at: null };
    keyOfUrl.set(url, key);
    remap.set(oldKey, key);
  }
  const remapped = (fact: unknown): unknown => {
    const record = asRecord(fact);
    return typeof record.source === "string"
      ? { ...record, source: remap.get(record.source) ?? record.source }
      : fact;
  };

  const next: Record<string, unknown> = { ...existing, slug: proposal.slug };
  const keptLocales = new Set<string>();
  for (const field of REVISED_ALWAYS) {
    if (field === "summary" || field === "howToApply") {
      const merged = mergeLocalized(existing[field], verified.record[field]);
      next[field] = merged.value;
      for (const locale of merged.kept) keptLocales.add(locale);
      continue;
    }
    next[field] = verified.record[field];
  }
  next.requirements = remapped(verified.record.requirements);
  if (proposal.institutions !== undefined) {
    if (proposal.institutions.length > 0) next.institutions = verified.record.institutions;
    else delete next.institutions;
  }

  const established = new Set(verified.evidence.map((e) => e.fact));
  const changed: string[] = [];
  const kept: string[] = [];
  for (const field of REVISED_ALWAYS)
    if (JSON.stringify(existing[field]) !== JSON.stringify(next[field])) changed.push(field);
  if (JSON.stringify(existing.requirements) !== JSON.stringify(next.requirements))
    changed.push("requirements");
  if (
    proposal.institutions !== undefined &&
    JSON.stringify(existing.institutions) !== JSON.stringify(next.institutions)
  )
    changed.push("institutions");
  for (const field of REVISED_GATED) {
    if (!established.has(field)) {
      kept.push(field);
      continue;
    }
    const value =
      field === "documents"
        ? mergeDocuments(existing[field], remapped(verified.record[field]), keptLocales)
        : remapped(verified.record[field]);
    if (JSON.stringify(existing[field]) !== JSON.stringify(value)) changed.push(field);
    next[field] = value;
  }
  // A deadline is dated or recurring, never both: the form this proposal proved replaces the other.
  if (established.has("recurringDeadline")) {
    const dated = asRecord(next.deadline);
    if (dated.value !== null && dated.value !== undefined) {
      next.deadline = { ...dated, value: null };
      if (!changed.includes("deadline")) changed.push("deadline");
    }
    const at = kept.indexOf("deadline");
    if (at >= 0) kept.splice(at, 1);
  } else if (established.has("deadline") && "recurringDeadline" in next) {
    delete next.recurringDeadline;
    if (!changed.includes("recurringDeadline")) changed.push("recurringDeadline");
    const at = kept.indexOf("recurringDeadline");
    if (at >= 0) kept.splice(at, 1);
  }
  next.sources = sources;
  const notes = [
    changed.length > 0 ? `changed: ${changed.join(", ")}` : "",
    kept.length > 0 ? `kept: ${kept.join(", ")}` : "",
    keptLocales.size > 0 ? `locales kept: ${[...keptLocales].sort().join(", ")}` : "",
  ]
    .filter((part) => part !== "")
    .join("; ");
  return { record: next, notes };
}

// --- command line --------------------------------------------------------------------------------
export type VerifyDeps = {
  getText?: GetText;
  stagingDir?: string;
  dataDir?: string;
  today?: string;
};
export type VerifyOutcome = { ok: boolean; lines: string[] };

const PREPARED_TODO =
  "prepared by the assistant from the quoted pages (see evidence): included in the audit sample draw";

const REVISION_TODO =
  "revision of the record already in data/: promote with --replace-revisions after the audit (included in the audit sample draw)";

// null when the folder does not exist: nothing can then be checked.
async function institutionSlugs(dataDir: string): Promise<Set<string> | null> {
  const dir = path.join(dataDir, "institutions");
  if (!existsSync(dir)) return null;
  return new Set(
    (await readdir(dir)).filter((n) => n.endsWith(".yaml")).map((n) => n.slice(0, -".yaml".length)),
  );
}

// Verifies one proposal file and, unless it is a dry run, stages the record. Never overwrites a
// staged file, nor a slug already promoted into data/. With `revise`, a slug already in data/ is
// rebuilt as a revision of that record instead of being refused.
export async function runVerify(
  options: { file: string; dryRun: boolean; revise?: boolean },
  deps: VerifyDeps = {},
): Promise<VerifyOutcome> {
  const stagingDir = deps.stagingDir ?? STAGING_DIR;
  const dataDir = deps.dataDir ?? DATA_DIR;
  const today = deps.today ?? new Date().toISOString().slice(0, 10);
  let proposal: ScholarshipProposal;
  try {
    proposal = ScholarshipProposalSchema.parse(JSON.parse(await readFile(options.file, "utf8")));
  } catch (error) {
    const detail =
      error instanceof z.ZodError
        ? error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
        : error instanceof Error
          ? error.message
          : String(error);
    return { ok: false, lines: [`invalid proposal ${options.file}: ${detail}`] };
  }
  const revise = options.revise === true;
  const target = stageFile("scholarships", proposal.slug, stagingDir);
  const promotedPath = path.join(dataDir, "scholarships", `${proposal.slug}.yaml`);
  const inData = existsSync(promotedPath);
  if (!options.dryRun) {
    if (existsSync(target))
      return { ok: false, lines: [`${target} already exists: never overwritten`] };
    if (revise && !inData)
      return {
        ok: false,
        lines: [
          `scholarships/${proposal.slug} is not in ${dataDir}/: nothing to revise (drop --revise to stage it as new)`,
        ],
      };
    if (!revise && inData)
      return {
        ok: false,
        lines: [`scholarships/${proposal.slug} is already in ${dataDir}/: never overwritten`],
      };
  }
  const known = await institutionSlugs(dataDir);
  if (known === null && (proposal.institutions ?? []).length > 0)
    return {
      ok: false,
      lines: [
        `${path.join(dataDir, "institutions")} not found: cannot check the institution slugs`,
      ],
    };
  const verified = await verifyScholarship(proposal, deps.getText ?? pageText, {
    ...(known === null ? {} : { institutions: known }),
  });
  if (!verified.ok)
    return { ok: false, lines: verified.reasons.map((reason) => `REJECTED ${reason}`) };

  const lines = [
    ...verified.evidence.map((e) => `accepted ${e.fact}: "${e.quote}" (${e.url})`),
    ...verified.notes.map((note) => `rejected ${note}`),
  ];

  if (revise) {
    if (!inData)
      return {
        ok: false,
        lines: [
          ...lines,
          `scholarships/${proposal.slug} is not in ${dataDir}/: nothing to revise (drop --revise to stage it as new)`,
        ],
      };
    const existing = asRecord(parse(await readFile(promotedPath, "utf8")));
    const revised = reviseScholarship(existing, verified, proposal);
    const { _review: _ignored, ...record } = revised.record;
    const check = ScholarshipRecordSchema.safeParse(stampVerified(record, today));
    if (!check.success) {
      const issue = check.error.issues[0];
      return {
        ok: false,
        lines: [
          ...lines,
          `revision still invalid at ${issue?.path.join(".") ?? "?"}: ${issue?.message ?? "?"}`,
        ],
      };
    }
    const summary = revised.notes === "" ? [] : [revised.notes];
    if (options.dryRun)
      return { ok: true, lines: [...lines, ...summary, "dry run: nothing written"] };
    const review = {
      kind: "scholarships",
      slug: proposal.slug,
      name: proposal.name,
      preparedBy: "assistant",
      preparedAt: today,
      officialUrl: proposal.officialUrl,
      evidence: verified.evidence,
      ...(verified.notes.length > 0 ? { rejected: verified.notes } : {}),
      revises: true,
      ...(revised.notes === "" ? {} : { notes: revised.notes }),
      todo: REVISION_TODO,
    };
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, toYaml({ ...revised.record, _review: review }), { flag: "wx" });
    const dropped =
      (await dropAuditRows(new Set([`scholarships/${proposal.slug}`]), stagingDir)).length > 0;
    return {
      ok: true,
      lines: [
        ...lines,
        ...summary,
        `staged revision ${target}`,
        dropped
          ? "dropped its earlier audit row: the revision needs a new audit batch (pnpm data:audit draw)"
          : "the revision needs an audit batch (pnpm data:audit draw)",
      ],
    };
  }

  if (options.dryRun) return { ok: true, lines: [...lines, "dry run: nothing written"] };
  const review = {
    kind: "scholarships",
    slug: proposal.slug,
    name: proposal.name,
    preparedBy: "assistant",
    preparedAt: today,
    officialUrl: proposal.officialUrl,
    evidence: verified.evidence,
    ...(verified.notes.length > 0 ? { rejected: verified.notes } : {}),
    todo: PREPARED_TODO,
  };
  await mkdir(path.dirname(target), { recursive: true });
  // "wx": fail instead of overwriting, even if another process created the file meanwhile.
  await writeFile(target, toYaml({ ...verified.record, _review: review }), { flag: "wx" });
  return { ok: true, lines: [...lines, `staged ${target}`] };
}

async function main(argv: readonly string[]): Promise<void> {
  const [command, file] = argv;
  if (command !== "verify" || file === undefined || file.startsWith("--"))
    throw new Error("usage: data:scholarship verify <proposal.json> [--dry-run] [--revise]");
  const outcome = await runVerify({
    file,
    dryRun: argv.includes("--dry-run"),
    revise: argv.includes("--revise"),
  });
  for (const line of outcome.lines) console.log(line);
  if (!outcome.ok) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("scholarships.ts") === true) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
