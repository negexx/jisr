import { describe, expect, it } from "vitest";
import { scholarshipsForProgram } from "@/domain/scholarships";
import { profile, program, scholarship } from "../fixtures/domain/builders";

const S = (slug: string, o: Parameters<typeof scholarship>[0] = {}) => scholarship({ slug, ...o });

describe("scholarshipsForProgram", () => {
  it.each([
    [
      "matches destination, any field, any nationality",
      [S("xx-test-sch-a")],
      [],
      ["xx-test-sch-a"],
    ],
    ["other destination excluded", [S("xx-test-sch-a", { destinations: ["XC"] })], [], []],
    [
      "field filter match",
      [S("xx-test-sch-a", { fields: ["xx-test-field"] })],
      [],
      ["xx-test-sch-a"],
    ],
    ["field filter miss", [S("xx-test-sch-a", { fields: ["xx-test-field-other"] })], [], []],
    [
      "nationality filter match",
      [S("xx-test-sch-a", { eligibleNationalities: ["XA"] })],
      [],
      ["xx-test-sch-a"],
    ],
    ["nationality filter miss", [S("xx-test-sch-a", { eligibleNationalities: ["XC"] })], [], []],
    [
      "linked despite destination and field mismatch",
      [S("xx-test-sch-a", { destinations: ["XC"], fields: ["xx-test-field-other"] })],
      ["xx-test-sch-a"],
      ["xx-test-sch-a"],
    ],
    [
      "linked but nationality excluded",
      [S("xx-test-sch-a", { eligibleNationalities: ["XC"] })],
      ["xx-test-sch-a"],
      [],
    ],
    [
      "linked and matched de-duplicated",
      [S("xx-test-sch-a")],
      ["xx-test-sch-a"],
      ["xx-test-sch-a"],
    ],
    [
      "sorted by slug",
      [S("xx-test-sch-c"), S("xx-test-sch-a"), S("xx-test-sch-b")],
      [],
      ["xx-test-sch-a", "xx-test-sch-b", "xx-test-sch-c"],
    ],
    [
      "past deadline kept",
      [S("xx-test-sch-a", { deadline: { ...scholarship().deadline, value: "2020-01-01" } })],
      [],
      ["xx-test-sch-a"],
    ],
    ["linked slug absent from input dropped", [], ["xx-test-sch-z"], []],
  ] as const)("%s", (_n, list, linked, expected) =>
    expect(
      scholarshipsForProgram(profile(), program({ scholarships: [...linked] }), [...list]).map(
        (s) => s.slug,
      ),
    ).toEqual([...expected]));

  it("sorts by code unit, not locale", () => {
    const list = [S("xx-test-sch-b"), S("xx-test-sch-B")];
    expect(scholarshipsForProgram(profile(), program(), list).map((s) => s.slug)).toEqual([
      "xx-test-sch-B",
      "xx-test-sch-b",
    ]);
  });
});
