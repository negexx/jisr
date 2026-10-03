import { describe, expect, it } from "vitest";

import { coverageOf, renderCoverage } from "../../../scripts/data/coverage";

const fact = (value: unknown, infoKind = "official") => ({
  value,
  source: "programme",
  info_kind: infoKind,
});

const records = [
  {
    country: "DE",
    tuition: fact({ amountMinor: 0, currency: "EUR", period: "semester" }),
    documents: fact([]),
  },
  { country: "DE", tuition: fact(null), documents: fact(null) },
  {
    country: "NL",
    teachingLanguages: fact(["en"]),
    requirements: { coverage: "partial", rules: [{ id: "req-1" }] },
  },
];

describe("coverageOf", () => {
  const table = coverageOf(records);

  it("counts programmes and the programmes holding each fact, per country", () => {
    expect(table.DE?.n).toBe(2);
    expect(table.DE?.tuition).toBe(1);
    expect(table.DE?.["tuition official"]).toBe(1);
    expect(table.NL?.n).toBe(1);
    expect(table.NL?.language).toBe(1);
    expect(table.NL?.rules).toBe(1);
  });

  it("does not count an empty array as a value", () => {
    expect(table.DE?.documents).toBe(0);
  });

  it("counts only an official tuition as official", () => {
    const estimated = coverageOf([
      {
        country: "FR",
        tuition: fact({ amountMinor: 1, currency: "EUR", period: "year" }, "estimate"),
      },
    ]);
    expect(estimated.FR?.tuition).toBe(1);
    expect(estimated.FR?.["tuition official"]).toBe(0);
  });

  it("counts a missing fact as no value", () => {
    expect(table.DE?.intakes).toBe(0);
    expect(table.DE?.rules).toBe(0);
  });
});

describe("renderCoverage", () => {
  const rendered = renderCoverage(coverageOf(records));

  it("renders one column per country in alphabetical order", () => {
    expect(rendered).toContain("| Fact | DE | NL |");
  });

  it("renders one row per fact", () => {
    expect(rendered).toContain("| tuition | 1 | 0 |");
    expect(rendered).toContain("| programmes | 2 | 1 |");
    expect(rendered).toContain("| documents | 0 | 0 |");
  });
});
