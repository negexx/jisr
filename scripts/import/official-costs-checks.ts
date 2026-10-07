import { minorUnitDigits } from "@/lib/format";

import { normalizeForMatch, quoteInText } from "./evidence";
import { currencyNextTo } from "./scholarships";

// The pure checks of `data:costs-official verify`: does a quote really state the proposed figure, in
// its currency, for its period, with a date. No I/O: the caller has fetched the page.

// An estimate older than this is not used (a legal rate in force is `official` and has no age limit).
export const MIN_ESTIMATE_YEAR = 2026;

export type Period = "month" | "year" | "once";
export type LineInput = {
  min: number;
  max: number;
  currency: string;
  per: Period;
  info_kind: "official" | "estimate";
  evidence: { url: string; quote: string; dateQuote?: string | undefined };
};

type Span = { start: number; end: number };

// --- numbers -----------------------------------------------------------------------------------------
const SEPARATOR = String.raw`[.,'\s  ]`;

// Where a quote (as normalizeForMatch writes it) states this amount in major units: thousands
// groups optionally separated (1200, 1 200, 1,200, 1.200), a decimal comma or point, and never as
// part of a larger number (40 is not in 400, 500 is not in 1 500 or 500,50). The decimals stop at the
// currency's minor digits, so a separator followed by three digits is a thousands group, never a
// decimal: 1.2 is not in "1.200" and 1.05 is not in "1,050".
export function numberMatches(value: number, quote: string, digits = 2): Span[] {
  const [whole = "0", cents = ""] = value.toFixed(digits).split(".");
  const groups: string[] = [];
  for (let end = whole.length; end > 0; end -= 3)
    groups.unshift(whole.slice(Math.max(0, end - 3), end));
  const fraction = cents.replace(/0+$/, "");
  let decimals = "";
  if (digits > 0)
    decimals =
      fraction === ""
        ? `(?:[.,]0{1,${digits}})?`
        : `[.,]${fraction}0{0,${digits - fraction.length}}`;
  const pattern = new RegExp(
    String.raw`(?<!\d)(?<!\d${SEPARATOR})${groups.join(`${SEPARATOR}?`)}${decimals}(?!\d)(?![.,]\d)(?!${SEPARATOR}\d{3}(?!\d))`,
    "g",
  );
  return [...quote.matchAll(pattern)].map((m) => ({
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
  }));
}

// --- years -------------------------------------------------------------------------------------------
const MONEY_AFTER = /^\s?(?:[€$£]|(?:eur|euros?|usd|gbp|huf|ft)\b)/;
const MONEY_BEFORE = /(?:[€$£]|\b(?:eur|usd|gbp|huf))\s?$/;

// The years a text states, leaving out an amount that merely looks like one ("2040 EUR", "EUR 2025").
// The text is normalised first (lower case), so an upper-case currency code is still a currency.
export function yearsIn(raw: string): number[] {
  const text = normalizeForMatch(raw);
  const years: number[] = [];
  for (const m of text.matchAll(/(?<!\d)((?:19|20)\d{2})(?!\d)(?![.,]\d)/g)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (
      MONEY_AFTER.test(text.slice(end, end + 8)) ||
      MONEY_BEFORE.test(text.slice(Math.max(0, start - 8), start))
    )
      continue;
    years.push(Number(m[1]));
  }
  return years;
}

type Age = { oldest: number; newest: number; from: "quote" | "date quote" };

