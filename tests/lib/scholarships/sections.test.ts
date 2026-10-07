import { describe, expect, it } from "vitest";

import type { Institution } from "@/data-schema/resolved";
import { buildSections, type DestinationInput } from "@/lib/scholarships/sections";

import { meta, program, scholarship } from "../../fixtures/domain/builders";

const inst = (slug: string, name: string, country = "XB", city = "XX City"): Institution => ({
  slug,
  name,
  country,
  city: { slug: "xx-test-city", name: city },
  type: "public",
  website: null,
  fact: meta(),
});

const progIn = (
  slug: string,
  institution: string,
  over: Partial<ReturnType<typeof program>> = {},
) => program({ slug, institution, name: `Programme ${slug}`, ...over });

function input(over: Partial<DestinationInput> = {}): DestinationInput {
  return { country: "XB", scholarships: [], programs: [], institutions: [], ...over };
}

describe("buildSections", () => {
  it("returns no section when there is no scholarship", () => {
    expect(buildSections([input()])).toEqual([]);
    expect(buildSections([])).toEqual([]);
  });

  it("counts programmes for a whole-country scholarship instead of listing them", () => {
    const s = scholarship({ slug: "xx-test-sch-all" });
    const sections = buildSections([
      input({
        scholarships: [s],
        programs: [progIn("p1", "i1"), progIn("p2", "i2"), progIn("p3", "i2", { country: "XC" })],
      }),
    ]);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.entries[0]?.scope).toEqual({ kind: "country", count: 2 });
  });

  it("groups programmes by institution for an institution-restricted scholarship", () => {
    const s = scholarship({ slug: "xx-test-sch-r", institutions: ["i2", "i1", "i3"] });
    const [section] = buildSections([
      input({
        scholarships: [s],
        institutions: [
          inst("i1", "Bravo University"),
          inst("i2", "Alpha University"),
          inst("i3", "Charlie College"),
        ],
        programs: [
          progIn("p-b", "i2", { name: "B programme" }),
          progIn("p-a", "i2", { name: "A programme" }),
          progIn("p-1", "i1"),
          progIn("p-x", "i9"),
        ],
      }),
    ]);
    const scope = section?.entries[0]?.scope;
    expect(scope?.kind).toBe("institutions");
    if (scope?.kind !== "institutions") return;
    expect(scope.groups.map((g) => [g.slug, g.name])).toEqual([
      ["i2", "Alpha University"],
      ["i1", "Bravo University"],
    ]);
    expect(scope.groups[0]?.programs.map((p) => p.slug)).toEqual(["p-a", "p-b"]);
    // i3 is named but has no programme; i9's programme does not apply
    expect(scope.without).toEqual(["Charlie College"]);
  });

  it("omits a named institution that is not in the institutions shard from `without`", () => {
    const s = scholarship({ slug: "xx-test-sch-r", institutions: ["i-unknown"] });
    const [section] = buildSections([input({ scholarships: [s], programs: [progIn("p1", "i1")] })]);
    expect(section?.entries[0]?.scope).toEqual({ kind: "institutions", groups: [], without: [] });
  });

  it("keeps an explicitly linked programme of another institution in the groups", () => {
    const s = scholarship({ slug: "xx-test-sch-r", institutions: ["i1"] });
    const [section] = buildSections([
      input({
        scholarships: [s],
        institutions: [inst("i1", "One"), inst("i2", "Two")],
        programs: [progIn("p2", "i2", { scholarships: ["xx-test-sch-r"] })],
      }),
    ]);
    const scope = section?.entries[0]?.scope;
    expect(scope?.kind === "institutions" && scope.groups.map((g) => g.slug)).toEqual(["i2"]);
    // i1 is named but its own programme list is empty: it is reported, i2 is only a group
    expect(scope?.kind === "institutions" && scope.without).toEqual(["One"]);
  });

  it("names a group by null when its institution is unknown", () => {
    const s = scholarship({ slug: "xx-test-sch-r", institutions: ["i1"] });
    const [section] = buildSections([input({ scholarships: [s], programs: [progIn("p1", "i1")] })]);
    const scope = section?.entries[0]?.scope;
    expect(scope?.kind === "institutions" && scope.groups[0]?.name).toBeNull();
    expect(scope?.kind === "institutions" && scope.groups[0]?.city).toBeNull();
  });

  it("carries the institution's city name into each group", () => {
    const s = scholarship({ slug: "xx-test-sch-r", institutions: ["i1"] });
    const [section] = buildSections([
      input({
        scholarships: [s],
        institutions: [inst("i1", "Alpha University", "XB", "Alphaville")],
        programs: [progIn("p1", "i1")],
      }),
    ]);
    const scope = section?.entries[0]?.scope;
    expect(scope?.kind === "institutions" && scope.groups[0]?.city).toBe("Alphaville");
  });

  it("keeps campuses that share one institution name as distinct groups with distinct cities", () => {
    const s = scholarship({ slug: "xx-test-sch-r", institutions: ["i-rim", "i-bol"] });
    const [section] = buildSections([
      input({
        scholarships: [s],
        institutions: [
          inst("i-rim", "Same University", "XB", "Rimini"),
          inst("i-bol", "Same University", "XB", "Bologna"),
        ],
        programs: [progIn("p-rim", "i-rim"), progIn("p-bol", "i-bol")],
      }),
    ]);
    const scope = section?.entries[0]?.scope;
    expect(
      scope?.kind === "institutions" && scope.groups.map((g) => [g.slug, g.name, g.city]),
    ).toEqual([
      ["i-bol", "Same University", "Bologna"],
      ["i-rim", "Same University", "Rimini"],
    ]);
  });

  it("sorts groups whose institution is unknown after the named ones", () => {
    const s = scholarship({ slug: "xx-test-sch-r", institutions: ["i0", "i1"] });
    const [section] = buildSections([
      input({
        scholarships: [s],
        institutions: [inst("i1", "Zulu University")],
        programs: [progIn("p0", "i0"), progIn("p1", "i1")],
      }),
    ]);
    const scope = section?.entries[0]?.scope;
    expect(scope?.kind === "institutions" && scope.groups.map((g) => g.slug)).toEqual(["i1", "i0"]);
  });

  it("orders sections by country code and entries by slug", () => {
    const sections = buildSections([
      input({
        country: "NL",
        scholarships: [
          scholarship({ slug: "xx-b", destinations: ["NL"] }),
          scholarship({ slug: "xx-a", destinations: ["NL"] }),
        ],
      }),
      input({ country: "DE", scholarships: [scholarship({ slug: "xx-c", destinations: ["DE"] })] }),
    ]);
    expect(sections.map((s) => s.country)).toEqual(["DE", "NL"]);
    expect(sections[1]?.entries.map((e) => e.scholarship.slug)).toEqual(["xx-a", "xx-b"]);
  });

  it("renders a scholarship listed in several shards once, in the first destination, with the union of programmes", () => {
    const s = scholarship({ slug: "xx-multi", destinations: ["XB", "XC"] });
    const sections = buildSections([
      input({
        country: "XC",
        scholarships: [s],
        programs: [progIn("pc", "ic", { country: "XC" })],
      }),
      input({ country: "XB", scholarships: [s], programs: [progIn("pb", "ib")] }),
    ]);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.country).toBe("XB");
    expect(sections[0]?.entries).toHaveLength(1);
    expect(sections[0]?.entries[0]?.scope).toEqual({ kind: "country", count: 2 });
  });
});
