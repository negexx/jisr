import { describe, expect, it } from "vitest";

import {
  QueryBudget,
  SearchBudgetExceeded,
  type SearchHit,
  type SearchProvider,
} from "../../../scripts/import/search";
import {
  discoverTopicPages,
  followFeeLinks,
  mergeTopicPages,
  parseTopicList,
  scoreTopicLink,
  TOPICS,
  type Topic,
} from "../../../scripts/import/topics";

const hit = (url: string, title = "", snippet = ""): SearchHit => ({ url, title, snippet });

function provider(
  answers: (query: string) => SearchHit[],
): SearchProvider & { queries: string[]; languages: (string | undefined)[] } {
  const queries: string[] = [];
  const languages: (string | undefined)[] = [];
  return {
    name: "fake",
    queries,
    languages,
    search: async (query, options) => {
      queries.push(query);
      languages.push(options?.language);
      return answers(query);
    },
  };
}

describe("scoreTopicLink", () => {
  it("scores a german fee page and a dutch fee page", () => {
    expect(
      scoreTopicLink(
        { url: "https://uni.example/studium/studiengebuehren", text: "Studiengebühren" },
        "fees",
      ),
    ).toBeGreaterThanOrEqual(0.4);
    expect(
      scoreTopicLink(
        { url: "https://uni.example/nl/collegegeld", text: "Collegegeld 2026" },
        "fees",
      ),
    ).toBeGreaterThanOrEqual(0.4);
  });

  it("scores deadline, language and documents pages and rejects an unrelated page", () => {
    expect(
      scoreTopicLink(
        { url: "https://uni.example/bewerbungsfrist", text: "Bewerbungsfrist" },
        "deadline",
      ),
    ).toBeGreaterThanOrEqual(0.4);
    expect(
      scoreTopicLink(
        { url: "https://uni.example/language", text: "Language of instruction" },
        "language",
      ),
    ).toBeGreaterThanOrEqual(0.4);
    expect(
      scoreTopicLink(
        { url: "https://uni.example/documents", text: "Required documents" },
        "documents",
      ),
    ).toBeGreaterThanOrEqual(0.4);
    expect(
      scoreTopicLink({ url: "https://uni.example/campus-life", text: "Campus life" }, "fees"),
    ).toBeLessThan(0.4);
  });

  it("scores french fees, deadline, language and documents pages and rejects an unrelated one", () => {
    const score = (path: string, text: string, topic: Topic) =>
      scoreTopicLink({ url: `https://univ.example.fr${path}`, text }, topic);
    expect(score("/droits-de-scolarite", "Droits d'inscription", "fees")).toBeGreaterThanOrEqual(
      0.4,
    );
    expect(score("/candidature", "Date limite de candidature", "deadline")).toBeGreaterThanOrEqual(
      0.4,
    );
    expect(
      score("/langue-d-enseignement", "Langue d'enseignement", "language"),
    ).toBeGreaterThanOrEqual(0.4);
    expect(score("/pieces-a-fournir", "Pièces à fournir", "documents")).toBeGreaterThanOrEqual(0.4);
    expect(score("/vie-etudiante", "Vie étudiante", "fees")).toBeLessThan(0.4);
    expect(score("/vie-etudiante", "Vie étudiante", "deadline")).toBeLessThan(0.4);
    expect(score("/vie-etudiante", "Vie étudiante", "language")).toBeLessThan(0.4);
    expect(score("/vie-etudiante", "Vie étudiante", "documents")).toBeLessThan(0.4);
  });

  it("does not take enseignement or renseignements for the language of instruction", () => {
    const score = (path: string, text: string) =>
      scoreTopicLink({ url: `https://univ.example.fr${path}`, text }, "language");
    expect(score("/formation", "Établissement d'enseignement supérieur")).toBeLessThan(0.4);
    expect(score("/contact", "Renseignements pratiques")).toBeLessThan(0.4);
    expect(score("/renseignements-pratiques", "Contact")).toBeLessThan(0.4);
    expect(score("/formation", "Enseigné en anglais")).toBeGreaterThanOrEqual(0.4);
    expect(score("/enseigne-en-anglais", "Programme")).toBeGreaterThanOrEqual(0.4);
  });

  it("scores a french deadline page named after candidater", () => {
    expect(
      scoreTopicLink({ url: "https://univ.example.fr/candidater", text: "Candidater" }, "deadline"),
    ).toBeGreaterThanOrEqual(0.4);
  });

  it("halves the score of a news path", () => {
    const plain = scoreTopicLink({ url: "https://uni.example/fees", text: "Tuition fees" }, "fees");
    const news = scoreTopicLink(
      { url: "https://uni.example/news/fees", text: "Tuition fees" },
      "fees",
    );
    expect(news).toBeLessThan(plain);
  });
});

