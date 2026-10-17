import { describe, expect, it } from "vitest";

import type { MatchFilters } from "@/data-schema/match-filters";
import {
  decodeFilters,
  dropUnknownFilters,
  encodeFilters,
  filtersSearch,
  hasMatchFilterParams,
} from "@/lib/matches/filter-url";
import { EMPTY_MATCH_FILTERS } from "@/lib/matches/filters";

import { coreShard } from "../profile/core-fixture";

// The filter store's twin on the wire: the URL is a public entry point (shared links, bookmarks,
// hand-edited addresses), so every decoded value is re-validated and an unknown one is dropped,
// never trusted and never a crash (Review Focus #5).
const FULL: MatchFilters = {
  schemaVersion: 1,
  fields: ["xx-test-field-cs", "xx-test-field-eng"],
  studyLanguages: ["fr", "en"],
  destinations: ["XB", "XC"],
  institutionType: "public",
  budget: { amountMinor: 90_000, currency: "EUR", period: "month" },
};

describe("encodeFilters", () => {
  it("writes one parameter per value, in a fixed order", () => {
    expect(encodeFilters(FULL).toString()).toBe(
      "field=xx-test-field-cs&field=xx-test-field-eng&lang=fr&lang=en&dest=XB&dest=XC&type=public&budget=90000-EUR-month",
    );
  });

  it("leaves out the institution type when it is the default", () => {
    expect(encodeFilters({ ...FULL, institutionType: "any" }).toString()).not.toContain("type=");
  });

  it("leaves out the budget when none is set", () => {
    expect(encodeFilters({ ...FULL, budget: null }).toString()).not.toContain("budget=");
  });

  it("encodes the empty filters as no query at all", () => {
    expect(encodeFilters(EMPTY_MATCH_FILTERS).toString()).toBe("");
    expect(filtersSearch(EMPTY_MATCH_FILTERS)).toBe("");
  });

  it("builds a leading question mark for a non-empty query", () => {
    expect(filtersSearch({ ...EMPTY_MATCH_FILTERS, studyLanguages: ["en"] })).toBe("?lang=en");
  });
});

describe("decodeFilters", () => {
  it("round-trips every filter kind", () => {
    expect(decodeFilters(encodeFilters(FULL))).toEqual(FULL);
  });

  it("round-trips the empty filters", () => {
    expect(decodeFilters(encodeFilters(EMPTY_MATCH_FILTERS))).toEqual(EMPTY_MATCH_FILTERS);
  });

  it("reads a deep link", () => {
    const params = new URLSearchParams(
      "field=xx-test-field-cs&lang=fr&dest=XB&type=private&budget=90000-EUR-year",
    );
    expect(decodeFilters(params)).toEqual({
      ...EMPTY_MATCH_FILTERS,
      fields: ["xx-test-field-cs"],
      studyLanguages: ["fr"],
      destinations: ["XB"],
      institutionType: "private",
      budget: { amountMinor: 90_000, currency: "EUR", period: "year" },
    });
  });

  it("drops values that are not well formed instead of throwing", () => {
    const params = new URLSearchParams(
      "field=Computer%20Science&lang=english&dest=France&type=charity&budget=eight",
    );
    expect(decodeFilters(params)).toEqual(EMPTY_MATCH_FILTERS);
  });

  it("keeps the well-formed values and drops only the unknown ones", () => {
    const params = new URLSearchParams(
      "field=@@garbage@@&field=xx-test-field-cs&lang=english&lang=en&dest=France&dest=XB",
    );
    expect(decodeFilters(params)).toEqual({
      ...EMPTY_MATCH_FILTERS,
      fields: ["xx-test-field-cs"],
      studyLanguages: ["en"],
      destinations: ["XB"],
    });
  });

  it.each([
    ["a fractional amount", "9.5-EUR-month"],
    ["a negative amount", "-1-EUR-month"],
    ["an amount with letters", "eight-hundred-EUR-month"],
    ["a missing part", "80000-EUR"],
    ["an unknown currency shape", "80000-eur-month"],
    ["an unknown period", "80000-EUR-week"],
    ["an extra part", "80000-EUR-month-year"],
    ["an empty value", ""],
  ])("drops a budget with %s and keeps the other filters", (_label, budget) => {
    const params = new URLSearchParams(`field=xx-test-field-cs&budget=${budget}`);
    expect(decodeFilters(params)).toEqual({
      ...EMPTY_MATCH_FILTERS,
      fields: ["xx-test-field-cs"],
    });
  });

  it("drops a large budget amount that is not a safe integer", () => {
    const params = new URLSearchParams("budget=99999999999999999999-EUR-month");
    expect(decodeFilters(params).budget).toBeNull();
  });

  it("removes duplicated values", () => {
    const params = new URLSearchParams(
      "field=xx-test-field-cs&field=xx-test-field-cs&lang=en&lang=en",
    );
    expect(decodeFilters(params)).toEqual({
      ...EMPTY_MATCH_FILTERS,
      fields: ["xx-test-field-cs"],
      studyLanguages: ["en"],
    });
  });

  it("ignores parameters it does not own", () => {
    const params = new URLSearchParams("utm_source=x&field=xx-test-field-cs&type=any");
    expect(decodeFilters(params)).toEqual({
      ...EMPTY_MATCH_FILTERS,
      fields: ["xx-test-field-cs"],
    });
  });
});

describe("dropUnknownFilters", () => {
  it("drops a well-formed country the catalogue does not know", () => {
    const filters = decodeFilters(new URLSearchParams("dest=QQ"));
    expect(filters.destinations).toEqual(["QQ"]);
    expect(dropUnknownFilters(filters, coreShard()).destinations).toEqual([]);
  });

  it("drops a well-formed field and language the catalogue does not know, keeping the known ones", () => {
    const filters = decodeFilters(
      new URLSearchParams("field=xx-test-field&field=old-removed-field&lang=fr&lang=zz"),
    );
    const known = dropUnknownFilters(filters, coreShard());
    expect(known.fields).toEqual(["xx-test-field"]);
    expect(known.studyLanguages).toEqual(["fr"]);
  });

  it("returns the same object when every value is known", () => {
    const filters = decodeFilters(new URLSearchParams("field=xx-test-field&lang=en&dest=XB"));
    expect(dropUnknownFilters(filters, coreShard())).toBe(filters);
  });

  it("keeps the institution type and the budget untouched", () => {
    const filters: MatchFilters = {
      ...EMPTY_MATCH_FILTERS,
      fields: ["old-removed-field"],
      institutionType: "private",
      budget: { amountMinor: 80_000, currency: "EUR", period: "month" },
    };
    const known = dropUnknownFilters(filters, coreShard());
    expect(known.institutionType).toBe("private");
    expect(known.budget).toEqual({ amountMinor: 80_000, currency: "EUR", period: "month" });
  });
});

describe("hasMatchFilterParams", () => {
  it("says no for an empty query and for unrelated parameters", () => {
    expect(hasMatchFilterParams(new URLSearchParams(""))).toBe(false);
    expect(hasMatchFilterParams(new URLSearchParams("utm_source=x&page=2"))).toBe(false);
  });

  it("says yes for any owned parameter, even one that decodes to nothing", () => {
    expect(hasMatchFilterParams(new URLSearchParams("field=xx-test-field-cs"))).toBe(true);
    expect(hasMatchFilterParams(new URLSearchParams("type=any"))).toBe(true);
    expect(hasMatchFilterParams(new URLSearchParams("field=@@garbage@@"))).toBe(true);
  });
});
