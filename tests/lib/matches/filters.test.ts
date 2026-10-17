import { describe, expect, it } from "vitest";

import {
  MatchFiltersSchema,
  MATCH_FILTERS_VERSION as ORACLE_MATCH_FILTERS_VERSION,
} from "@/data-schema/match-filters";
import { MATCH_FILTERS_VERSION } from "@/lib/constants";
import { EMPTY_MATCH_FILTERS, isEmptyFilters, parseMatchFilters } from "@/lib/matches/filters";

import { cloneValue, compare, fuzz, newTally } from "../differential";

const BASE: Record<string, unknown> = {
  schemaVersion: 1,
  fields: ["xx-test-field-cs", "xx-test-field-eng"],
  studyLanguages: ["fr", "en"],
  destinations: ["FR", "DE"],
  institutionType: "any",
  budget: { amountMinor: 90_000, currency: "EUR", period: "year" },
};

type Editable = Record<string, unknown>;

function edited(change: (filters: Editable) => void): unknown {
  const copy = cloneValue(BASE) as Editable;
  change(copy);
  return copy;
}

const VALID: Array<[string, unknown]> = [
  ["base filters", BASE],
  ["inherited enumerable keys that are all in the shape", Object.create(BASE)],
  ["class instance root", Object.assign(new (class Loaded {})(), BASE)],
  ["symbol key is ignored", { ...BASE, [Symbol("ignored")]: 1 }],
  ["no fields", edited((f) => (f.fields = []))],
  ["no study languages", edited((f) => (f.studyLanguages = []))],
  ["no destinations", edited((f) => (f.destinations = []))],
  ["no budget", edited((f) => (f.budget = null))],
  [
    "monthly budget",
    edited((f) => (f.budget = { amountMinor: 0, currency: "MAD", period: "month" })),
  ],
  ["public only", edited((f) => (f.institutionType = "public"))],
  ["private only", edited((f) => (f.institutionType = "private"))],
  ["duplicate field values", edited((f) => (f.fields = ["a1-b2-c3", "a1-b2-c3"]))],
  ["duplicate study language values", edited((f) => (f.studyLanguages = ["fr", "fr"]))],
  ["duplicate destination values", edited((f) => (f.destinations = ["FR", "FR"]))],
  ["multi-word slug", edited((f) => (f.fields = ["a1-b2-c3", "x"]))],
];

const INVALID: Array<[string, unknown]> = [
  ["null root", null],
  ["undefined root", undefined],
  ["string root", "filters"],
  ["number root", 1],
  ["boolean root", true],
  ["array root", [BASE]],
  ["empty object", {}],
  ["schemaVersion 2", edited((f) => (f.schemaVersion = 2))],
  ["schemaVersion 0", edited((f) => (f.schemaVersion = 0))],
  ["schemaVersion as string", edited((f) => (f.schemaVersion = "1"))],
  ["schemaVersion 1.0000001", edited((f) => (f.schemaVersion = 1.0000001))],
  ["missing schemaVersion", edited((f) => delete f.schemaVersion)],
  ["unknown top-level key", edited((f) => (f.extra = 1))],
  ["own __proto__ key", JSON.parse(`${JSON.stringify(BASE).slice(0, -1)},"__proto__":{"x":1}}`)],
  [
    "own constructor key",
    edited((f) => Object.defineProperty(f, "constructor", { value: {}, enumerable: true })),
  ],
  ["inherited enumerable extra key", Object.assign(Object.create({ extra: 1 }), BASE)],
  ["fields object", edited((f) => (f.fields = {}))],
  ["fields missing", edited((f) => delete f.fields)],
  ["fields bad slug", edited((f) => (f.fields = ["Computer Science"]))],
  ["fields empty string", edited((f) => (f.fields = [""]))],
  ["fields string", edited((f) => (f.fields = "computer-science"))],
  ["studyLanguages bad code", edited((f) => (f.studyLanguages = ["FR"]))],
  ["studyLanguages three letters", edited((f) => (f.studyLanguages = ["fra"]))],
  ["studyLanguages missing", edited((f) => delete f.studyLanguages)],
  ["destinations lowercase", edited((f) => (f.destinations = ["fr"]))],
  ["destinations missing", edited((f) => delete f.destinations)],
  ["destinations not array", edited((f) => (f.destinations = "FR"))],
  ["budget undefined", edited((f) => (f.budget = undefined))],
  ["budget missing", edited((f) => delete f.budget)],
  ["budget array", edited((f) => (f.budget = []))],
  [
    "budget unknown key",
    edited((f) => (f.budget = { amountMinor: 1, currency: "EUR", period: "year", x: 1 })),
  ],
  [
    "budget negative",
    edited((f) => (f.budget = { amountMinor: -1, currency: "EUR", period: "year" })),
  ],
  [
    "budget float",
    edited((f) => (f.budget = { amountMinor: 10.5, currency: "EUR", period: "year" })),
  ],
  [
    "budget NaN",
    edited((f) => (f.budget = { amountMinor: Number.NaN, currency: "EUR", period: "year" })),
  ],
  [
    "budget Infinity",
    edited(
      (f) =>
        (f.budget = { amountMinor: Number.POSITIVE_INFINITY, currency: "EUR", period: "year" }),
    ),
  ],
  [
    "budget unsafe integer",
    edited((f) => (f.budget = { amountMinor: 2 ** 53, currency: "EUR", period: "year" })),
  ],
  [
    "budget string amount",
    edited((f) => (f.budget = { amountMinor: "10", currency: "EUR", period: "year" })),
  ],
  [
    "budget currency lowercase",
    edited((f) => (f.budget = { amountMinor: 1, currency: "eur", period: "year" })),
  ],
  [
    "budget period week",
    edited((f) => (f.budget = { amountMinor: 1, currency: "EUR", period: "week" })),
  ],
  ["budget period missing", edited((f) => (f.budget = { amountMinor: 1, currency: "EUR" }))],
  ["institution type unknown", edited((f) => (f.institutionType = "charter"))],
  ["institution type missing", edited((f) => delete f.institutionType)],
  ["institution type null", edited((f) => (f.institutionType = null))],
];

