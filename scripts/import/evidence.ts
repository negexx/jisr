import { fetchText } from "./http";
import { isPdfUrl, pdfText } from "./pdf";

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

export async function pageText(url: string): Promise<string> {
  if (!url.startsWith("https://")) throw new Error("evidence pages must be https");
  if (isPdfUrl(url)) return pdfText(url);
  const body = await fetchText(url, { accept: "text/html,application/xhtml+xml" });
  return htmlToText(body);
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

const TRANSLATION_WORDS =
  /translat|übersetz|uebersetz|vertaling|vertaald|traduction|traduit|beglaubigt|certified cop/i;
export const mentionsTranslation = (quote: string): boolean => TRANSLATION_WORDS.test(quote);

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
  en: /english|anglais|englisch|engels|\bangla/i,
  fr: /french|français|francais|französisch|franzosisch|frans/i,
  de: /german|allemand|deutsch|duits/i,
  ar: /arabic|arabe|arabisch/i,
  es: /spanish|espagnol|spanisch|spaans/i,
  nl: /dutch|n[eé]erlandais|nederlands|niederl[aä]ndisch/i,
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
  const semesterUnits = "(?:semesters?|semestres?|semester)";
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
  const grouped =
    digits.length > 3 ? `${digits.slice(0, -3)}[.,\\s\\u00a0\\u202f']?${digits.slice(-3)}` : digits;
  return new RegExp(`(?<![\\d.,])${grouped}(?:[.,]00)?(?![\\d])`);
}

const NO_FEE =
  /no tuition|tuition[- ]free|free of charge|no fees|gratuit|keine studiengeb|studiengebührenfrei|geen collegegeld|zonder collegegeld|tuition fees?(?: per (?:semester|year|term))?[: ]+none\b(?!\s+for\b)/i;

export function checkTuition(amountMinor: number, quote: string): FactCheck {
  if (amountMinor === 0)
    return NO_FEE.test(quote)
      ? ok
      : fail("a zero fee needs a quote saying there are no tuition fees");
  return amountPattern(amountMinor / 100).test(quote)
    ? ok
    : fail(`the amount ${amountMinor / 100} does not appear in the quote`);
}

export function checkDeadline(isoDate: string, quote: string): FactCheck {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (match === null) return fail("deadline is not an ISO date");
  const [, year, month, day] = match;
  const d = Number(day);
  const m = Number(month);
  const q = normalizeForMatch(quote);
  const dayOk = new RegExp(`(?<!\\d)0?${d}(?:st|nd|rd|th|er|\\.)?(?!\\d)`).test(q);
  const names = MONTHS[m - 1] ?? [];
  const monthOk =
    names.some((n) => new RegExp(`\\b${n}\\b`, "i").test(q)) ||
    new RegExp(`(?<!\\d)0?${d}\\s*[./-]\\s*0?${m}(?!\\d)`).test(q) ||
    new RegExp(`${year}-0?${m}-0?${d}`).test(q);
  if (!(dayOk && monthOk)) return fail(`the date ${isoDate} does not appear in the quote`);
  // A year the page does not state is an inference, not a fact: leave it for a human.
  return new RegExp(`(?<!\\d)${year}(?!\\d)`).test(q)
    ? ok
    : fail(`the quote does not state the year ${year}`);
}

const CHANNEL_WORDS: Record<string, RegExp> = {
  "fr-parcoursup": /parcoursup/i,
  "fr-campus-france": /campus\s*france|[eé]tudes en france/i,
  "nl-studielink": /studielink/i,
  "de-uni-assist-vpd": /\bVPD\b|Vorp[üu]fungsdokumentation|preliminary (review|evaluation)/i,
  "de-university-direct":
    /application portal|apply directly|directly (to|at) the (higher education institution|university)|application via the university/i,
  "de-uni-assist": /uni-assist|uniassist/i,
};

export function checkChannel(slug: string, quote: string): FactCheck {
  const pattern = CHANNEL_WORDS[slug];
  if (pattern === undefined) return fail(`channel ${slug} cannot be verified automatically`);
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
