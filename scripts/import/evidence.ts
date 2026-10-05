import { fetchText } from "./http";
import { cachedPdfText, isPdfUrl, type PdfDeps, pdfText } from "./pdf";

// --- page text ---------------------------------------------------------------------------------
const ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  rsquo: "'",
  lsquo: "'",
  ldquo: '"',
  rdquo: '"',
  ndash: "-",
  mdash: "-",
  hellip: "...",
  euro: "€",
  eacute: "é",
  egrave: "è",
  agrave: "à",
  ccedil: "ç",
  uuml: "ü",
  ouml: "ö",
  auml: "ä",
  szlig: "ß",
  Uuml: "Ü",
  Ouml: "Ö",
  Auml: "Ä",
  shy: "",
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([A-Za-z]+);/g, (m, name: string) => ENTITIES[name] ?? m);
}

// The visible text of an HTML page: scripts and styles removed, block tags become spaces.
export function htmlToText(html: string): string {
  const stripped = html
    .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      /<\/?(p|div|br|li|ul|ol|tr|td|th|table|h[1-6]|section|article|header|footer|dd|dt)\b[^>]*>/gi,
      " ",
    )
    .replace(/<[^>]+>/g, "");
  return decodeEntities(stripped).replace(/\s+/g, " ").trim();
}

export type PageTextDeps = { fetchHtml?: typeof fetchText; pdfDeps?: PdfDeps };

const MAX_REPLACEMENT_SHARE = 0.01;

// U+FFFD in more than 1% of a body means it was not text (an archive, an image, a font) decoded as
// UTF-8; the reader must never be paid to read that.
function assertTextBody(body: string): void {
  let replaced = 0;
  for (const char of body) if (char === "�") replaced++;
  if (replaced > body.length * MAX_REPLACEMENT_SHARE) throw new Error("not a text page");
}

// The visible text of a page. A PDF is recognised by its url or, for a url like /download?id=3, by
// its body; anything else that is not text is refused rather than cached as mojibake.
export async function pageText(url: string, deps: PageTextDeps = {}): Promise<string> {
  if (!url.startsWith("https://")) throw new Error("evidence pages must be https");
  if (isPdfUrl(url)) return pdfText(url, deps.pdfDeps);
  const cachedPdf = await cachedPdfText(url, deps.pdfDeps);
  if (cachedPdf !== null) return cachedPdf;
  let bodyIsPdf = false;
  try {
    const body = await (deps.fetchHtml ?? fetchText)(url, {
      accept: "text/html,application/xhtml+xml,application/pdf;q=0.8",
      validate: (text) => {
        if (/^\uFEFF?\s*%PDF-/.test(text)) {
          bodyIsPdf = true;
          throw new Error("body is a PDF");
        }
        assertTextBody(text);
      },
    });
    return htmlToText(body);
  } catch (error) {
    if (!bodyIsPdf) throw error;
    return pdfText(url, deps.pdfDeps);
  }
}

