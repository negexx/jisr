import { describe, expect, it } from "vitest";
import type { MatchFilters } from "@/data-schema/match-filters";
import { filterPrograms, preferenceMismatches } from "@/domain/filter";
import { MATCH_FILTERS_VERSION } from "@/lib/constants";
import {
  daysAgo,
  deepFreeze,
  estimateMeta,
  fact,
  meta,
  NOW,
  program,
  staleMeta,
} from "../fixtures/domain/builders";

function filters(o: Partial<MatchFilters> = {}): MatchFilters {
  return {
    schemaVersion: MATCH_FILTERS_VERSION,
    fields: [],
    studyLanguages: [],
    destinations: [],
    institutionType: "any",
    budget: null,
    ...o,
  };
}

describe("preferenceMismatches", () => {
  it.each([
    ["empty filters keep every program", {}, {}, []],
    ["destinations empty means all", { destinations: [] }, { country: "XC" }, []],
    ["destination listed", { destinations: ["XB"] }, {}, []],
    ["destination not listed", { destinations: ["XC"] }, {}, ["destination"]],
    ["field not wanted", { fields: ["xx-test-field-other"] }, {}, ["field"]],
    ["one of several fields", { fields: ["xx-test-field-other", "xx-test-field"] }, {}, []],
    ["institution any", { institutionType: "any" }, { institutionType: "private" }, []],
    ["institution public wanted, public", { institutionType: "public" }, {}, []],
    [
      "institution type unknown never counts against the preference",
      { institutionType: "private" },
      { institutionType: null },
      [],
    ],
    [
      "institution private wanted, public",
      { institutionType: "private" },
      {},
      ["institution_type"],
    ],
    ["language empty means any", { studyLanguages: [] }, { teachingLanguages: fact(["de"]) }, []],
    ["language overlap", { studyLanguages: ["fr", "en"] }, { teachingLanguages: fact(["en"]) }, []],
    [
      "language no overlap, decisive",
      { studyLanguages: ["fr"] },
      { teachingLanguages: fact(["de"]) },
      ["study_language"],
    ],
    [
      "language unpublished never hides",
      { studyLanguages: ["fr"] },
      { teachingLanguages: fact(null) },
      [],
    ],
    [
      "language stale never hides",
      { studyLanguages: ["fr"] },
      { teachingLanguages: fact(["de"], staleMeta()) },
      [],
    ],
    [
      "language aging (not stale) still hides a definite mismatch",
      { studyLanguages: ["fr"] },
      { teachingLanguages: fact(["de"], meta({ last_verified_at: daysAgo(300) })) },
      ["study_language"],
    ],
    [
      "language non-official never hides",
      { studyLanguages: ["fr"] },
      { teachingLanguages: fact(["de"], estimateMeta()) },
      [],
    ],
    [
      "language published empty never hides (audit T1a-F2)",
      { studyLanguages: ["fr"] },
      { teachingLanguages: fact<string[]>([]) },
      [],
    ],
    [
      "several mismatches in fixed order",
      {
        destinations: ["XC"],
        fields: ["xx-test-field-other"],
        institutionType: "private",
        studyLanguages: ["fr"],
      },
      { teachingLanguages: fact(["de"]) },
      ["destination", "field", "institution_type", "study_language"],
    ],
  ] as const)("%s", (_n, f, prog, expected) =>
    expect(
      preferenceMismatches(filters({ ...f } as never), program({ ...prog } as never), NOW),
    ).toEqual([...expected]));

  it("ignores budget entirely: a budget is an annotation, never a filter", () => {
    const withBudget = filters({ budget: { amountMinor: 1, currency: "XTS", period: "month" } });
    expect(preferenceMismatches(withBudget, program(), NOW)).toEqual([]);
    expect(filterPrograms(withBudget, [program()], NOW).kept).toEqual([program()]);
  });
});

describe("filter composition", () => {
  it("ANDs every filter: a program must pass all of them", () => {
    const p = program({ country: "XB", field: "xx-test-field" });
    expect(
      preferenceMismatches(filters({ destinations: ["XB"], fields: ["xx-test-field"] }), p, NOW),
    ).toEqual([]);
    expect(
      preferenceMismatches(
        filters({ destinations: ["XB"], fields: ["xx-test-field-other"] }),
        p,
        NOW,
      ),
    ).toEqual(["field"]);
    expect(
      preferenceMismatches(filters({ destinations: ["XC"], fields: ["xx-test-field"] }), p, NOW),
    ).toEqual(["destination"]);
  });

  it("ORs inside one multi-select: any listed value matches", () => {
    const p = program({ country: "XB", field: "xx-test-field" });
    expect(preferenceMismatches(filters({ destinations: ["XC", "XB"] }), p, NOW)).toEqual([]);
    expect(
      preferenceMismatches(filters({ fields: ["xx-test-field-other", "xx-test-field"] }), p, NOW),
    ).toEqual([]);
  });
});

describe("filterPrograms", () => {
  const keep = program({ slug: "xx-test-keep" });
  const dropA = program({ slug: "xx-test-drop-a", country: "XC" });
  const dropB = program({
    slug: "xx-test-drop-b",
    field: "xx-test-field-other",
    institutionType: "private",
  });
  const f = filters({ destinations: ["XB"], fields: ["xx-test-field"], institutionType: "public" });

  it("splits kept and excluded, preserving input order and reporting mismatches", () => {
    const r = filterPrograms(f, [dropA, keep, dropB], NOW);
    expect(r.kept.map((x) => x.slug)).toEqual(["xx-test-keep"]);
    expect(r.excluded).toEqual([
      { programSlug: "xx-test-drop-a", mismatches: ["destination"] },
      { programSlug: "xx-test-drop-b", mismatches: ["field", "institution_type"] },
    ]);
  });

  it("keeps every program when the filters are empty", () => {
    const programs = [
      program({ slug: "xx-test-a" }),
      program({
        slug: "xx-test-b",
        country: "XC",
        field: "xx-test-field-other",
        institutionType: "private",
      }),
    ];
    expect(filterPrograms(filters(), programs, NOW)).toEqual({ kept: programs, excluded: [] });
  });

  it("returns everything kept when nothing mismatches, and handles an empty list", () => {
    expect(filterPrograms(filters(), [keep], NOW)).toEqual({ kept: [keep], excluded: [] });
    expect(filterPrograms(filters(), [], NOW)).toEqual({ kept: [], excluded: [] });
  });

  it("does not mutate filters or programs", () => {
    expect(() => filterPrograms(deepFreeze(f), deepFreeze([keep, dropA]), NOW)).not.toThrow();
  });
});