// An estimate needs a year of MIN_ESTIMATE_YEAR or later. A year in the quote decides alone (its
// oldest year: a table of 2016 and 2025 figures is not a 2025 figure, and a date quote cannot rescue
// it); only a quote without any year may take its date from `dateQuote`, a second verbatim quote of
// the same page. A year elsewhere on the page (a footer, a menu) says nothing about this figure.
function ageOf(line: LineInput, pageContent: string): Age | { problem: string } {
  const { url, quote, dateQuote } = line.evidence;
  const inQuote = yearsIn(quote);
  const judge = (years: number[], from: Age["from"]): Age | { problem: string } => {
    const oldest = Math.min(...years);
    if (oldest < MIN_ESTIMATE_YEAR)
      return {
        problem: `the oldest year in the ${from} is ${oldest}, before ${MIN_ESTIMATE_YEAR}`,
      };
    return { oldest, newest: Math.max(...years), from };
  };
  if (inQuote.length > 0) return judge(inQuote, "quote");
  if (dateQuote === undefined)
    return {
      problem: `the quote states no year (an estimate needs a year of ${MIN_ESTIMATE_YEAR} or later in its quote, or in a date quote from the same page)`,
    };
  if (!quoteInText(dateQuote, pageContent))
    return {
      problem: `the date quote is not on the page ${url} (verbatim, 15 characters at least)`,
    };
  const inDate = yearsIn(dateQuote);
  if (inDate.length === 0)
    return { problem: "the quote and the date quote state no year, so the figure is undated" };
  return judge(inDate, "date quote");
}

// --- period ------------------------------------------------------------------------------------------
const periodWords = (alternatives: string[]): RegExp =>
  new RegExp(`(?<!\\p{L})(?:${alternatives.join("|")})(?!\\p{L})`, "u");

// How a quote names the period of an amount (English, French, German, Italian, Hungarian, Dutch).
const PERIOD_WORDS: Record<Period, RegExp> = {
  month: periodWords([
    "months?",
    "monthly",
    "mensuel\\p{L}*",
    "mois",
    "monat\\p{L}*",
    "mes[ei]",
    "mensil\\p{L}*",
    "havi",
    "havonta",
    "maand\\p{L}*",
  ]),
  year: periodWords([
    "years?",
    "yearly",
    "per annum",
    "annual\\p{L}*",
    "annuel\\p{L}*",
    "ann[ée]es?",
    "par an",
    "(?<=/)an",
    "jahr\\p{L}*",
    "j[äa]hrlich",
    "anno",
    "annuo",
    "jaar",
    "jaarlijks",
    "évi",
    "évente",
  ]),
  once: periodWords([
    "one-off",
    "one[- ]time",
    "once",
    "(?:paiement|versement|frais|règlement|reglement) uniques?",
    "uniques? (?:paiement|versement|règlement|reglement)",
    "une seule fois",
    "einmalig\\p{L}*",
    "una tantum",
    "eenmalig\\p{L}*",
  ]),
};
const PERIODS = Object.keys(PERIOD_WORDS) as Period[];

// "di durata superiore a tre mesi e inferiore o pari a un anno", "valid for one month", "for a stay of
// one year": how long something lasts, not what the amount is paid per. Blanked out (same length, so
// positions still line up) before the period words are read. The cues are explicit duration words:
// a bare "for" / "pour" is not one ("costs 120 EUR for a year" is the amount's own period).
const DURATION =
  /(?<!\p{L})(?:di durata|durata|durée|duration|lasting|valid for|for a stay of|pour un séjour de)(?!\p{L})[^.;:]{0,80}(?<!\p{L})(?:an?|un|une|one)\s+(?:years?|anno|ans?|months?|mese|mois)(?!\p{L})/gu;
// A phrase this close after an amount ("120 EUR valid for one year") describes that amount.
const MAX_GAP_AFTER_AMOUNT = 12;

type PeriodReading = { text: string; periods: Period[]; ignoredDurations: string[] };

// A duration phrase is blanked only if it holds no amount and does not directly follow one: an
// amount's own period must never be read as a duration.
function readPeriods(quote: string, amounts: Span[]): PeriodReading {
  const normalised = normalizeForMatch(quote);
  const ignoredDurations: string[] = [];
  const text = normalised.replace(DURATION, (phrase: string, offset: number) => {
    const end = offset + phrase.length;
    const about = amounts.some(
      (a) =>
        (a.start < end && a.end > offset) ||
        (offset >= a.end && offset - a.end <= MAX_GAP_AFTER_AMOUNT),
    );
    if (about) return phrase;
    ignoredDurations.push(phrase.trim());
    return " ".repeat(phrase.length);
  });
  return {
    text,
    periods: PERIODS.filter((p) => PERIOD_WORDS[p].test(text)),
    ignoredDurations,
  };
}

