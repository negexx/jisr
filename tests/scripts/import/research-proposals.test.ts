import { describe, expect, it } from "vitest";

import { type ResearchRow, rowsToProposals } from "../../../scripts/import/research-proposals";

const row = (r: Partial<ResearchRow>): ResearchRow => ({
  slug: "x",
  fact: "tuition",
  value: "",
  unit: "",
  quote: "",
  sourceUrl: "",
  appliesToNonEu: true,
  readDate: "2026-10-12",
  confidence: "high",
  ...r,
});

describe("rowsToProposals", () => {
  it("maps a tuition row with a unit to a proposal fact", () => {
    const out = rowsToProposals([
      row({
        slug: "nl-x",
        fact: "tuition",
        value: "9314",
        unit: "EUR/year",
        quote: "€ 9.314 per year",
        sourceUrl: "https://x.nl/fees",
      }),
    ]);
    expect(out["nl-x"]?.facts.tuition?.value).toEqual({
      amountMinor: 931400,
      currency: "EUR",
      period: "year",
    });
    expect(out["nl-x"]?.facts.tuition?.evidence[0]?.url).toBe("https://x.nl/fees");
  });

  it("maps a per-semester tuition", () => {
    const out = rowsToProposals([
      row({
        slug: "hu-b",
        fact: "tuition",
        value: "4500",
        unit: "EUR/semester",
        quote: "4500 EUR/semester",
        sourceUrl: "https://b.hu/fees",
      }),
    ]);
    expect(out["hu-b"]?.facts.tuition?.value).toEqual({
      amountMinor: 450000,
      currency: "EUR",
      period: "semester",
    });
  });

  it("skips a money row with no unit", () => {
    const out = rowsToProposals([
      row({
        slug: "nl-y",
        fact: "tuition",
        value: "9314",
        unit: "",
        quote: "9314",
        sourceUrl: "https://y.nl/fees",
      }),
    ]);
    expect(out["nl-y"]).toBeUndefined();
  });

  it("skips a row whose value is not published", () => {
    expect(
      rowsToProposals([
        row({ slug: "nl-z", fact: "tuition", value: "", unit: "", quote: "", sourceUrl: "" }),
      ]),
    ).toEqual({});
  });

  it("maps a recurring deadline and a channel for one slug", () => {
    const out = rowsToProposals([
      row({
        slug: "hu-x",
        fact: "intakes",
        value: "31 July",
        quote: "application deadline is 31st of July",
        sourceUrl: "https://u.hu/app",
      }),
      row({
        slug: "hu-x",
        fact: "applicationChannel",
        value: "hu-university-direct",
        quote: "apply via DreamApply",
        sourceUrl: "https://u.hu/app",
      }),
    ]);
    expect(out["hu-x"]?.facts.intakes?.value).toEqual([
      {
        startDate: null,
        applicationOpens: null,
        applicationDeadline: null,
        recurringDeadline: { month: 7, day: 31 },
      },
    ]);
    expect(out["hu-x"]?.facts.applicationChannel?.value).toBe("hu-university-direct");
  });

  it("maps a dated deadline and teaching languages", () => {
    const out = rowsToProposals([
      row({
        slug: "nl-d",
        fact: "intakes",
        value: "2027-01-15",
        quote: "15 January 2027",
        sourceUrl: "https://d.nl/app",
      }),
      row({
        slug: "nl-d",
        fact: "teachingLanguages",
        value: "en,nl",
        quote: "Dutch and English",
        sourceUrl: "https://d.nl/p",
      }),
    ]);
    expect(out["nl-d"]?.facts.intakes?.value).toEqual([
      { startDate: null, applicationOpens: null, applicationDeadline: "2027-01-15" },
    ]);
    expect(out["nl-d"]?.facts.teachingLanguages?.value).toEqual(["en", "nl"]);
  });
});
