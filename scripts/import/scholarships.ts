import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { isValidIsoDate } from "@/data-schema/dates";
import { SUPPORT_COVERS } from "@/data-schema/records/scholarship";

import { sameSite } from "./discover";
import {
  amountMatches,
  checkDeadline,
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

export const ScholarshipProposalSchema = z.object({
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
  documents: z.array(DocumentProposalSchema).nullable(),
  evidence: z.object({
    eligibility: z.array(Ev),
    level: z.array(Ev),
    support: z.array(Ev).optional(),
    deadline: z.array(Ev).optional(),
    howToApply: z.array(Ev),
  }),
});
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
// The scholarship itself must be for bachelor (first-degree) students. A quote that makes it a
// master/doctoral scholarship, or that requires a bachelor's degree to apply, proves the opposite.
const GRADUATE_LEVEL =
  /\bmaster|postgraduate|(?<!under)\bgraduate (?:students|studies|programmes?|programs?)|\bph\.?d\b|doctora|\bpromotion\b/i;
const BACHELOR_PREREQUISITE: readonly RegExp[] = [
  /\b(?:hold|holds|holding|holders?|completed|graduates?)\s+(?:of\s+)?(?:an?\s+|the\s+|their\s+)?(?:bachelor|licence|undergraduate degree)/i,
  /\bbachelor['’]?s?(?: degree)?\s+(?:holders?|required|is required)/i,
  /\b(?:with|having|have|has)\s+(?:an?\s+|completed\s+(?:an?\s+)?)?bachelor/i,
  /titulaires?\s+d['’]une\s+licence/i,
  /\bbachelor-?abschluss|abgeschlossen\w*\s+bachelor/i,
  // graduates of a bachelor have finished it: the scholarship is for what comes after
  /\bbachelor['’]?s?(?:\s+degree)?\s+(?:graduates?|holders?|alumni|diploma)\b/i,
  /\b(?:after|finished|obtained|earned|completed)\s+(?:their\s+|a\s+|an\s+)?bachelor/i,
];
const isGraduateLevel = (quote: string): boolean =>
  GRADUATE_LEVEL.test(quote) || BACHELOR_PREREQUISITE.some((pattern) => pattern.test(quote));

const UNDERGRADUATE: readonly RegExp[] = [
  /\bundergraduate/i,
  /first[- ]degree|\berst(?:es)?\s*studium|\berststudium/i,
  /\bbachelor['’]?s?\s+(?:students?|programmes?|programs?|studies|level|courses?)\b/i,
  /\b(?:for|towards?|pursuing|enrolled in|start(?:ing)?|begin(?:ning)?|entering)\s+(?:an?\s+|the\s+|their\s+)?(?:first[- ]year\s+)?bachelor/i,
  /pour la licence|[ée]tudiants? en licence|premier cycle|cursus de licence/i,
  /\bbachelor-?studi(?:um|engang|e)\b|\bbachelorstudent/i,
];
const isUndergraduate = (quote: string): boolean =>
  UNDERGRADUATE.some((pattern) => pattern.test(quote));

// --- eligibility ----------------------------------------------------------------------------------
const EXCLUSION =
  /not eligible|ineligible|cannot apply|can ?not apply|are excluded|not entitled|\binstead\b|reserved for|must not be (?:from|a national|nationals|citizens?)|should (?:see|refer|consult)|only (?:eu|eea|german|dutch|french) (?:citizens|nationals|students)|exclusively for (?:german|eu\b|eea|dutch|french|national|citizens)|nur f[üu]r (?:deutsche|eu\b)|r[ée]serv[ée]e?s? aux|only (?:for|open to)\s+(?:german|eu\b|eea|dutch|french|national)|nicht\s+(?:berechtigt|bewerben)|k[öo]nnen sich nicht bewerben|ne sont pas|ne peuvent pas|uitgesloten|niet in aanmerking/i;

// "Foreign Office / Affairs" is a ministry, not a foreign applicant. Local to this verifier: the
// shared rule stays as it is.
const FOREIGN_MINISTRY = /foreign\s+(?:office|affairs|ministry|minister|policy|service)/gi;
const namesInternational = (quote: string): boolean =>
  mentionsInternationalApplicants(quote.replace(FOREIGN_MINISTRY, " "));

// How a page names a nationality: the country or its region. Small and general; extend per code.
// A bare continent ("Africa" is in "South Africa") or "MENA" is not enough.
const NORTH_AFRICA = "north africa|afrique du nord|nordafrika";
const NATIONALITY_NAMES: Record<string, RegExp> = {
  MA: new RegExp(`morocc|maroc|marokk|${NORTH_AFRICA}`, "i"),
  DZ: new RegExp(`alg[eé]ri|${NORTH_AFRICA}`, "i"),
  TN: new RegExp(`tunisi|tunesi|${NORTH_AFRICA}`, "i"),
};
// "all countries except Morocco": the name is there, but as an exclusion.
const EXCEPT_WORDS = "except|excluding|other than|sauf|außer|ausser|behalve";
function namesNationality(code: string, quote: string): boolean {
  const names = NATIONALITY_NAMES[code];
  if (names === undefined || !names.test(quote)) return false;
  return !new RegExp(`(?:${EXCEPT_WORDS})[^.;]{0,60}?(?:${names.source})`, "i").test(quote);
}

// --- official sources -----------------------------------------------------------------------------
const ALLOWED_DOMAINS = new Set(["daad.de", "nuffic.nl", "studyinholland.nl", "campusfrance.org"]);
const GOVERNMENT_SUFFIXES = ["gouv.fr", "bund.de", "overheid.nl", "government.nl"];

// A quote counts only when it is on the provider's own site, a national study-abroad portal or a
// government site; a blog or an aggregator holding the same sentence is not an official source.
export function isOfficialSource(url: string, officialUrl: string): boolean {
  if (sameSite(url, officialUrl)) return true;
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

function deadlineFor(isoDate: string, quote: string): FactCheck {
  const clauses = quote
    .split(CLAUSE_BREAK)
    .map((c) => c.trim())
    .filter((c) => c !== "");
  if (clauses.some((c) => cleanDeadline(isoDate, c).ok)) return { ok: true };
  return cleanDeadline(isoDate, quote);
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
};
function currencyNextTo(currency: string, quote: string, start: number, end: number): boolean {
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
      if (
        isGraduateLevel(clauseAfter(quote, hi.end, 60)) ||
        isGraduateLevel(clauseBefore(quote, hi.start, 40))
      )
        continue;
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
            min: amount.min * 100,
            max: amount.max * 100,
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

// null when the folder does not exist: nothing can then be checked.
async function institutionSlugs(dataDir: string): Promise<Set<string> | null> {
  const dir = path.join(dataDir, "institutions");
  if (!existsSync(dir)) return null;
  return new Set(
    (await readdir(dir)).filter((n) => n.endsWith(".yaml")).map((n) => n.slice(0, -".yaml".length)),
  );
}

// Verifies one proposal file and, unless it is a dry run, stages the record. Never overwrites a
// staged file, nor a slug already promoted into data/.
export async function runVerify(
  options: { file: string; dryRun: boolean },
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
  const target = stageFile("scholarships", proposal.slug, stagingDir);
  if (!options.dryRun) {
    if (existsSync(target))
      return { ok: false, lines: [`${target} already exists: never overwritten`] };
    if (existsSync(path.join(dataDir, "scholarships", `${proposal.slug}.yaml`)))
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
    throw new Error("usage: data:scholarship verify <proposal.json> [--dry-run]");
  const outcome = await runVerify({ file, dryRun: argv.includes("--dry-run") });
  for (const line of outcome.lines) console.log(line);
  if (!outcome.ok) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("scholarships.ts") === true) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