describe("parseMatchFilters against MatchFiltersSchema", () => {
  it("uses the same schema version as the schema", () => {
    expect(MATCH_FILTERS_VERSION).toBe(ORACLE_MATCH_FILTERS_VERSION);
  });

  it.each(VALID)("accepts and returns an equal copy of %s", (_label, input) => {
    const oracle = MatchFiltersSchema.safeParse(input);
    expect(oracle.success).toBe(true);
    const parsed = parseMatchFilters(input);
    expect(parsed).toEqual(oracle.data);
    expect(parsed).not.toBe(input);
  });

  it.each(INVALID)("rejects %s exactly as the schema does", (_label, input) => {
    expect(MatchFiltersSchema.safeParse(input).success).toBe(false);
    expect(parseMatchFilters(input)).toBeNull();
  });

  it("agrees with the schema on every table row", () => {
    const tally = newTally();
    for (const [label, input] of [...VALID, ...INVALID]) {
      compare(MatchFiltersSchema, parseMatchFilters, input, label, tally);
    }
    expect(tally.disagreements).toEqual([]);
    expect(tally.accepted).toBe(VALID.length);
    expect(tally.rejected).toBe(INVALID.length);
  });

  it("agrees with the schema on 3000 seeded mutations of a valid filters object", () => {
    const tally = fuzz(MatchFiltersSchema, parseMatchFilters, BASE, 3000, 20261016);
    expect(tally.disagreements).toEqual([]);
    expect(tally.accepted).toBeGreaterThan(50);
    expect(tally.rejected).toBeGreaterThan(1000);
  });

  it("agrees with the schema on 1000 seeded mutations of a minimal valid filters object", () => {
    const minimal = edited((f) => {
      f.fields = [];
      f.studyLanguages = [];
      f.destinations = [];
      f.budget = null;
    });
    const tally = fuzz(MatchFiltersSchema, parseMatchFilters, minimal, 1000, 42);
    expect(tally.disagreements).toEqual([]);
    expect(tally.accepted).toBeGreaterThan(30);
  });

  it("keeps EMPTY_MATCH_FILTERS valid and empty", () => {
    expect(parseMatchFilters(EMPTY_MATCH_FILTERS)).toEqual(
      MatchFiltersSchema.parse(EMPTY_MATCH_FILTERS),
    );
    expect(isEmptyFilters(EMPTY_MATCH_FILTERS)).toBe(true);
  });

  it("treats a filters object with one field as not empty", () => {
    const filters = parseMatchFilters(edited((f) => (f.fields = ["xx-test-field-cs"])));
    expect(filters).not.toBeNull();
    if (filters === null) throw new Error("expected a parsed filters object");
    expect(isEmptyFilters(filters)).toBe(false);
  });
});