// --- quotes ------------------------------------------------------------------------------------
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’‚‛′`´]/g, "'")
    .replace(/[“”„‟″«»]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/[­​-‍﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export const MIN_QUOTE_LENGTH = 15;

const TRANSLATION_WORDS = /translat|übersetz|uebersetz|vertaling|vertaald|traduction|traduit/i;
export const mentionsTranslation = (quote: string): boolean => TRANSLATION_WORDS.test(quote);

// A deadline is for a Moroccan (non-EU) applicant only if a quote says who it is for: the general
// deadline of a university page may be the EU or home-student one. Words in English, German, Dutch
// and French. Programme and office names ("International Business", "International Office") and
// "foreign languages" are excluded; anything that still slips through is read by the checker, which
// is told the claim is for an international applicant, and by the audit sample.
const INTERNATIONAL_WORDS: readonly RegExp[] = [
  /\bnon[- ]?(?:eu\b|eea\b|eer\b|europ)/i,
  /\bnicht[- ]?(?:eu|eea|ewr)/i,
  /\bniet[- ]?(?:eu|eer)/i,
  /\bextra[- ]?europ/i,
  /outside (?:of )?(?:the )?(?:eu|eea|european)/i,
  /au(?:ss|ß)erhalb (?:der )?(?:eu|europ)/i,
  /buiten (?:de )?(?:eu|eer|europ|nederland)|buitenland/i,
  /hors[- ](?:de l['’]|d['’]|de la |de |l['’])?(?:ue|union|europe)/i,
  /third[- ]countr|drittstaat/i,
  /internationa(?:l|ux)(?!\s+(?:business|management|economics|engineering|relations|studies|office|programmes?|programs?|classroom|school|student office)\b)/i,
  /foreign(?!\s+languages?)/i,
  /(?:from|obtained|studied|completed)\s+abroad/i,
  // Italian: "studenti stranieri", "extra UE", "non comunitari", "studenti internazionali"; a
  // foreign language ("lingue straniere") and an office name are not applicants
  /(?<!lingu[ae]\s+)(?<!ufficio (?:per )?(?:gli )?studenti\s+)\bstranier[oiae]\b/i,
  /\bextra[- ]?(?:ue\b|comunitar)/i,
  /\bnon[- ]?(?:ue\b|comunitar)/i,
  /\bstudent[ei]\s+internazional[ei]\b/i,
  // open to every nationality (a scheme with no nationality condition includes a Moroccan applicant)
  // (not when the same clause then excludes some: "except Moroccan citizens", "other than German")
  /(?:\ball nationalit(?:y|ies)\b|\bany nationality\b|\baller nationalit[äa]ten\b|\btutte le nazionalit[àa])(?![^.;]{0,40}\b(?:other than|except|excluding|but|tranne|eccetto|au(?:ß|ss)er|sauf)\b)|\bregardless of (?:their |your )?nationality\b/i,
  /(?:aus dem|im) ausland\b|ausl[aä]nd(?:isch|er)/i,
  /[ée]trang[eè]r/i,
  // DAAD register: "The following is valid for applicants from: all countries" includes applicants
  // from outside the EU
  /applicants from:\s*all countries/i,
  // a deadline for Moroccan applicants only (Campus France: "heure marocaine")
  /marocain(?:e|s|es)?\b|moroccan|marokkaan|marokkanisch|aus marokko|uit marokko|\bmaroc\b/i,
];
export const mentionsInternationalApplicants = (quote: string): boolean =>
  INTERNATIONAL_WORDS.some((pattern) => pattern.test(quote));

// A quote counts only if it is long enough to mean something and appears verbatim (up to
// whitespace, case and typographic quotes) in the page text.
export function quoteInText(quote: string, text: string): boolean {
  const q = normalizeForMatch(quote);
  return q.length >= MIN_QUOTE_LENGTH && normalizeForMatch(text).includes(q);
}

// Does the page talk about this programme? At least 60% of the name's distinctive words appear.
export function programmeNameMatches(name: string, text: string): boolean {
  const stop = new Set([
    "bachelor",
    "licence",
    "but",
    "of",
    "in",
    "and",
    "the",
    "de",
    "des",
    "du",
    "la",
    "le",
    "et",
    "en",
    "van",
    "voor",
    "met",
    "sc",
    "ba",
    "bsc",
    "beng",
    "ma",
  ]);
  const words = [
    ...new Set(
      normalizeForMatch(name)
        .replace(/[^a-z0-9àâçéèêëîïôûùüÿñæœäöß ]/g, " ")
        .split(" "),
    ),
  ].filter((w) => w.length > 2 && !stop.has(w));
  if (words.length === 0) return false;
  const haystack = normalizeForMatch(text);
  return words.filter((w) => haystack.includes(w)).length / words.length >= 0.6;
}

// --- does the value agree with the quote? ------------------------------------------------------
const MONTHS: readonly (readonly string[])[] = [
  ["january", "janvier", "januar", "januari", "jan"],
  ["february", "février", "fevrier", "februar", "februari", "feb"],
  ["march", "mars", "märz", "maerz", "maart", "mar"],
  ["april", "avril", "april", "apr"],
  ["may", "mai", "mei"],
  ["june", "juin", "juni", "jun"],
  ["july", "juillet", "juli", "jul"],
  ["august", "août", "aout", "augustus", "aug"],
  ["september", "septembre", "sep", "sept"],
  ["october", "octobre", "oktober", "oct", "okt"],
  ["november", "novembre", "nov"],
  ["december", "décembre", "decembre", "dezember", "dec", "dez"],
];

const NUMBER_WORDS: Record<number, readonly string[]> = {
  1: ["one", "un", "une", "ein", "eine", "een"],
  2: ["two", "deux", "zwei", "twee"],
  3: ["three", "trois", "drei", "drie"],
  4: ["four", "quatre", "vier"],
  5: ["five", "cinq", "fünf", "fuenf", "vijf"],
  6: ["six", "sechs", "zes"],
  7: ["seven", "sept", "sieben", "zeven"],
  8: ["eight", "huit", "acht"],
};

const LANGUAGE_WORDS: Record<string, RegExp> = {
  // ";Inglese" is the language column of the MUR offer file ("...;Convenzionale;Inglese")
  en: /english|anglais|englisch|engels|\bangla|;\s*inglese\b/i,
  fr: /french|français|francais|französisch|franzosisch|frans/i,
  de: /german|allemand|deutsch|duits/i,
  ar: /arabic|arabe|arabisch/i,
  es: /spanish|espagnol|spanisch|spaans/i,
  nl: /dutch|n[eé]erlandais|nederlands|niederl[aä]ndisch/i,
  hu: /hungarian|hongrois|ungarisch|hongaars|magyar/i,
  // "Italian" as the language the course is taught in, not as a nationality ("Italian students") or
  // a place ("Italian universities") or a language course
  it: /(?:taught|delivered|offered|held|given|conducted|provided|instruction|lessons|classes|lectures|courses?|programme|program|degree)\s+(?:entirely |fully |mainly |partly |also )?in\s+italian\b(?!\s+(?:universit|cit|institution|school|student))|\blanguage(?: of instruction| of teaching)?\s*:?\s*italian\b|\blingua(?: di erogazione| del corso| di insegnamento)?\s*:?\s*italian[oa]?\b|in lingua italiana|italian[- ]taught|(?:enseign|dispens|donn|dispos)[ée]e?s?\s+en\s+italien\b|\blangue(?: d'enseignement)?\s*:?\s*(?:en\s+)?italien\b|in italienischer sprache|\b(?:unterrichts|studien)?sprache\s*:?\s*italienisch|\b(?:voertaal|taal)\s*:?\s*(?:het\s+)?italiaans/i,
};

function numberRegex(n: number): string {
  const words = NUMBER_WORDS[n] ?? [];
  return `(?:${[String(n), ...words].join("|")})`;
}

export type FactCheck = { ok: true } | { ok: false; reason: string };
const ok: FactCheck = { ok: true };
const fail = (reason: string): FactCheck => ({ ok: false, reason });

export function checkDuration(years: number, quote: string): FactCheck {
  const q = normalizeForMatch(quote);
  const yearUnits = "(?:year|years|an|ans|jahr|jahre|jahren|jaar|jaren|annee|années)";
  const semesterUnits = "(?:semesters?|semestres?|semester|semsters?)";
  const patterns: RegExp[] = [];
  if (Number.isInteger(years))
    patterns.push(new RegExp(`\\b${numberRegex(years)}[ -]?${yearUnits}\\b`, "i"));
  if (Number.isInteger(years * 2))
    patterns.push(new RegExp(`\\b${numberRegex(years * 2)}\\s*${semesterUnits}`, "i"));
  patterns.push(new RegExp(`\\b${years * 60}\\s*(?:ects|ec\\b|credits|crédits|studiepunten)`, "i"));
  return patterns.some((pattern) => pattern.test(q))
    ? ok
    : fail(`the quote does not state ${years} years, ${years * 2} semesters or ${years * 60} ECTS`);
}

export function checkLanguages(codes: readonly string[], quote: string): FactCheck {
  for (const code of codes) {
    const pattern = LANGUAGE_WORDS[code];
    if (pattern === undefined) return fail(`unknown language code ${code}`);
    if (!pattern.test(quote)) return fail(`the quote does not mention the language ${code}`);
  }
  return ok;
}

function amountPattern(amount: number): RegExp {
  const digits = String(Math.round(amount));
  // thousands groups, each optionally separated: 7000, 7 000, 7,000, 1 980 000, 1.980.000
  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= 3)
    groups.unshift(digits.slice(Math.max(0, end - 3), end));
  const grouped = groups.join("[.,\\s\\u00a0\\u202f']?");
  // not followed by a decimal tail: 5,000.50 is not 5,000
  return new RegExp(`(?<![\\d.,])${grouped}(?:[.,]00)?(?![\\d])(?![.,]\\d)`, "g");
}

// Does the quote state this amount (in major units) as a whole number, not as part of a larger one?
export const amountInQuote = (amountMajor: number, quote: string): boolean =>
  amountMatches(amountMajor, quote).length > 0;

// Where the quote states the amount: [start, end) of each occurrence.
export const amountMatches = (
  amountMajor: number,
  quote: string,
): { start: number; end: number }[] =>
  [...quote.matchAll(amountPattern(amountMajor))].map((m) => ({
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
  }));

const NO_FEE =
  /no tuition|tuition[- ]free|free of charge|no fees|gratuit|keine studiengeb|studiengebührenfrei|geen collegegeld|zonder collegegeld|tuition fees?(?: per (?:semester|year|term))?[: ]+none\b(?!\s+for\b)/i;

// The year the current study year started: from August on it is this calendar year, before that last
// year (a Dutch or German study year begins in September or October).
export function currentStudyYear(now: Date = new Date()): number {
  return now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

// "2026-2027", "2026/27", "2026-27": a study year written in a fee quote. The second part must be
// the next year, so a date ("2025-11-03") and a span ("2024-2027") are not study years.
const STUDY_YEAR = /(?<!\d)(20\d\d)\s*[-/–]\s*((?:20)?\d\d)(?![\d]|\s*[-/–]\s*\d)/g;
// "since the winter semester 2017/18": a start of something, not the year the amount is for
const SINCE_LABEL = /\b(?:seit|since|sinds)\s+(?:dem\s+|het\s+)?(?:\w+\s+)?$/i;
// something that reads as an amount of money: a euro sign or a number with a thousands group
const AMOUNT_LIKE = /€\s*\d|\d{1,3}[.,]\d{3}/;

type StudyYearLabel = { start: number; at: number; end: number };

function studyYearLabels(q: string): StudyYearLabel[] {
  const labels: StudyYearLabel[] = [];
  for (const m of q.matchAll(STUDY_YEAR)) {
    const start = Number(m[1]);
    const second = Number(m[2]);
    const next = start + 1;
    if (second !== next && second !== next % 100) continue;
    const at = m.index ?? 0;
    if (SINCE_LABEL.test(q.slice(Math.max(0, at - 30), at))) continue;
    labels.push({ start, at, end: at + m[0].length });
  }
  return labels;
}

// Why the amount cannot be tied to a study year of `minStudyYear` or later, or null when it can (or
// when the quote names no study year at all: a programme page, left to the checker). Each occurrence
// of the amount takes the closest study year written BEFORE it, else the first one after it. Years
// that stand side by side as column headers ("2025-2026 2026-2027 ... € 10.164 € 10.528") say
// nothing about which column an amount is in: that is ambiguous unless every one of them is current.
function staleStudyYear(amountMajor: number, quote: string, minStudyYear: number): string | null {
  const q = normalizeForMatch(quote);
  const labels = studyYearLabels(q);
  if (labels.length === 0) return null;
  for (const amount of q.matchAll(amountPattern(amountMajor))) {
    const from = amount.index ?? 0;
    const before = labels.filter((label) => label.end <= from);
    let run: StudyYearLabel[];
    if (before.length > 0) {
      run = [];
      for (let i = before.length - 1; i >= 0; i--) {
        const label = before[i];
        if (label === undefined) break;
        const following = run[0];
        if (following !== undefined && AMOUNT_LIKE.test(q.slice(label.end, following.at))) break;
        run.unshift(label);
      }
    } else {
      const after = labels.find((label) => label.at >= from + amount[0].length);
      run = after === undefined ? [] : [after];
    }
    const oldest = Math.min(...run.map((label) => label.start));
    if (run.length > 0 && oldest < minStudyYear)
      return run.length > 1
        ? `the amount cannot be tied to one of the study years ${run.map((l) => l.start).join(", ")}`
        : `the amount sits next to the study year ${oldest}, before ${minStudyYear}`;
  }
  return null;
}

// `minStudyYear` is the year the study year the amount must be for starts in (currentStudyYear());
// it is an argument so a verification is reproducible.
// How a quote writes the currencies the fee pages use. A currency not listed here is not checked.
const CURRENCY_TOKENS: Record<string, string> = {
  EUR: String.raw`EUR\b|euros?\b|€`,
  USD: String.raw`US\$|USD\b|\$|dollars?\b`,
  HUF: String.raw`HUF\b|Ft\b|forint`,
  GBP: String.raw`GBP\b|£|pounds?\b`,
};
const AFTER = Object.fromEntries(
  // "3.000,- EUR": the Dutch and German ",-" may stand between the amount and its currency
  Object.entries(CURRENCY_TOKENS).map(([c, t]) => [
    c,
    new RegExp(`^(?:,\\s?[-–])?\\s{0,2}(?:${t})`, "i"),
  ]),
);
const BEFORE = Object.fromEntries(
  // a word that merely ends in a currency ("Amateur") is not a mark: a boundary or a symbol first
  Object.entries(CURRENCY_TOKENS).map(([c, t]) => [
    c,
    new RegExp(`(?:^|[^a-z])(?:${t})\\s{0,2}$`, "i"),
  ]),
);

// The currency written beside one occurrence of the amount: the one right after it ("3,000 EUR",
// "7 000 €") wins, else the one right before it ("EUR 3,000", "US$3,400"). A word that merely
// contains a currency ("non-European") is not a currency mark.
function currencyBesideAmount(before: string, after: string): string | null {
  for (const [code, re] of Object.entries(AFTER)) if (re.test(after)) return code;
  for (const [code, re] of Object.entries(BEFORE)) if (re.test(before)) return code;
  return null;
}

function amountHasCurrency(amountMajor: number, quote: string, currency: string): boolean {
  const q = normalizeForMatch(quote);
  for (const m of q.matchAll(amountPattern(amountMajor))) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const found = currencyBesideAmount(
      q.slice(Math.max(0, start - 14), start),
      q.slice(end, end + 14),
    );
    if (found === currency) return true;
  }
  return false;
}

export function checkTuition(
  amountMinor: number,
  quote: string,
  minStudyYear: number,
  currency?: string,
): FactCheck {
  if (amountMinor === 0)
    return NO_FEE.test(quote)
      ? ok
      : fail("a zero fee needs a quote saying there are no tuition fees");
  if (!amountInQuote(amountMinor / 100, quote))
    return fail(`the amount ${amountMinor / 100} does not appear in the quote`);
  if (
    currency !== undefined &&
    CURRENCY_TOKENS[currency] !== undefined &&
    !amountHasCurrency(amountMinor / 100, quote, currency)
  )
    return fail(`the quote does not write the amount in the currency ${currency}`);
  const stale = staleStudyYear(amountMinor / 100, quote, minStudyYear);
  return stale === null ? ok : fail(stale);
}

// The day written right next to the month: "15 July", "15. Juli", "July 15", "15.07.", "15/07". A
// day and a month that merely both occur in the quote ("1 July; 15 places") are not a date.
function dayBesideMonth(month: number, day: number, q: string): boolean {
  const names = (MONTHS[month - 1] ?? []).join("|");
  return (
    new RegExp(`(?<!\\d)0?${day}(?:st|nd|rd|th|er|\\.)?\\s*(?:of\\s+)?(?:${names})\\b`).test(q) ||
    new RegExp(`\\b(?:${names})\\.?\\s*0?${day}(?:st|nd|rd|th)?(?!\\d)`).test(q) ||
    new RegExp(`(?<!\\d)0?${day}\\s*[./-]\\s*0?${month}(?!\\d)`).test(q)
  );
}

// Where a quote states a date ("15 March", "March 15", "15.03.", "2027-03-15"): [start, end) in the
// quote as normalizeForMatch writes it, in order.
export function dateSpans(quote: string): { start: number; end: number }[] {
  const q = normalizeForMatch(quote);
  const names = MONTHS.flat().join("|");
  const patterns = [
    new RegExp(`(?<!\\d)\\d{1,2}(?:st|nd|rd|th|er|\\.)?\\s*(?:of\\s+)?(?:${names})\\b`, "g"),
    new RegExp(`\\b(?:${names})\\.?\\s*\\d{1,2}(?:st|nd|rd|th)?(?!\\d)`, "g"),
    /(?<!\d)\d{1,2}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{2,4}(?!\d)/g,
    /(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)/g,
  ];
  return patterns
    .flatMap((pattern) =>
      [...q.matchAll(pattern)].map((m) => ({
        start: m.index ?? 0,
        end: (m.index ?? 0) + m[0].length,
      })),
    )
    .sort((a, b) => a.start - b.start);
}

// How many dates a quote states: more than one means the quote is about several groups or steps,
// and one of its dates must not be taken for another's.
export const countDates = (quote: string): number => dateSpans(quote).length;

export function checkDeadline(isoDate: string, quote: string): FactCheck {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (match === null) return fail("deadline is not an ISO date");
  const [, year, month, day] = match;
  const q = normalizeForMatch(quote);
  const stated =
    dayBesideMonth(Number(month), Number(day), q) ||
    new RegExp(`${year}-0?${Number(month)}-0?${Number(day)}`).test(q);
  if (!stated) return fail(`the date ${isoDate} does not appear in the quote`);
  // A year the page does not state is an inference, not a fact: leave it for a human.
  return new RegExp(`(?<!\\d)${year}(?!\\d)`).test(q)
    ? ok
    : fail(`the quote does not state the year ${year}`);
}

// A year in the quote makes it a dated deadline: it must not be reused as "every year" (ADR 0009).
export function checkRecurringDeadline(month: number, day: number, quote: string): FactCheck {
  const q = normalizeForMatch(quote);
  if (/(?<!\d)(?:19|20)\d{2}(?!\d)/.test(q))
    return fail("the quote states a year: a dated deadline, not a recurring one");
  return dayBesideMonth(month, day, q)
    ? ok
    : fail(`the quote does not state the day ${day} and the month ${month}`);
}

const CHANNEL_WORDS: Record<string, RegExp> = {
  "fr-parcoursup": /parcoursup/i,
  "fr-campus-france": /campus\s*france|[eé]tudes en france/i,
  "nl-studielink": /studielink/i,
  "de-uni-assist-vpd": /\bVPD\b|Vorp[üu]fungsdokumentation|preliminary (review|evaluation)/i,
  "de-university-direct":
    /application portal|apply directly|directly (to|at) the (higher education institution|university)|application via the university/i,
  "de-uni-assist": /uni-assist|uniassist/i,
  "hu-university-direct":
    /online application (?:form|system|portal|platform|site)|application (?:portal|platform|system)|apply online|register (?:and complete the |on the )online application|application form[^.]{0,60}(?:university|institution)|apply (?:directly )?(?:online )?(?:on|at|to|through) the (?:website of the |own )?(?:chosen |selected )?(?:university|institution)|university'?s? (?:own )?(?:application|admission)/i,
  // "available in the Stipendium Hungaricum programme" is a listing, not how to apply
  "hu-stipendium-hungaricum":
    /appl(?:y|ies|ication|ications)[^.]{0,60}stipendium hungaricum|stipendium hungaricum[^.]{0,40}(?:application|call|applicants?)/i,
  // Universitaly is the MUR portal where a non-EU applicant living abroad pre-enrols
  "it-universitaly": /universitaly/i,
  "it-university-direct":
    /online application (?:form|system|portal|platform|site)|application (?:portal|platform|system)|apply online|application form[^.]{0,60}(?:university|ateneo)|apply (?:directly )?(?:online )?(?:on|at|to|through|via) the (?:website of the |own )?(?:university|ateneo)|(?:university|ateneo)'?s? (?:own )?(?:application|admission) (?:portal|platform|form|system)/i,
};

// A quote that names another channel is not evidence for this one, whatever else it says.
const CHANNEL_EXCLUDES: Record<string, RegExp> = {
  "hu-university-direct": /stipendium hungaricum|felvi/i,
  // Universitaly is the other channel; a quote about EU, Italian or Italy-resident applicants is
  // not about a Moroccan applicant living abroad ("non-EU" is fine)
  "it-university-direct":
    /universitaly|(?<!non[- ])\bEU\b|italian (?:citizens|students|applicants)|(?:legally )?resid(?:ing|ent)s? in italy|\bEEA\b|italian (?:nationals|residents)|(?:living|already) in italy|cittadini italiani|comunitari/i,
};

export function checkChannel(slug: string, quote: string): FactCheck {
  const pattern = CHANNEL_WORDS[slug];
  if (pattern === undefined) return fail(`channel ${slug} cannot be verified automatically`);
  if (CHANNEL_EXCLUDES[slug]?.test(quote) === true)
    return fail(`the quote describes another channel than ${slug}`);
  return pattern.test(quote) ? ok : fail(`the quote does not name the channel ${slug}`);
}

const SUBJECT_WORDS: Record<string, RegExp> = {
  mathematics: /math/i,
  "physics-chemistry": /physi[ck]|physique|chem|chimie|natural science/i,
  "life-earth-sciences": /biolog|svt|life science|sciences de la vie|earth science/i,
  arabic: /arabic|arabe|arabisch/i,
  french: /french|fran[cç]ais|franz[oö]sisch/i,
  english: /english|anglais|englisch/i,
  philosophy: /philosoph/i,
  "history-geography": /history|histoire|geschichte|geograph|g[ée]ographie/i,
  economics: /econom|[ée]conom|wirtschaft/i,
  "accounting-management": /accounting|comptabilit|gestion|rechnungswesen/i,
  "islamic-education": /islam/i,
  "computer-science": /computer|informati/i,
};

const TEST_WORDS: Record<string, RegExp> = {
  "delf-dalf": /\bDELF\b|\bDALF\b/,
  tcf: /\bTCF\b/,
  ielts: /\bIELTS\b/i,
  toefl: /\bTOEFL\b/i,
  testdaf: /\bTestDaF\b/i,
};

export function checkCefr(level: string, quote: string): FactCheck {
  return new RegExp(`(?<![A-Za-z0-9])${level}(?![A-Za-z0-9])`).test(quote)
    ? ok
    : fail(`the quote does not state the level ${level}`);
}

export function checkSubjects(slugs: readonly string[], quote: string): FactCheck {
  for (const slug of slugs) {
    const pattern = SUBJECT_WORDS[slug];
    if (pattern === undefined) return fail(`unknown subject ${slug}`);
    if (!pattern.test(quote)) return fail(`the quote does not mention the subject ${slug}`);
  }
  return ok;
}

export function checkTests(slugs: readonly string[], quote: string): FactCheck {
  for (const slug of slugs) {
    const pattern = TEST_WORDS[slug];
    if (pattern === undefined) return fail(`unknown test ${slug}`);
    if (!pattern.test(quote)) return fail(`the quote does not name the test ${slug}`);
  }
  return ok;
}

export function checkYears(years: number, quote: string): FactCheck {
  return new RegExp(
    `(?<![\\d.,])${numberRegex(years)}(?![\\d.,])[^.]{0,20}(year|jahr|an|jaar)`,
    "i",
  ).test(normalizeForMatch(quote))
    ? ok
    : fail(`the quote does not state ${years} year(s)`);
}

// The slugs the verifier can check, for the instruction the reading model is given.
export const CHANNEL_SLUGS = Object.keys(CHANNEL_WORDS);
export const SUBJECT_SLUGS = Object.keys(SUBJECT_WORDS);
export const TEST_SLUGS = Object.keys(TEST_WORDS);
export const LANGUAGE_CODES = Object.keys(LANGUAGE_WORDS);

// --- does a quote name the institution? ---------------------------------------------------------
// Words that name a kind of institution, not a particular one.
const GENERIC = new Set(
  "hogeschool university universiteit universitat universität universite université hochschule fachhochschule applied sciences science school college ecole école institut institute of the and for van de der die das het en la le les du des christelijke state management technik technische wirtschaft technology business studies international freie national nationale".split(
    " ",
  ),
);

// The words of an institution's name that tell it apart from others, in name order: the brand
// ("Fontys") comes before the town ("Tilburg").
export function distinctiveTokens(name: string): string[] {
  return [
    ...new Set(
      name
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((t) => t.length >= 3 && !GENERIC.has(t)),
    ),
  ];
}

export const wholeWord = (token: string, flags = "u"): RegExp =>
  new RegExp(`(?<![\\p{L}\\p{N}])${token}(?![\\p{L}\\p{N}])`, flags);

// Does the quote contain a distinctive word of the name as a whole word? (Not just a generic word,
// and not a word inside a longer one.)
export function quoteNames(name: string, quote: string): boolean {
  const lower = quote.toLowerCase();
  return distinctiveTokens(name).some((token) => wholeWord(token).test(lower));
}
