import { describe, expect, it } from "vitest";

import { daadRegisterUrl, dryRunSummary, mergePages } from "../../../scripts/import/pages";

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
