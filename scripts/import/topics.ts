import { registrable, sameSite } from "./discover";
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
  NL: {
    fees: "collegegeld niet-EER studenten tuition fees non-EEA",
    language: "voertaal taal van het onderwijs language of instruction",
    deadline: "aanmelddeadline aanmelden deadline application",
    documents: "benodigde documenten toelating international students required documents",
  },
};

const LANGUAGE: Record<string, string> = { DE: "de", NL: "nl" };

const PATTERN: Record<Topic, RegExp> = {
  fees: /tuition|\bfees?\b|\bcosts?\b|gebu(?:e)?hr|studienbeitr|semesterbeitr|collegegeld|kosten/,
  language:
    /language of instruction|teaching language|instruction|unterrichtssprache|studiensprache|\bsprache|voertaal|\btaal\b|language/,
  deadline: /deadline|frist|termine?\b|aanmeld|application period|dates/,
  documents: /documents?|unterlagen|nachweis|documenten|required|checklist|erforderlich|benodigde/,
};

const NEWSISH = /\/(news|blog|events?|actualit|presse|press|agenda|nieuws|aktuell|veranstaltung)/;
// PDFs are wanted here (fee schedules); every other file type is not a page to read
const OTHER_FILE = /\.(jpe?g|png|gif|svg|webp|zip|docx?|xlsx?|pptx?|mp[34]|ics)(\?|$)/i;
const DATED_POST = /\/(19|20)\d{2}\/(0[1-9]|1[0-2])(\/|$)/;

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

export type TopicInput = {
  country: string;
  website: string;
  search: SearchProvider;
  budget?: QueryBudget;
  memo?: Map<string, Promise<SearchHit[]>>;
  // hits kept per topic
  perTopic?: number;
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
  for (const topic of TOPICS) {
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