const positionsOf = (period: Period, text: string): number[] =>
  [...text.matchAll(new RegExp(PERIOD_WORDS[period].source, "gu"))].map((m) => m.index ?? 0);

// The period words standing right next to the amounts: the first one after the amount in its clause
// (up to 30 characters), else the last one before it in its sentence (up to 25).
function periodsNextTo(text: string, amounts: Span[]): Period[] {
  const found = new Set<Period>();
  for (const { start, end } of amounts) {
    const after = (text.slice(end, end + 30).split(/[.;!?,]/)[0] ?? "").trimEnd();
    const before =
      text
        .slice(Math.max(0, start - 25), start)
        .split(/[.;!?]/)
        .at(-1) ?? "";
    for (const [segment, pick] of [
      [after, "first"],
      [before, "last"],
    ] as const) {
      const hits = PERIODS.flatMap((period) =>
        positionsOf(period, segment).map((index) => ({ period, index })),
      ).sort((a, b) => (pick === "first" ? a.index - b.index : b.index - a.index));
      const nearest = hits[0];
      if (nearest !== undefined) {
        found.add(nearest.period);
        break;
      }
    }
  }
  return [...found];
}

// --- one line ----------------------------------------------------------------------------------------
export type LineCheck =
  | { ok: false; problem: string }
  // `age` is null for an `official` line (a rate in force: no age check); `notes` are for the auditor.
  | { ok: true; age: Age | null; notes: string[] };

// Whether a line can be kept. The page is already fetched.
export function checkLine(line: LineInput, pageContent: string): LineCheck {
  const { url, quote } = line.evidence;
  if (!quoteInText(quote, pageContent))
    return {
      ok: false,
      problem: `the quote is not on the page ${url} (verbatim, 15 characters at least)`,
    };
  const text = normalizeForMatch(quote);
  const digits = minorUnitDigits(line.currency);
  const amounts: Span[] = [];
  for (const value of new Set([line.min, line.max])) {
    const found = numberMatches(value, text, digits);
    if (found.length === 0)
      return { ok: false, problem: `the number ${value} is not in the quote` };
    amounts.push(...found);
  }
  if (!amounts.some((m) => currencyNextTo(line.currency, text, m.start, m.end)))
    return {
      ok: false,
      problem: `the currency ${line.currency} is not written next to ${line.min} or ${line.max} in the quote`,
    };

  const notes: string[] = [];
  const reading = readPeriods(quote, amounts);
  const ignored = reading.ignoredDurations.map((phrase) => `ignored duration phrase: '${phrase}'`);
  if (reading.periods.length > 0 && !reading.periods.includes(line.per))
    return {
      ok: false,
      problem: `the quote states the period ${reading.periods.join(" and ")} but the line says per ${line.per}`,
    };
  if (reading.periods.length === 0)
    notes.push(
      `period not stated in quote (per ${line.per} comes from the proposal${ignored.length > 0 ? `; ${ignored.join("; ")}` : ""})`,
    );
  else notes.push(...ignored);
  if (reading.periods.length > 1) {
    const next = periodsNextTo(reading.text, amounts);
    if (next.length > 0 && !next.includes(line.per))
      return {
        ok: false,
        problem: `the period word nearest the amount says ${next.join(" and ")}, but the line says per ${line.per}`,
      };
    notes.push(
      `several periods stated (${reading.periods.join(", ")}): check that per ${line.per} is the amount's own`,
    );
  }

  if (line.info_kind === "official") return { ok: true, age: null, notes };
  const age = ageOf(line, pageContent);
  if ("problem" in age) return { ok: false, problem: age.problem };
  return { ok: true, age, notes };
}
