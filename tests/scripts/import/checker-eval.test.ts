import { describe, expect, it } from "vitest";

import { groupVariants, label } from "../../../scripts/import/checker-eval";

const ev = [{ url: "https://x.example/p", quote: "some quote of some length" }];
const fact = (value: unknown) => ({ value, evidence: ev });

describe("groupVariants", () => {
  it("pools the facts of several models, one entry per distinct value", () => {
    const groups = groupVariants([
      { durationYears: fact(3), teachingLanguages: fact(["en"]) },
      { durationYears: fact(3), teachingLanguages: fact(["en", "de"]) },
    ]);
    const flat = groups.flatMap((g) =>
      Object.entries(g).map(([k, f]) => `${k}=${JSON.stringify(f.value)}`),
    );
    expect(flat.sort()).toEqual([
      "durationYears=3",
      'teachingLanguages=["en","de"]',
      'teachingLanguages=["en"]',
    ]);
  });

  it("never puts two values of the same fact in one group", () => {
    const groups = groupVariants([
      { teachingLanguages: fact(["en"]) },
      { teachingLanguages: fact(["de"]) },
      { teachingLanguages: fact(["fr"]) },
    ]);
    expect(groups).toHaveLength(3);
    for (const g of groups) expect(Object.keys(g)).toEqual(["teachingLanguages"]);
  });
});

describe("label", () => {
  it("calls a fact correct, wrong or unknown against the truth", () => {
    const truth = { durationYears: fact(3) };
    expect(label("durationYears", fact(3), truth)).toBe("correct");
    expect(label("durationYears", fact(4), truth)).toBe("wrong");
    expect(label("teachingLanguages", fact(["en"]), truth)).toBe("unknown");
  });
});

describe("groupVariants order", () => {
  it("treats the same languages in another order as one value", () => {
    const groups = groupVariants([
      { teachingLanguages: fact(["en", "de"]) },
      { teachingLanguages: fact(["de", "en"]) },
    ]);
    expect(groups).toHaveLength(1);
  });
});
