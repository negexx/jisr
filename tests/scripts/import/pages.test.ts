import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  addTopicPagesFor,
  checkTopicFlags,
  daadRegisterUrl,
  dryRunSummary,
  memoizeFetch,
  mergePages,
  seedOfficialUrl,
  studyFinderRegisterUrl,
  syncSkippedListing,
} from "../../../scripts/import/pages";
import { SearchBudgetExceeded } from "../../../scripts/import/search";
import type { Topic } from "../../../scripts/import/topics";

describe("studyFinderRegisterUrl", () => {
  it("builds the Study Finder programme page from the id at the end of a Hungarian slug", () => {
    expect(studyFinderRegisterUrl("hu-university-of-debrecen-business-informatics-sf116")).toBe(
      "https://tempus.tpf.hu/studyfinder/index/show/116",
    );
  });

  it("gives null for a slug that does not end in sf and an id", () => {
    expect(studyFinderRegisterUrl("de-x-daad5225")).toBeNull();
    expect(studyFinderRegisterUrl("hu-x-sf")).toBeNull();
  });
});

describe("daadRegisterUrl", () => {
  it("builds the DAAD programme page from the id at the end of the slug", () => {
    expect(
      daadRegisterUrl(
        "de-hochschule-bonn-rhein-sieg-university-of-hrk294-international-business-b-daad5225",
      ),
    ).toBe(
      "https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/5225/",
    );
  });

  it("is null for a programme that does not come from DAAD", () => {
    expect(daadRegisterUrl("nl-avans-hogeschool-07gr-bouwkunde-1001o3048")).toBeNull();
    expect(daadRegisterUrl("fr-aix-marseille-universite-0134316w-licence-39236")).toBeNull();
  });
});

describe("mergePages", () => {
  it("lists the register page first, then the programme, fee and admission pages, once each", () => {
    expect(
      mergePages({
        register: "https://r.example/1",
        programme: "https://u.example/p",
        fees: ["https://u.example/fees", "https://u.example/p"],
        admission: ["https://u.example/apply"],
      }),
    ).toEqual([
      "https://r.example/1",
      "https://u.example/p",
      "https://u.example/fees",
      "https://u.example/apply",
    ]);
  });

  it("leaves out what was not found", () => {
    expect(mergePages({ register: null, programme: null, fees: [], admission: [] })).toEqual([]);
  });
});

describe("seedOfficialUrl", () => {
  it("puts a programme's own officialUrl first, ahead of the pages found for it", () => {
    expect(seedOfficialUrl("https://u.example/own", ["https://u.example/fees"])).toEqual([
      "https://u.example/own",
      "https://u.example/fees",
    ]);
  });

  it("leaves a programme with no institution website and no search a single page, not empty", () => {
    expect(seedOfficialUrl("https://u.example/own", [])).toEqual(["https://u.example/own"]);
  });

  it("does not repeat the officialUrl when it is already one of the pages", () => {
    expect(
      seedOfficialUrl("https://u.example/own", ["https://u.example/own", "https://u.example/fees"]),
    ).toEqual(["https://u.example/own", "https://u.example/fees"]);
  });

  it("leaves the pages alone when the record carries no officialUrl", () => {
    expect(seedOfficialUrl(undefined, ["https://u.example/fees"])).toEqual([
      "https://u.example/fees",
    ]);
    expect(seedOfficialUrl(null, [])).toEqual([]);
  });
});

describe("dryRunSummary", () => {
  const base = { searched: 10, institutions: 3, topicInstitutions: 3, cap: "300" };

  it("keeps the wording of a --search dry run when --topics is absent", () => {
    expect(dryRunSummary({ ...base, useSearch: true, useTopics: false })).toBe(
      "dry run: 10 programmes need a search; at most 16 queries (cap 300); no query sent, nothing written",
    );
  });

  it("adds the topic queries (four per institution) to a --search dry run", () => {
    expect(dryRunSummary({ ...base, useSearch: true, useTopics: true })).toBe(
      "dry run: 10 programmes need a search; at most 16 queries (cap 300); plus at most 12 topic queries; no query sent, nothing written",
    );
  });

  it("reports only the topic queries for a --topics dry run", () => {
    expect(dryRunSummary({ ...base, useSearch: false, useTopics: true })).toBe(
      "dry run: at most 12 topic queries (cap 300); no query sent, nothing written",
    );
  });
});

