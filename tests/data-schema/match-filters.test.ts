import { describe, expect, it } from "vitest";

import { MATCH_FILTERS_VERSION, MatchFiltersSchema } from "@/data-schema/match-filters";

const FILTERS = {
  schemaVersion: 1,
  fields: ["xx-test-field-cs", "xx-test-field-eng"],
  studyLanguages: ["fr", "en"],
  destinations: ["FR", "DE"],
  institutionType: "any",
  budget: { amountMinor: 90_000, currency: "EUR", period: "year" },
};

type Mutable = Record<string, unknown>;

const rows: Array<[string, (f: Mutable) => void, boolean]> = [
  ["base filters", () => {}, true],
  [
    "budget null",
    (f) => {
      f.budget = null;
    },
    true,
  ],
  [
    "well-formed budget",
    (f) => {
      f.budget = { amountMinor: 0, currency: "MAD", period: "month" };
    },
    true,
  ],
  [
    "duplicate field values",
    (f) => {
      f.fields = ["xx-test-field-cs", "xx-test-field-cs"];
    },
    true,
  ],
  [
    "empty arrays",
    (f) => {
      f.fields = [];
      f.studyLanguages = [];
      f.destinations = [];
    },
    true,
  ],
  [
    "schemaVersion 2",
    (f) => {
      f.schemaVersion = 2;
    },
    false,
  ],
  [
    "unknown key",
    (f) => {
      f.extra = true;
    },
    false,
  ],
  [
    "institutionType outside the enum",
    (f) => {
      f.institutionType = "charter";
    },
    false,
  ],
  [
    "bad field slug",
    (f) => {
      f.fields = ["Computer Science"];
    },
    false,
  ],
  [
    "bad study language code",
    (f) => {
      f.studyLanguages = ["FR"];
    },
    false,
  ],
  [
    "malformed budget period",
    (f) => {
      f.budget = { amountMinor: 1, currency: "EUR", period: "week" };
    },
    false,
  ],
  [
    "missing budget key",
    (f) => {
      delete f.budget;
    },
    false,
  ],
];

describe("MatchFiltersSchema", () => {
  it("exposes the schema version literal", () => {
    expect(MATCH_FILTERS_VERSION).toBe(1);
  });

  it.each(rows)("%s", (_label, mutate, ok) => {
    const filters: Mutable = structuredClone(FILTERS);
    mutate(filters);
    expect(MatchFiltersSchema.safeParse(filters).success).toBe(ok);
  });
});