describe("discoverTopicPages", () => {
  const website = "https://www.hs-example.de/";

  it("asks one site-scoped query per topic and keeps own-site, topic-matching hits (PDFs included)", async () => {
    const search = provider((query) => {
      if (query.includes("Studiengebühren"))
        return [
          hit("https://www.hs-example.de/studium/studiengebuehren", "Studiengebühren"),
          hit("https://other.example/studiengebuehren", "Studiengebühren"),
          hit(
            "https://www.hs-example.de/downloads/gebuehren.pdf",
            "Gebührenordnung Studiengebühren",
          ),
          hit("https://www.hs-example.de/news/2019/05/studiengebuehren", "Studiengebühren"),
          hit("https://www.hs-example.de/bild.jpg", "Studiengebühren"),
        ];
      return [];
    });
    const out = await discoverTopicPages({ country: "DE", website, search });
    expect(search.queries).toHaveLength(TOPICS.length);
    expect(search.queries.every((q) => q.startsWith("site:hs-example.de "))).toBe(true);
    expect(out.fees).toEqual([
      "https://www.hs-example.de/studium/studiengebuehren",
      "https://www.hs-example.de/downloads/gebuehren.pdf",
    ]);
    expect(out.language).toEqual([]);
  });

  it("shares answers between programmes of one institution and counts each query once", async () => {
    const search = provider(() => []);
    const memo = new Map<string, Promise<SearchHit[]>>();
    const budget = new QueryBudget(100);
    await discoverTopicPages({
      country: "NL",
      website: "https://www.hr.example.nl/",
      search,
      memo,
      budget,
    });
    await discoverTopicPages({
      country: "NL",
      website: "https://www.hr.example.nl/",
      search,
      memo,
      budget,
    });
    expect(search.queries).toHaveLength(TOPICS.length);
    expect(budget.used).toBe(TOPICS.length);
  });

  it("stops with the budget error when the query cap is reached", async () => {
    const search = provider(() => []);
    await expect(
      discoverTopicPages({ country: "DE", website, search, budget: new QueryBudget(2) }),
    ).rejects.toBeInstanceOf(SearchBudgetExceeded);
  });

  it("asks four french queries for France, in French, with the search language fr", async () => {
    const search = provider(() => []);
    await discoverTopicPages({ country: "FR", website: "https://www.univ-example.fr/", search });
    expect(search.queries).toHaveLength(4);
    expect(search.queries.every((q) => q.startsWith("site:univ-example.fr "))).toBe(true);
    expect(
      search.queries.some((q) => q.includes("droits d'inscription étudiants internationaux")),
    ).toBe(true);
    expect(search.queries.some((q) => q.includes("langue d'enseignement enseigné en"))).toBe(true);
    expect(
      search.queries.some((q) => q.includes("date limite de candidature étudiants internationaux")),
    ).toBe(true);
    expect(
      search.queries.some((q) =>
        q.includes("pièces justificatives dossier de candidature étudiants internationaux"),
      ),
    ).toBe(true);
    expect(search.languages).toEqual(["fr", "fr", "fr", "fr"]);
  });

  it("asks only the requested topics", async () => {
    const search = provider(() => []);
    await discoverTopicPages({
      country: "FR",
      website: "https://www.univ-example.fr/",
      search,
      topics: ["language"],
    });
    expect(search.queries).toHaveLength(1);
    expect(search.queries[0]?.startsWith("site:univ-example.fr ")).toBe(true);
    expect(search.queries[0]).toContain("langue d'enseignement");
  });

  it("asks nothing for a country without keywords", async () => {
    const search = provider(() => []);
    const out = await discoverTopicPages({ country: "XX", website, search });
    expect(search.queries).toEqual([]);
    expect(out).toEqual({ fees: [], language: [], deadline: [], documents: [] });
  });

  it("asks the dutch queries with the non-EEA fee, the 1 april deadline and the voertaal wording", async () => {
    const search = provider(() => []);
    await discoverTopicPages({ country: "NL", website: "https://www.hr.example.nl/", search });
    const ask = (word: string) => search.queries.find((q) => q.includes(word));
    expect(ask("instellingscollegegeld")).toContain("niet-EER");
    expect(ask("aanmelddeadline")).toContain("niet-EER");
    expect(ask("aanmelddeadline")).toContain("1 april");
    expect(ask("voertaal")).toBeDefined();
  });

  it("scores the dutch fee wording without letting a separator swallow a letter", () => {
    const score = (path: string, text: string) =>
      scoreTopicLink({ url: `https://www.hr.example.nl${path}`, text }, "fees");
    expect(score("/studeren", "Instellingscollegegeld niet-EER")).toBeGreaterThanOrEqual(0.4);
    expect(score("/tarieven-2026", "Overzicht")).toBeGreaterThanOrEqual(0.4);
    expect(score("/wettelijk-collegegeld", "Overzicht")).toBeGreaterThanOrEqual(0.4);
    expect(score("/studeren", "Salarief stand")).toBeLessThan(0.4);
    expect(score("/studeren", "Studentenleven")).toBeLessThan(0.4);
  });

  it("follows fee links one level deeper and adds them to the fee pages", async () => {
    const search = provider((query) =>
      query.includes("collegegeld")
        ? [hit("https://www.hr.example.nl/collegegeld", "Collegegeld niet-EER")]
        : [],
    );
    const fetched: string[] = [];
    const out = await discoverTopicPages({
      country: "NL",
      website: "https://www.hr.example.nl/",
      search,
      fetchHtml: async (url) => {
        fetched.push(url);
        return `<a href="/collegegeld/collegegeld-studiejaar-2026-2027">Collegegeld studiejaar 2026-2027</a>
          <a href="/collegegeld/collegegeld-studiejaar-2025-2026">Collegegeld studiejaar 2025-2026</a>
          <a href="/collegegeld/collegegeld-studiejaar-2024-2025">Collegegeld studiejaar 2024-2025</a>`;
      },
    });
    expect(fetched).toEqual(["https://www.hr.example.nl/collegegeld"]);
    // only the newest study year of the page is followed
    expect(out.fees).toEqual([
      "https://www.hr.example.nl/collegegeld",
      "https://www.hr.example.nl/collegegeld/collegegeld-studiejaar-2026-2027",
    ]);
    expect(search.queries).toHaveLength(TOPICS.length);
    expect(out.language).toEqual([]);
  });

  it("does not fetch anything without a fee page, and still ignores an unknown country", async () => {
    const fetched: string[] = [];
    const fetchHtml = async (url: string) => {
      fetched.push(url);
      return "";
    };
    const out = await discoverTopicPages({
      country: "XX",
      website,
      search: provider(() => []),
      fetchHtml,
    });
    expect(out).toEqual({ fees: [], language: [], deadline: [], documents: [] });
    await discoverTopicPages({
      country: "NL",
      website: "https://www.hr.example.nl/",
      search: provider(() => []),
      fetchHtml,
    });
    expect(fetched).toEqual([]);
  });

  it("survives a fee page that cannot be fetched", async () => {
    const out = await discoverTopicPages({
      country: "NL",
      website: "https://www.hr.example.nl/",
      search: provider(() => [hit("https://www.hr.example.nl/collegegeld", "Collegegeld")]),
      fetchHtml: async () => {
        throw new Error("boom");
      },
    });
    expect(out.fees).toEqual(["https://www.hr.example.nl/collegegeld"]);
  });
});

