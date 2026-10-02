import { describe, expect, it } from "vitest";

import { crossCheck, sameValue, scoreFacts } from "../../../scripts/import/bakeoff-score";

const ev = [{ url: "https://x.example/p", quote: "a quote of some length" }];
const fact = (value: unknown) => ({ value, evidence: ev });

describe("sameValue", () => {
  it("compares numbers and slugs exactly", () => {
    expect(sameValue("durationYears", 3, 3)).toBe(true);
    expect(sameValue("durationYears", 3, 4)).toBe(false);
    expect(sameValue("applicationChannel", "nl-studielink", "nl-studielink")).toBe(true);
  });

  it("treats languages as a set", () => {
    expect(sameValue("teachingLanguages", ["en", "de"], ["de", "en"])).toBe(true);
    expect(sameValue("teachingLanguages", ["en"], ["en", "de"])).toBe(false);
  });

  it("compares tuition by amount, currency and period", () => {
    const a = { amountMinor: 1465000, currency: "EUR", period: "year" };
    expect(sameValue("tuition", a, { ...a })).toBe(true);
    expect(sameValue("tuition", a, { ...a, period: "semester" })).toBe(false);
    expect(sameValue("tuition", a, { ...a, amountMinor: 1 })).toBe(false);
  });

  it("compares intakes by the dates they state, not their order", () => {
    const a = [
      { startDate: null, applicationOpens: null, applicationDeadline: "2027-05-01" },
      { startDate: "2027-09-01", applicationOpens: null, applicationDeadline: null },
    ];
    expect(sameValue("intakes", a, [...a].reverse())).toBe(true);
    expect(
      sameValue("intakes", a, [
        { startDate: null, applicationOpens: null, applicationDeadline: "2027-05-01" },
      ]),
    ).toBe(false);
  });
});

describe("scoreFacts", () => {
  const truth = {
    durationYears: fact(3),
    teachingLanguages: fact(["en"]),
    applicationChannel: fact("nl-studielink"),
  };

  it("sorts every fact into agree, conflict, extra, missing or rejected", () => {
    const score = scoreFacts(
      truth,
      {
        durationYears: fact(3), // agrees
        teachingLanguages: fact(["de"]), // conflicts: wrong value that the verifier let through
        tuition: fact({ amountMinor: 0, currency: "EUR", period: "year" }), // not in the truth: extra
      },
      [{ fact: "applicationChannel", reason: "no quote was found verbatim" }],
    );
    expect(score).toEqual({
      agree: ["durationYears"],
      conflict: ["teachingLanguages"],
      extra: ["tuition"],
      missing: ["applicationChannel"],
      rejected: ["applicationChannel"],
    });
  });

  it("a fact the model never proposed is missing but not rejected", () => {
    const score = scoreFacts(truth, {}, []);
    expect(score.missing).toEqual(["durationYears", "teachingLanguages", "applicationChannel"]);
    expect(score.rejected).toEqual([]);
  });

  it("ignores rejected requirement rules", () => {
    const score = scoreFacts(truth, {}, [
      { fact: "requirement language_proficiency", reason: "soft" },
    ]);
    expect(score.rejected).toEqual([]);
  });
});

describe("crossCheck", () => {
  const truth = { durationYears: fact(3), teachingLanguages: fact(["en"]) };

  it("keeps a fact only when both models accepted it with the same value", () => {
    const result = crossCheck(
      truth,
      { durationYears: fact(3), teachingLanguages: fact(["de"]) },
      { durationYears: fact(3), teachingLanguages: fact(["en"]) },
    );
    expect(result.kept).toEqual(["durationYears"]);
    expect(result.score.agree).toEqual(["durationYears"]);
    expect(result.score.conflict).toEqual([]);
  });

  it("drops a fact that only one model accepted", () => {
    const result = crossCheck(truth, { durationYears: fact(3) }, {});
    expect(result.kept).toEqual([]);
  });
});
