import { describe, expect, it } from "vitest";
import { filterPrograms, preferenceMismatches } from "@/domain/filter";
import {
  daysAgo,
  deepFreeze,
  estimateMeta,
  fact,
  meta,
  NOW,
  profile,
  program,
  staleMeta,
} from "../fixtures/domain/builders";

describe("preferenceMismatches", () => {
  it.each([
    ["all defaults match", {}, {}, []],
    ["destinations empty means all", { destinations: [] }, { country: "XC" }, []],
    ["destination listed", { destinations: ["XB"] }, {}, []],
    ["destination not listed", { destinations: ["XC"] }, {}, ["destination"]],
    ["field not wanted", { fields: ["xx-test-field-other"] }, {}, ["field"]],
    ["one of several fields", { fields: ["xx-test-field-other", "xx-test-field"] }, {}, []],
    ["institution any", { institutionType: "any" }, { institutionType: "private" }, []],
    ["institution public wanted, public", { institutionType: "public" }, {}, []],
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
  ] as const)("%s", (_n, p, prog, expected) =>
    expect(
      preferenceMismatches(profile({ ...p } as never), program({ ...prog } as never), NOW),
    ).toEqual([...expected]));

  it("ignores budget entirely", () => {
    const p = profile({ budget: { amountMinor: 1, currency: "XTS", period: "month" } });
    expect(preferenceMismatches(p, program(), NOW)).toEqual([]);
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
  const p = profile({ destinations: ["XB"], institutionType: "public" });

  it("splits kept and excluded, preserving input order and reporting mismatches", () => {
    const r = filterPrograms(p, [dropA, keep, dropB], NOW);
    expect(r.kept.map((x) => x.slug)).toEqual(["xx-test-keep"]);
    expect(r.excluded).toEqual([
      { programSlug: "xx-test-drop-a", mismatches: ["destination"] },
      { programSlug: "xx-test-drop-b", mismatches: ["field", "institution_type"] },
    ]);
  });
  it("returns everything kept when nothing mismatches, and handles an empty list", () => {
    expect(filterPrograms(profile(), [keep], NOW)).toEqual({ kept: [keep], excluded: [] });
    expect(filterPrograms(profile(), [], NOW)).toEqual({ kept: [], excluded: [] });
  });
  it("does not mutate inputs", () => {
    expect(() => filterPrograms(deepFreeze(p), deepFreeze([keep, dropA]), NOW)).not.toThrow();
  });
});
