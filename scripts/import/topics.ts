import { extractLinks, OTHER_FILE, registrable, sameSite } from "./discover";
import { normalizeForMatch } from "./evidence";
import type { QueryBudget, SearchHit, SearchProvider } from "./search";

// Institution-level searches for the pages that state what a programme page often leaves out: fees,
// the language of instruction, the application deadline and the documents. Tuition, deadline and
// document pages are mostly institution-wide, so one query serves every programme of the institution
// (through `memo`) and the cost stays near (institutions x 4) queries. The reader still has to quote
// each page and the verifier still has to find the quote: a wrong page costs tokens, not a wrong fact.
export const TOPICS = ["fees", "language", "deadline", "documents"] as const;
export type Topic = (typeof TOPICS)[number];

const WORDS: Record<string, Record<Topic, string>> = {
  DE: {
    fees: "Studiengebühren Semesterbeitrag internationale Studierende tuition fees",
    language: "Unterrichtssprache Studiensprache language of instruction",
    deadline: "Bewerbungsfrist internationale Bewerber application deadline",
    documents:
      "Bewerbungsunterlagen erforderliche Unterlagen international applicants required documents",
  },
  FR: {
    fees: "droits d'inscription étudiants internationaux",
    language: "langue d'enseignement enseigné en",
    deadline: "date limite de candidature étudiants internationaux",
    documents: "pièces justificatives dossier de candidature étudiants internationaux",
  },
  IT: {
    fees: "tasse universitarie contributi studenti internazionali non UE tuition fees",
    language: "lingua di erogazione lingua inglese language of instruction",
    deadline: "scadenza preiscrizione studenti internazionali non UE application deadline",
    documents: "documenti richiesti studenti internazionali titolo estero required documents",
  },
  NL: {
    fees: "instellingscollegegeld collegegeld niet-EER studenten tuition fees non-EEA",
    language: "voertaal taal van het onderwijs language of instruction",
    deadline: "aanmelddeadline niet-EER 1 april aanmelden deadline application",
    documents: "benodigde documenten toelating international students required documents",
  },
};

const LANGUAGE: Record<string, string> = { DE: "de", FR: "fr", IT: "it", NL: "nl" };

