import { describe, expect, it } from "vitest";

import {
  QueryBudget,
  SearchBudgetExceeded,
  type SearchHit,
  type SearchProvider,
} from "../../../scripts/import/search";
import {
  discoverTopicPages,
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
});

describe("parseTopicList", () => {
  it("is every topic when the flag is absent", () => {
    expect(parseTopicList(undefined)).toEqual([...TOPICS]);
  });

  it("parses a comma-separated subset", () => {
    expect(parseTopicList("language")).toEqual(["language"]);
    expect(parseTopicList("fees, deadline")).toEqual(["fees", "deadline"]);
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