describe("followFeeLinks", () => {
  const site = "https://www.hr.example.nl/";
  const feePage = "https://www.hr.example.nl/collegegeld";
  const html = `
    <a href="/collegegeld/collegegeld-studiejaar-2026-2027">Collegegeld studiejaar 2026-2027</a>
    <a href="/over-ons">Over ons</a>
    <a href="https://other.example/collegegeld-2026-2027">Collegegeld 2026-2027</a>
    <a href="/nieuws/2019/05/collegegeld">Collegegeld 2019-2020</a>
    <a href="/documenten/tarieven-2026.pdf">Collegegeld tarieven 2026</a>`;

  it("keeps the own-site, non-news links about fees for a study year, a PDF included", async () => {
    const out = await followFeeLinks([feePage], { website: site, fetchHtml: async () => html });
    expect(out).toEqual([
      "https://www.hr.example.nl/collegegeld/collegegeld-studiejaar-2026-2027",
      "https://www.hr.example.nl/documenten/tarieven-2026.pdf",
    ]);
  });

  it("keeps a fee calculator link that names no year", async () => {
    const out = await followFeeLinks([feePage], {
      website: site,
      fetchHtml: async () => '<a href="/collegegeldmeter">Collegegeldmeter</a>',
    });
    expect(out).toEqual(["https://www.hr.example.nl/collegegeldmeter"]);
  });

  it("returns at most the limit", async () => {
    const out = await followFeeLinks([feePage], {
      website: site,
      fetchHtml: async () => html,
      limit: 1,
    });
    expect(out).toHaveLength(1);
  });

  it("returns an empty list when the fetch throws", async () => {
    const out = await followFeeLinks([feePage], {
      website: site,
      fetchHtml: async () => {
        throw new Error("network");
      },
    });
    expect(out).toEqual([]);
  });

  it("does not return a link that is already a fee page", async () => {
    const known = "https://www.hr.example.nl/collegegeld/collegegeld-studiejaar-2026-2027";
    const out = await followFeeLinks([feePage, known], {
      website: site,
      fetchHtml: async () => html,
    });
    expect(out).toEqual(["https://www.hr.example.nl/documenten/tarieven-2026.pdf"]);
  });

  it("fetches at most three fee pages and never a PDF", async () => {
    const fetched: string[] = [];
    await followFeeLinks(
      [
        "https://www.hr.example.nl/a.pdf",
        "https://www.hr.example.nl/a",
        "https://www.hr.example.nl/b",
        "https://www.hr.example.nl/c",
        "https://www.hr.example.nl/d",
      ],
      {
        website: site,
        fetchHtml: async (url) => {
          fetched.push(url);
          return "";
        },
      },
    );
    expect(fetched).toEqual([
      "https://www.hr.example.nl/a",
      "https://www.hr.example.nl/b",
      "https://www.hr.example.nl/c",
    ]);
  });

  it("skips a failed page and still reads the next", async () => {
    const out = await followFeeLinks(
      ["https://www.hr.example.nl/a", "https://www.hr.example.nl/b"],
      {
        website: site,
        fetchHtml: async (url) => {
          if (url.endsWith("/a")) throw new Error("down");
          return html;
        },
      },
    );
    expect(out).toHaveLength(2);
  });

  const yearLinks = `
    <a href="/collegegeld-2024-2025">Collegegeld 2024-2025</a>
    <a href="/collegegeld-2025-2026">Collegegeld 2025-2026</a>
    <a href="/collegegeld-2026-2027">Collegegeld 2026-2027</a>`;

  it("returns the newest study year first and drops the older years of the page", async () => {
    const out = await followFeeLinks([feePage], {
      website: site,
      fetchHtml: async () => yearLinks,
      limit: 3,
    });
    expect(out).toEqual(["https://www.hr.example.nl/collegegeld-2026-2027"]);
  });

  it("keeps an undated calculator link after the newest dated link", async () => {
    const out = await followFeeLinks([feePage], {
      website: site,
      fetchHtml: async () => `${yearLinks}<a href="/collegegeldmeter">Collegegeldmeter</a>`,
      limit: 3,
    });
    expect(out).toEqual([
      "https://www.hr.example.nl/collegegeld-2026-2027",
      "https://www.hr.example.nl/collegegeldmeter",
    ]);
  });

  it("still returns older years when they are all that exist, newest first", async () => {
    const out = await followFeeLinks([feePage], {
      website: site,
      fetchHtml: async () =>
        `<a href="/collegegeld-2023-2024">Collegegeld 2023-2024</a>
         <a href="/collegegeld-2024-2025">Collegegeld 2024-2025</a>`,
      limit: 3,
    });
    expect(out).toEqual(["https://www.hr.example.nl/collegegeld-2024-2025"]);
  });

  it("keeps the score order between links of the same year", async () => {
    const out = await followFeeLinks([feePage], {
      website: site,
      fetchHtml: async () =>
        `<a href="/studeren/x-2026-2027">Overzicht collegegeld 2026-2027</a>
         <a href="/collegegeld-2026-2027">Collegegeld 2026-2027</a>`,
      limit: 3,
    });
    expect(out).toEqual([
      "https://www.hr.example.nl/collegegeld-2026-2027",
      "https://www.hr.example.nl/studeren/x-2026-2027",
    ]);
  });

  it("drops undated news paths outright", async () => {
    const out = await followFeeLinks([feePage], {
      website: site,
      fetchHtml: async () =>
        `<a href="/nieuws/collegegeld-2026-2027">Collegegeld 2026-2027</a>
         <a href="/news/tarieven">Collegegeld tarieven</a>
         <a href="/blog/collegegeldmeter">Collegegeldmeter</a>`,
    });
    expect(out).toEqual([]);
  });

  it("ranks a study-year fee link above a bare calculator link", async () => {
    const out = await followFeeLinks([feePage], {
      website: site,
      fetchHtml: async () =>
        `<a href="/tarieven">Tarieven collegegeld</a>
         <a href="/collegegeld-2026-2027">Collegegeld 2026-2027</a>`,
    });
    expect(out[0]).toBe("https://www.hr.example.nl/collegegeld-2026-2027");
  });
});