const PATTERN: Record<Topic, RegExp> = {
  fees: /tuition|\bfees?\b|\bcosts?\b|gebu(?:e)?hr|studienbeitr|semesterbeitr|collegegeld|\btarie(?:f|ven)\b|kosten|droits?[ _-]d[ '_-]?inscription|frais[ _-]de[ _-]scolarit|droits[ _-]de[ _-]scolarit|\btasse\b|contribut[io]|\bretta\b|\bcosti\b/,
  language:
    /language of instruction|teaching language|instruction|unterrichtssprache|studiensprache|\bsprache|voertaal|\btaal\b|language|langue[ _-]d[ '_-]?enseignement|enseigne[ _-]en\b|langue[ _-]de[ _-]la[ _-]formation|\blingua\b|erogazione/,
  deadline:
    /deadline|frist|termine?\b|aanmeld|application period|dates|date[ _-]limite|calendrier|candidat(?:ure|er)|scadenz[ae]|preiscrizion[ei]|calendario/,
  documents:
    /documents?|unterlagen|nachweis|documenten|required|checklist|erforderlich|benodigde|pieces|justificatifs|dossier[ _-]de[ _-]candidature|documenti|titolo[ _-]estero|allegati/,
};

const NEWSISH = /\/(news|blog|events?|actualit|presse|press|agenda|nieuws|aktuell|veranstaltung)/;
const DATED_POST = /\/(19|20)\d{2}\/(0[1-9]|1[0-2])(\/|$)/;

// Every topic, or the comma-separated subset of a `--topic-list` flag.
export function parseTopicList(value: string | undefined): Topic[] {
  if (value === undefined) return [...TOPICS];
  const topics = value
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "")
    .map((name) => {
      const topic = TOPICS.find((t) => t === name);
      if (topic === undefined) throw new Error(`unknown topic ${name}`);
      return topic;
    });
  if (topics.length === 0) throw new Error("--topic-list names no topic");
  return topics;
}

const fold = (text: string): string =>
  normalizeForMatch(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export function scoreTopicLink(link: { url: string; text: string }, topic: Topic): number {
  let path: string;
  try {
    path = decodeURIComponent(new URL(link.url).pathname);
  } catch {
    path = new URL(link.url).pathname;
  }
  const penalty = NEWSISH.test(fold(path)) ? 0.5 : 1;
  const pattern = PATTERN[topic];
  return (
    ((pattern.test(fold(link.text)) ? 0.6 : 0) + (pattern.test(fold(path)) ? 0.4 : 0)) * penalty
  );
}

// A study year is two consecutive years: 2026-2027, 2026 - 2027, 2026/2027 or 2026/27 and 2026-27.
// Candidates overlap (the lookahead), so the "2045/2024" of "/media/2045/2024-2025.pdf" is tried and
// refused without hiding the real pair after it.
const YEAR_PAIR = /(?<!\d)(?=(20\d\d)(?:\s*[-/]\s*|\s+)(20\d\d)(?!\d))/g;
const YEAR_SHORT = /(?<!\d)(20\d\d)[-/](\d\d)(?!\d)/g;
const YEAR_LABELLED = /(?:studiejaar|academic year)[\s_-]*(20\d\d)(?!\d)/g;
const YEAR_BARE = /(?<!\d)(20\d\d)(?!\d)/g;
const STUDY_WORDS = /studiejaar|academic year/;

// The start years of every study-year form in the text. The link filter and the year ranking both
// read this, so they cannot drift apart.
function studyYears(text: string): number[] {
  const pairs = [...text.matchAll(YEAR_PAIR)]
    .filter((m) => Number(m[2]) === Number(m[1]) + 1)
    .map((m) => Number(m[1]));
  const shorts = [...text.matchAll(YEAR_SHORT)]
    .filter((m) => Number(m[2]) === (Number(m[1]) + 1) % 100)
    .map((m) => Number(m[1]));
  const labelled = [...text.matchAll(YEAR_LABELLED)].map((m) => Number(m[1]));
  return [...pairs, ...shorts, ...labelled];
}
const hasStudyYear = (text: string): boolean =>
  STUDY_WORDS.test(text) || studyYears(text).length > 0;
const FEE_TOOL = /collegegeldmeter|tarieven|tariff|fee calculator/;
const MAX_FEE_PAGES_FETCHED = 3;

// The study year a link names, as its highest start year: 2026-2027, 2026 - 2027 and 2026/27 are
// 2026. A study-year form counts in the text or the path; a bare year only in the link text, since a
// path is full of ids and media folders (/media/2045/, /page/120251) that are not years.
function startYear(text: string, path: string): number | null {
  const both = `${text} ${path}`;
  const study = studyYears(both);
  const years = study.length > 0 ? study : [...text.matchAll(YEAR_BARE)].map((m) => Number(m[1]));
  return years.length === 0 ? null : Math.max(...years);
}

type FeeCandidate = { url: string; score: number; year: number | null };

// A fee page often links the rate sheet of the current study year, a fee calculator or a PDF
// schedule that no search answers. HTML only, same site, https, one level deep; a page that cannot be
// fetched is skipped and nothing here throws. Only the newest study year found survives, and the
// newest year sorts first, so a past year's sheet never outranks the current one.
export async function followFeeLinks(
  feePages: readonly string[],
  input: {
    website: string;
    fetchHtml: (url: string) => Promise<string>;
    limit?: number;
  },
): Promise<string[]> {
  const known = new Set(feePages);
  const found = new Map<string, FeeCandidate>();
  const pages = feePages
    .filter((url) => !/\.pdf(\?|#|$)/i.test(url))
    .slice(0, MAX_FEE_PAGES_FETCHED);
  for (const page of pages) {
    let links: { url: string; text: string }[];
    try {
      links = extractLinks(await input.fetchHtml(page), page, { pdf: true });
    } catch {
      continue;
    }
    for (const link of links) {
      try {
        if (known.has(link.url) || found.has(link.url)) continue;
        if (!link.url.startsWith("https://") || !sameSite(link.url, input.website)) continue;
        const pathname = new URL(link.url).pathname;
        let path = pathname;
        try {
          path = decodeURIComponent(pathname);
        } catch {
          // keep the raw path
        }
        if (DATED_POST.test(pathname) || NEWSISH.test(fold(path))) continue;
        const score = scoreTopicLink(link, "fees");
        if (score < 0.4) continue;
        const haystack = fold(`${link.text} ${path}`);
        const studyYear = hasStudyYear(haystack);
        if (!studyYear && !FEE_TOOL.test(haystack)) continue;
        found.set(link.url, {
          url: link.url,
          score: score + (studyYear ? 0.2 : 0),
          year: startYear(fold(link.text), fold(path)),
        });
      } catch {
        // an unparseable link is not a candidate
      }
    }
  }
  // only the newest study year found on any of the pages survives; undated links stay
  const newest = Math.max(-Infinity, ...[...found.values()].map((c) => c.year ?? -Infinity));
  return [...found.values()]
    .filter((c) => c.year === null || c.year >= newest)
    .sort((a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity) || b.score - a.score)
    .slice(0, input.limit ?? 2)
    .map((c) => c.url);
}

export type TopicInput = {
  country: string;
  website: string;
  search: SearchProvider;
  budget?: QueryBudget;
  memo?: Map<string, Promise<SearchHit[]>>;
  // hits kept per topic
  perTopic?: number;
  // the topics to search, default all four
  topics?: readonly Topic[];
  // fetches an HTML page; when given, the fee pages found are followed one level deeper
  fetchHtml?: (url: string) => Promise<string>;
};

export async function discoverTopicPages(input: TopicInput): Promise<Record<Topic, string[]>> {
  const out: Record<Topic, string[]> = { fees: [], language: [], deadline: [], documents: [] };
  const words = WORDS[input.country];
  if (words === undefined) return out;
  const scope = `site:${registrable(input.website)}`;
  const memo = input.memo ?? new Map<string, Promise<SearchHit[]>>();
  const language = LANGUAGE[input.country];
  const ask = (query: string): Promise<SearchHit[]> => {
    const known = memo.get(query);
    if (known !== undefined) return known;
    input.budget?.take();
    const pending = input.search.search(query, {
      country: input.country,
      ...(language === undefined ? {} : { language }),
    });
    memo.set(query, pending);
    // a failed search is forgotten, so the institution's next programme can ask again
    pending.catch(() => memo.delete(query));
    return pending;
  };
  for (const topic of input.topics ?? TOPICS) {
    const hits = await ask(`${scope} ${words[topic]}`);
    out[topic] = hits
      .filter((h) => h.url.startsWith("https://") && sameSite(h.url, input.website))
      .filter((h) => {
        try {
          const pathname = new URL(h.url).pathname;
          return !OTHER_FILE.test(pathname) && !DATED_POST.test(pathname);
        } catch {
          return false;
        }
      })
      .map((h) => ({
        url: h.url,
        score: scoreTopicLink({ url: h.url, text: `${h.title} ${h.snippet}` }, topic),
      }))
      .filter((c) => c.score >= 0.4)
      .sort((a, b) => b.score - a.score)
      .slice(0, input.perTopic ?? 2)
      .map((c) => c.url);
    if (topic === "fees" && input.fetchHtml !== undefined && out.fees.length > 0)
      out.fees = [
        ...out.fees,
        ...(await followFeeLinks(out.fees, {
          website: input.website,
          fetchHtml: input.fetchHtml,
        })),
      ];
  }
  return out;
}

// Every page the programme already has stays; topic pages fill what is left up to `cap` in total.
export function mergeTopicPages(
  existing: readonly string[],
  topics: Record<Topic, readonly string[]>,
  cap = 10,
): string[] {
  const out = [...new Set(existing)];
  for (const topic of TOPICS) {
    for (const url of topics[topic]) {
      if (out.length >= cap) return out;
      if (!out.includes(url)) out.push(url);
    }
  }
  return out;
}
