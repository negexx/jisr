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
  scoreTopicLink,
  TOPICS,
} from "../../../scripts/import/topics";

const hit = (url: string, title = "", snippet = ""): SearchHit => ({ url, title, snippet });

function provider(answers: (query: string) => SearchHit[]): SearchProvider & { queries: string[] } {
  const queries: string[] = [];
  return {
    name: "fake",
    queries,
    search: async (query) => {
      queries.push(query);
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

  it("asks nothing for a country without keywords", async () => {
    const search = provider(() => []);
    const out = await discoverTopicPages({ country: "FR", website, search });
    expect(search.queries).toEqual([]);
    expect(out).toEqual({ fees: [], language: [], deadline: [], documents: [] });
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