describe("parseTopicList", () => {
  it("is every topic when the flag is absent", () => {
    expect(parseTopicList(undefined)).toEqual([...TOPICS]);
  });

  it("parses a comma-separated subset", () => {
    expect(parseTopicList("language")).toEqual(["language"]);
    expect(parseTopicList("fees, deadline")).toEqual(["fees", "deadline"]);
  });

  it("throws when the list names no topic", () => {
    expect(() => parseTopicList("")).toThrow("names no topic");
    expect(() => parseTopicList(",")).toThrow("names no topic");
  });

  it("throws on an unknown topic", () => {
    expect(() => parseTopicList("language,foo")).toThrow("unknown topic foo");
  });
});

describe("mergeTopicPages", () => {
  it("keeps existing pages first, adds topic pages in topic order, dedupes and caps", () => {
    const existing = ["https://a.example/1", "https://a.example/2"];
    const topics = {
      fees: ["https://a.example/2", "https://a.example/fees"],
      language: ["https://a.example/lang"],
      deadline: [],
      documents: ["https://a.example/docs"],
    };
    expect(mergeTopicPages(existing, topics)).toEqual([
      "https://a.example/1",
      "https://a.example/2",
      "https://a.example/fees",
      "https://a.example/lang",
      "https://a.example/docs",
    ]);
    expect(mergeTopicPages(existing, topics, 3)).toEqual([
      "https://a.example/1",
      "https://a.example/2",
      "https://a.example/fees",
    ]);
  });

  it("never drops an existing page, even above the cap", () => {
    const existing = ["https://a.example/1", "https://a.example/2", "https://a.example/3"];
    expect(
      mergeTopicPages(
        existing,
        { fees: ["https://a.example/f"], language: [], deadline: [], documents: [] },
        2,
      ),
    ).toEqual(existing);
  });
});
