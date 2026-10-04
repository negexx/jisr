import { decodeEntities, htmlToText, normalizeForMatch, programmeNameMatches } from "./evidence";
import { fetchText } from "./http";
import type { QueryBudget, SearchHit, SearchProvider } from "./search";

// Finds a programme's own page, its fee page and its admission page by crawling from the institution's
// website: no search API and no model, only links scored against the programme name and a few
// multilingual keywords. It returns candidates; the reader still has to quote them and the verifier
// still has to find the quote, so a wrong guess costs a page, not a wrong fact.
export type Link = { url: string; text: string };
export type PageKind = "programme" | "fees" | "admission";

export const OTHER_FILE = /\.(jpe?g|png|gif|svg|webp|zip|docx?|xlsx?|pptx?|mp[34]|ics)(\?|$)/i;
const FILE = /\.(pdf|jpe?g|png|gif|svg|webp|zip|docx?|xlsx?|pptx?|mp[34]|ics)(\?|$)/i;

// `pdf: true` keeps links to PDFs (fee schedules); every other file type stays out.
export function extractLinks(html: string, base: string, options: { pdf?: boolean } = {}): Link[] {
  const links = new Map<string, Link>();
  for (const match of html.matchAll(
    /<a\b[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const href = decodeEntities(match[1] ?? match[2] ?? "").trim();
    if (href === "" || /^(mailto|tel|javascript|data):/i.test(href)) continue;
    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      continue;
    }
    if (url.protocol !== "https:") continue;
    url.hash = "";
    const clean = url.toString();
    const file = options.pdf === true ? OTHER_FILE : FILE;
    if (file.test(url.pathname) || links.has(clean)) continue;
    links.set(clean, { url: clean, text: htmlToText(match[3] ?? "") });
  }
  return [...links.values()];
}

const TWO_LABEL_SLD = new Set(["co", "ac", "com", "org", "gov", "gouv", "edu", "net"]);

export function registrable(url: string): string {
  const labels = new URL(url).hostname.split(".");
  const take =
    labels.length >= 3 &&
    (labels.at(-1)?.length ?? 0) === 2 &&
    TWO_LABEL_SLD.has(labels.at(-2) ?? "")
      ? 3
      : 2;
  return labels.slice(-take).join(".");
}

// False for a url that cannot be parsed: a malformed link in a result is not on anyone's site.
export const sameSite = (a: string, b: string): boolean => {
  try {
    return registrable(a) === registrable(b);
  } catch {
    return false;
  }
};

const fold = (text: string): string => normalizeForMatch(text).normalize("NFD").replace(/[̀-ͯ]/g, "");

const STOP = new Set(
  "bachelor licence but of in and the de des du la le et en van voor met pour for with und der die das fur".split(
    " ",
  ),
);

const nameTokens = (name: string): string[] => [
  ...new Set(
    fold(name)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  ),
];

const KEYWORDS: Record<Exclude<PageKind, "programme">, RegExp> = {
  fees: /tuition|\bfees?\b|\bcosts?\b|frais|droits? d.inscription|gebuhr|studienbeitr|semesterbeitr|collegegeld|kosten|financ|finanz/,
  admission:
    /admission|\bapply|application|requirements|bewerb|zulassung|candidatur|inscription|aanmeld|toelating|deadline|entry/,
};
const HUB =
  /study|studies|programmes?|programs?|bachelor|undergraduate|degree|courses|studium|studieng|opleiding|formation|offre|licence/;
const NEWSISH = /\/(news|blog|events?|actualit|presse|press|agenda|nieuws|aktuell|veranstaltung)/;
const PROGRAMME_WORDS =
  /bachelor|licence|programme|program|studium|studieng|opleiding|formation|degree|study/;

export function scoreLink(link: Link, kind: PageKind, programmeName: string): number {
  let path: string;
  try {
    path = decodeURIComponent(new URL(link.url).pathname);
  } catch {
    path = new URL(link.url).pathname;
  }
  const text = fold(link.text);
  const where = fold(path);
  const penalty = NEWSISH.test(where) ? 0.5 : 1;
  if (kind === "programme") {
    const tokens = nameTokens(programmeName);
    if (tokens.length === 0) return 0;
    const hay = `${text} ${where}`;
    const ratio = tokens.filter((t) => hay.includes(t)).length / tokens.length;
    return ratio === 0 ? 0 : (ratio + (PROGRAMME_WORDS.test(where) ? 0.1 : 0)) * penalty;
  }
  const pattern = KEYWORDS[kind];
  return ((pattern.test(text) ? 0.6 : 0) + (pattern.test(where) ? 0.4 : 0)) * penalty;
}

export type Discovered = {
  programme: string | null;
  fees: string[];
  admission: string[];
  fetched: number;
};

export type DiscoverInput = {
  website: string;
  name: string;
  fetchHtml?: (url: string) => Promise<string>;
  // an upper bound on page requests for this programme
  maxFetches?: number;
};

export async function discover(input: DiscoverInput): Promise<Discovered> {
  const fetchHtml =
    input.fetchHtml ??
    ((url: string) => fetchText(url, { accept: "text/html,application/xhtml+xml" }));
  const cap = input.maxFetches ?? 20;
  let requests = 0;
  let fetched = 0;
  const pages = new Map<string, string | null>();
  const get = async (url: string): Promise<string | null> => {
    if (pages.has(url)) return pages.get(url) ?? null;
    if (requests >= cap) return null;
    requests++;
    try {
      const html = await fetchHtml(url);
      pages.set(url, html);
      fetched++;
      return html;
    } catch {
      pages.set(url, null);
      return null;
    }
  };
  const empty: Discovered = { programme: null, fees: [], admission: [], fetched: 0 };

  const home = await get(input.website);
  if (home === null) return empty;
  const site = (links: Link[]) => links.filter((l) => sameSite(l.url, input.website));
  const pool = new Map<string, Link>();
  const add = (links: Link[]) => {
    for (const l of site(links)) if (!pool.has(l.url)) pool.set(l.url, l);
  };
  add(extractLinks(home, input.website));

  // the programme page: try the best-scoring links; if none is it, open the study hubs and try again
  let best: { url: string; ratio: number; score: number } | null = null;
  const tried = new Set<string>([input.website]);
  const tryProgrammePages = async () => {
    const candidates = [...pool.values()]
      .filter((l) => !tried.has(l.url))
      .map((l) => ({ l, score: scoreLink(l, "programme", input.name) }))
      .filter((c) => c.score >= 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    for (const { l, score } of candidates) {
      tried.add(l.url);
      const html = await get(l.url);
      if (html === null) continue;
      add(extractLinks(html, l.url));
      const text = htmlToText(html);
      if (!programmeNameMatches(input.name, text)) continue;
      const tokens = nameTokens(input.name);
      const ratio =
        tokens.length === 0
          ? 0
          : tokens.filter((t) => fold(text).includes(t)).length / tokens.length;
      if (best === null || ratio > best.ratio || (ratio === best.ratio && score > best.score))
        best = { url: l.url, ratio, score };
    }
  };
  await tryProgrammePages();
  if (best === null) {
    const hubs = [...pool.values()]
      .filter((l) => !tried.has(l.url) && HUB.test(fold(`${l.text} ${new URL(l.url).pathname}`)))
      .slice(0, 3);
    for (const hub of hubs) {
      tried.add(hub.url);
      const html = await get(hub.url);
      if (html !== null) add(extractLinks(html, hub.url));
    }
    await tryProgrammePages();
  }
  const programme = (best as { url: string } | null)?.url ?? null;

  // fee and admission pages: the best-scoring links seen so far (the programme page's own links included)
  const pick = async (kind: "fees" | "admission"): Promise<string[]> => {
    const ranked = [...pool.values()]
      .map((l) => ({ l, score: scoreLink(l, kind, input.name) }))
      .filter((c) => c.score >= 0.6)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    const out: string[] = [];
    for (const { l } of ranked) {
      if (out.length === 2) break;
      if ((await get(l.url)) !== null) out.push(l.url);
    }
    return out;
  };
  const fees = await pick("fees");
  const admission = await pick("admission");
  return { programme, fees, admission, fetched };
}

// Register-first discovery. A register page (the DAAD programme page, for instance) already links the
// programme's own page ("Course website") and the institution's fee and application pages, so no
// crawling is needed: much more reliable than guessing from the homepage.
const COURSE_SITE =
  /course website|programme website|program website|study programme website|site web de la formation|website of the (study )?programme/i;

export type RegisterInput = {
  registerUrl: string;
  name: string;
  fetchHtml?: (url: string) => Promise<string>;
  maxFetches?: number;
};

export async function discoverFromRegister(input: RegisterInput): Promise<Discovered> {
  const fetchHtml =
    input.fetchHtml ??
    ((url: string) => fetchText(url, { accept: "text/html,application/xhtml+xml" }));
  const cap = input.maxFetches ?? 8;
  let requests = 0;
  let fetched = 0;
  const get = async (url: string): Promise<string | null> => {
    if (requests >= cap) return null;
    requests++;
    try {
      const html = await fetchHtml(url);
      fetched++;
      return html;
    } catch {
      return null;
    }
  };
  const page = await get(input.registerUrl);
  if (page === null) return { programme: null, fees: [], admission: [], fetched: 0 };
  const external = extractLinks(page, input.registerUrl).filter(
    (l) => !sameSite(l.url, input.registerUrl),
  );
  const programme = external.find((l) => COURSE_SITE.test(l.text))?.url ?? null;
  // the institution's own links: same site as the programme page, else the most common site among the rest
  const anchor = programme ?? external[0]?.url ?? null;
  const pool = new Map<string, Link>();
  for (const l of external) if (anchor !== null && sameSite(l.url, anchor)) pool.set(l.url, l);
  if (programme !== null) {
    const html = await get(programme);
    if (html !== null)
      for (const l of extractLinks(html, programme))
        if (sameSite(l.url, programme)) pool.set(l.url, l);
  }
  const pick = async (kind: "fees" | "admission"): Promise<string[]> => {
    const ranked = [...pool.values()]
      .filter((l) => l.url !== programme)
      .map((l) => ({ l, score: scoreLink(l, kind, input.name) }))
      .filter((c) => c.score >= 0.4)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
    return ranked.map((c) => c.l.url);
  };
  return { programme, fees: await pick("fees"), admission: await pick("admission"), fetched };
}

// --- discovery by web search -------------------------------------------------------------------
// For programmes with no register page (the Netherlands, most of France): a search restricted to the
// institution's own site finds the programme page; the institution's fee and admission pages are
// found by two institution-level searches, shared by all its programmes through `memo`.
const WORDS: Record<string, { fees: string; admission: string; language: string }> = {
  FR: {
    fees: "droits d'inscription étudiants internationaux tuition fees",
    admission: "candidature étudiants internationaux conditions d'admission admission requirements",
    language: "fr",
  },
  DE: {
    fees: "Studiengebühren internationale Studierende tuition fees",
    admission: "Bewerbung internationale Studierende application requirements admission",
    language: "de",
  },
  NL: {
    fees: "collegegeld niet-EU studenten tuition fees",
    admission: "toelating aanmelden internationale studenten admission requirements",
    language: "nl",
  },
};

export type SearchDiscoverInput = {
  name: string;
  institution: string;
  country: string;
  website: string | null;
  search: SearchProvider;
  budget?: QueryBudget;
  // answers shared between the programmes of one institution (promises, so two programmes asking at
  // the same moment share one query)
  memo?: Map<string, Promise<SearchHit[]>>;
  fetchHtml?: (url: string) => Promise<string>;
};

export async function discoverBySearch(input: SearchDiscoverInput): Promise<Discovered> {
  // Without the institution's own site there is no way to tell its pages from an aggregator's, and
  // a fact read from an aggregator would be labelled official: ask nothing, find nothing.
  if (input.website === null) return { programme: null, fees: [], admission: [], fetched: 0 };
  const fetchHtml =
    input.fetchHtml ??
    ((url: string) => fetchText(url, { accept: "text/html,application/xhtml+xml" }));
  const words = WORDS[input.country] ?? {
    fees: "tuition fees",
    admission: "admission",
    language: "en",
  };
  const site = input.website === null ? null : registrable(input.website);
  const scope = site === null ? input.institution : `site:${site}`;
  const memo = input.memo ?? new Map<string, Promise<SearchHit[]>>();
  const ask = (query: string): Promise<SearchHit[]> => {
    const known = memo.get(query);
    if (known !== undefined) return known;
    input.budget?.take();
    const pending = input.search.search(query, {
      country: input.country,
      language: words.language,
    });
    memo.set(query, pending);
    // a failed search is forgotten, so the institution's next programme can ask again
    pending.catch(() => memo.delete(query));
    return pending;
  };
  // hits on the institution's own site, as links to score
  const links = (hits: SearchHit[]): Link[] =>
    hits
      .filter((h) => h.url.startsWith("https://"))
      .filter((h) => input.website === null || sameSite(h.url, input.website))
      // not a page to read: a file, or a dated news post (/2018/03/…) that is out of date by nature
      .filter((h) => {
        let pathname: string;
        try {
          pathname = new URL(h.url).pathname;
        } catch {
          return false;
        }
        return !FILE.test(pathname) && !/\/(19|20)\d{2}\/(0[1-9]|1[0-2])(\/|$)/.test(pathname);
      })
      .map((h) => ({ url: h.url, text: `${h.title} ${h.snippet}` }));

  let fetched = 0;
  const programmeQuery =
    `${scope} "${input.name}" bachelor ${site === null ? "" : input.institution}`.trim();
  const candidates = links(await ask(programmeQuery))
    .map((l) => ({ l, score: scoreLink(l, "programme", input.name) }))
    .filter((c) => c.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  let best: { url: string; ratio: number } | null = null;
  const tokens = nameTokens(input.name);
  for (const { l } of candidates) {
    let html: string;
    try {
      html = await fetchHtml(l.url);
      fetched++;
    } catch {
      continue;
    }
    const text = htmlToText(html);
    if (!programmeNameMatches(input.name, text)) continue;
    const ratio =
      tokens.length === 0 ? 0 : tokens.filter((t) => fold(text).includes(t)).length / tokens.length;
    if (best === null || ratio > best.ratio) best = { url: l.url, ratio };
  }

  const pick = async (kind: "fees" | "admission"): Promise<string[]> => {
    const hits = links(await ask(`${scope} ${words[kind]}`));
    return hits
      .map((l) => ({ l, score: scoreLink(l, kind, input.name) }))
      .filter((c) => c.score >= 0.4)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
      .map((c) => c.l.url);
  };
  const found = best as { url: string } | null;
  return {
    programme: found?.url ?? null,
    fees: await pick("fees"),
    admission: await pick("admission"),
    fetched,
  };
}