describe("dryRunSummary with a topic subset", () => {
  it("counts institutions times the chosen topics", () => {
    expect(
      dryRunSummary({
        useSearch: false,
        useTopics: true,
        searched: 0,
        institutions: 0,
        topicInstitutions: 5,
        topicCount: 1,
        cap: "300",
      }),
    ).toBe("dry run: at most 5 topic queries (cap 300); no query sent, nothing written");
  });
});

describe("checkTopicFlags", () => {
  it("rejects --topic-list without --topics", () => {
    expect(() => checkTopicFlags(["--slugs", "x", "--topic-list", "fees"])).toThrow(
      "--topic-list needs --topics",
    );
  });

  it("accepts --topic-list with --topics, and neither flag", () => {
    expect(() => checkTopicFlags(["--topics", "--topic-list", "fees"])).not.toThrow();
    expect(() => checkTopicFlags(["--slugs", "x"])).not.toThrow();
  });
});

describe("addTopicPagesFor", () => {
  const found: Record<Topic, string[]> = {
    fees: ["https://u.example/fees"],
    language: [],
    deadline: ["https://u.example/deadline"],
    documents: [],
  };

  it("adds the topic pages to the programme's existing pages", async () => {
    const programmes: Record<string, string[]> = { a: ["https://u.example/p"] };
    const outcome = await addTopicPagesFor(
      programmes,
      "a",
      async () => found,
      () => {},
    );
    expect(outcome).toBe("added");
    expect(programmes.a).toEqual([
      "https://u.example/p",
      "https://u.example/fees",
      "https://u.example/deadline",
    ]);
  });

  it("keeps the existing pages and logs the slug and message when the search fails", async () => {
    const programmes: Record<string, string[]> = { a: ["https://u.example/p"], b: ["x"] };
    const logged: string[] = [];
    const outcome = await addTopicPagesFor(
      programmes,
      "a",
      async () => {
        throw new Error("search failed: HTTP 500");
      },
      (line) => logged.push(line),
    );
    expect(outcome).toBe("failed");
    expect(programmes).toEqual({ a: ["https://u.example/p"], b: ["x"] });
    expect(logged).toEqual(["topic search failed for a: search failed: HTTP 500"]);
  });

  it("lets the budget error through so the run stops with the partial file", async () => {
    const programmes: Record<string, string[]> = { a: ["https://u.example/p"] };
    await expect(
      addTopicPagesFor(
        programmes,
        "a",
        async () => {
          throw new SearchBudgetExceeded("search budget reached: 5 of 5 queries");
        },
        () => {},
      ),
    ).rejects.toThrow(SearchBudgetExceeded);
    expect(programmes.a).toEqual(["https://u.example/p"]);
  });
});

describe("syncSkippedListing", () => {
  it("lists the skipped slugs, one per line", async () => {
    const file = path.join(await mkdtemp(path.join(tmpdir(), "pages-")), "p.json.skipped.txt");
    expect(await syncSkippedListing(file, ["a", "b"])).toBe(file);
    expect(await readFile(file, "utf8")).toBe("a\nb\n");
  });

  it("removes a stale listing from an earlier run when nothing is skipped now", async () => {
    const file = path.join(await mkdtemp(path.join(tmpdir(), "pages-")), "p.json.skipped.txt");
    await writeFile(file, "old-slug\n");
    expect(await syncSkippedListing(file, [])).toBeNull();
    expect(existsSync(file)).toBe(false);
  });

  it("is fine with no listing to remove", async () => {
    const file = path.join(await mkdtemp(path.join(tmpdir(), "pages-")), "none.skipped.txt");
    expect(await syncSkippedListing(file, [])).toBeNull();
  });
});

describe("memoizeFetch", () => {
  it("fetches a url once for concurrent and later callers", async () => {
    const calls: string[] = [];
    const fetch = memoizeFetch(async (url) => {
      calls.push(url);
      return `<html>${url}</html>`;
    });
    const [a, b] = await Promise.all([fetch("https://a.example/x"), fetch("https://a.example/x")]);
    expect(a).toBe(b);
    await fetch("https://a.example/x");
    await fetch("https://a.example/y");
    expect(calls).toEqual(["https://a.example/x", "https://a.example/y"]);
  });

  it("forgets a failed fetch so the next caller can retry", async () => {
    let attempts = 0;
    const fetch = memoizeFetch(async () => {
      attempts++;
      if (attempts === 1) throw new Error("down");
      return "ok";
    });
    await expect(fetch("https://a.example/x")).rejects.toThrow("down");
    await expect(fetch("https://a.example/x")).resolves.toBe("ok");
  });
});
