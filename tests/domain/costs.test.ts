import { describe, expect, it } from "vitest";
import type { Budget } from "@/data-schema/profile";
import type { CostProfile, Program } from "@/data-schema/resolved";
import { estimateCost } from "@/domain/costs";
import {
  costLine,
  costProfile,
  deepFreeze,
  fact,
  NOW,
  program,
  STALE,
} from "../fixtures/domain/builders";

const cityP = costProfile("xx-test-cost-city", "xx-test-city", {
  housing: costLine(40000, 60000, "month"),
  food: costLine(20000, 30000, "month"),
});
const countryP = costProfile("xx-test-cost-country", null, {
  housing: costLine(30000, 50000, "month"),
  transport: costLine(3000, 5000, "month"),
  insurance: costLine(10000, 20000, "year"),
  application_visa: costLine(5000, 9000, "once"),
  setup: costLine(20000, 40000, "once"),
});
const est = (o: { p?: Program; profiles?: CostProfile[]; budget?: Budget | null } = {}) =>
  estimateCost({
    program: o.p ?? program(),
    costProfiles: o.profiles ?? [cityP, countryP],
    budget: o.budget ?? null,
    now: NOW,
  });

describe("estimateCost lines", () => {
  it("computes the seven first-year lines with scope and per", () => {
    const r = est();
    expect(
      r.lines.map((l) => [
        l.category,
        l.status,
        l.firstYear?.min,
        l.firstYear?.max,
        l.per,
        l.scope,
      ]),
    ).toEqual([
      ["tuition", "ok", 100000, 100000, "year", "program"],
      ["housing", "ok", 400000, 600000, "month", "city"],
      ["food", "ok", 200000, 300000, "month", "city"],
      ["transport", "ok", 30000, 50000, "month", "country"],
      ["insurance", "ok", 10000, 20000, "year", "country"],
      ["application_visa", "ok", 5000, 9000, "once", "country"],
      ["setup", "ok", 20000, 40000, "once", "country"],
    ]);
    expect(r.totals).toEqual([{ min: 765000, max: 1119000, currency: "XTS" }]);
    expect(r.complete).toBe(true);
    expect(r.academicYearMonths).toBe(10);
    expect(r.lines[1]?.fact).toMatchObject({
      record: "cost-profiles/xx-test-cost-city",
      path: "lines.housing",
    });
    expect(r.lines[0]?.fact).toMatchObject({
      record: "programs/xx-test-prog",
      path: "tuition",
      class: "volatile",
    });
  });

  it("semester tuition doubles", () => {
    const r = est({
      p: program({
        tuition: fact(
          { amountMinor: 60000, currency: "XTS", period: "semester" as const },
          { class: "volatile" },
        ),
      }),
    });
    expect(r.lines[0]).toMatchObject({ firstYear: { min: 120000, max: 120000 }, per: "semester" });
  });

  it("tuition not published → missing, incomplete, unknown fit", () => {
    const r = est({
      p: program({ tuition: fact(null, { class: "volatile" }) }),
      budget: { amountMinor: 9999999, currency: "XTS", period: "year" },
    });
    expect(r.lines[0]).toMatchObject({
      status: "missing",
      firstYear: null,
      per: null,
      scope: "program",
      fact: { record: "programs/xx-test-prog", path: "tuition" },
    });
    expect(r.complete).toBe(false);
    expect(r.budgetFit).toBe("unknown");
    expect(r.totals).toEqual([{ min: 665000, max: 1019000, currency: "XTS" }]);
  });

  it("missing living line", () => {
    const { setup: _s, ...rest } = countryP.lines;
    const r = est({ profiles: [cityP, { ...countryP, lines: rest }] });
    expect(r.lines[6]).toEqual({
      category: "setup",
      status: "missing",
      firstYear: null,
      per: null,
      scope: null,
      fact: null,
    });
    expect(r.totals).toEqual([{ min: 745000, max: 1079000, currency: "XTS" }]);
    expect(r.complete).toBe(false);
  });

  it("null-valued city line falls through to the country line", () => {
    const nullCity = { ...cityP, lines: { ...cityP.lines, housing: fact(null) } };
    const r = est({ profiles: [nullCity, countryP] });
    expect(r.lines[1]).toMatchObject({
      status: "ok",
      firstYear: { min: 300000, max: 500000 },
      scope: "country",
      fact: { record: "cost-profiles/xx-test-cost-country", path: "lines.housing" },
    });
  });

  it("missing line reports the null-valued fact, city first", () => {
    const nullCity = { ...cityP, lines: { ...cityP.lines, housing: fact(null) } };
    const nullCountry = { ...countryP, lines: { ...countryP.lines, housing: fact(null) } };
    const both = est({ profiles: [nullCity, nullCountry] });
    expect(both.lines[1]).toMatchObject({
      status: "missing",
      firstYear: null,
      per: null,
      scope: "city",
      fact: { record: "cost-profiles/xx-test-cost-city", path: "lines.housing" },
    });
    const countryOnly = est({ profiles: [cityP, nullCountry] });
    const foodOnly = est({
      profiles: [
        { ...cityP, lines: { food: cityP.lines.food } },
        { ...countryP, lines: { ...countryP.lines, housing: fact(null) } },
      ],
    });
    expect(countryOnly.lines[1]).toMatchObject({ status: "ok", scope: "city" });
    expect(foodOnly.lines[1]).toMatchObject({
      status: "missing",
      scope: "country",
      fact: { record: "cost-profiles/xx-test-cost-country", path: "lines.housing" },
    });
  });

  it("ignores other cities and other countries", () => {
    const r = est({
      profiles: [
        costProfile("xx-test-cost-other", "xx-test-other-city", { food: costLine(1, 1, "once") }),
        costProfile("xx-test-cost-xc", null, { food: costLine(1, 1, "once") }, "XC"),
      ],
    });
    expect(r.lines.slice(1).every((l) => l.status === "missing")).toBe(true);
  });

  it("multiple currencies → per-currency totals in first-appearance order, fit unknown", () => {
    const r = est({
      p: program({
        tuition: fact(
          { amountMinor: 100000, currency: "XXX", period: "year" as const },
          { class: "volatile" },
        ),
      }),
      budget: { amountMinor: 9999999, currency: "XTS", period: "year" },
    });
    expect(r.totals).toEqual([
      { min: 100000, max: 100000, currency: "XXX" },
      { min: 665000, max: 1019000, currency: "XTS" },
    ]);
    expect(r.complete).toBe(true);
    expect(r.budgetFit).toBe("unknown");
  });

  it("interleaved currencies keep per-currency totals in first-appearance order", () => {
    const r = est({
      profiles: [
        costProfile("xx-test-cost-city", "xx-test-city", {
          housing: costLine(40000, 60000, "month", { currency: "XXX" }),
          food: costLine(20000, 30000, "month"),
        }),
        countryP,
      ],
    });
    expect(r.lines.map((l) => l.firstYear?.currency)).toEqual([
      "XTS",
      "XXX",
      "XTS",
      "XTS",
      "XTS",
      "XTS",
      "XTS",
    ]);
    expect(r.totals).toEqual([
      { min: 365000, max: 519000, currency: "XTS" },
      { min: 400000, max: 600000, currency: "XXX" },
    ]);
    expect(r.budgetFit).toBe("unknown");
  });

  it("stale line still counts, freshness visible", () => {
    const r = est({
      profiles: [
        cityP,
        {
          ...countryP,
          lines: {
            ...countryP.lines,
            setup: costLine(20000, 40000, "once", { last_verified_at: STALE }),
          },
        },
      ],
    });
    expect(r.lines[6]).toMatchObject({ status: "ok", fact: { freshness: "stale" } });
  });

  it("does not mutate inputs", () => {
    const p = deepFreeze(program());
    const profiles = deepFreeze([cityP, countryP]);
    expect(() =>
      estimateCost({ program: p, costProfiles: profiles, budget: null, now: NOW }),
    ).not.toThrow();
  });
});

describe("budgetFit (totals 765000..1119000 XTS, 10-month academic year)", () => {
  it.each([
    [null, "unknown"],
    [{ amountMinor: 1119000, currency: "XTS", period: "year" }, "within"],
    [{ amountMinor: 1000000, currency: "XTS", period: "year" }, "straddles"],
    [{ amountMinor: 765000, currency: "XTS", period: "year" }, "straddles"],
    [{ amountMinor: 764999, currency: "XTS", period: "year" }, "above"],
    [{ amountMinor: 111900, currency: "XTS", period: "month" }, "within"], // x10 = 1 119 000 exactly
    [{ amountMinor: 111899, currency: "XTS", period: "month" }, "straddles"], // x10 = 1 118 990
    [{ amountMinor: 112000, currency: "XTS", period: "month" }, "within"], // x10 = 1 120 000
    [{ amountMinor: 76000, currency: "XTS", period: "month" }, "above"], // x10 = 760 000
    [{ amountMinor: 9999999, currency: "XXX", period: "year" }, "unknown"],
  ] as const)("%j → %s", (budget, fit) =>
    expect(est({ budget: budget === null ? null : { ...budget } }).budgetFit).toBe(fit));
});

describe("estimateCost tuition range", () => {
  const ranged = (extra: object = {}) =>
    program({
      tuition: fact(
        { amountMinor: 100000, maxAmountMinor: 300000, currency: "XTS", period: "year", ...extra },
        { class: "volatile" },
      ),
    });

  it("uses the stated lowest and highest fee as the tuition line and widens the total", () => {
    const r = est({ p: ranged() });
    expect(r.lines[0]).toMatchObject({
      category: "tuition",
      status: "ok",
      firstYear: { min: 100000, max: 300000, currency: "XTS" },
      per: "year",
    });
    // flat 100000 gave 765000-1119000; the highest fee adds 200000 to the maximum only
    expect(r.totals).toEqual([{ min: 765000, max: 1319000, currency: "XTS" }]);
    expect(r.lines[0]?.incomeBased).toBeUndefined();
  });

  it("flags an income-based range on the line", () => {
    const r = est({ p: ranged({ basis: "income_based" }) });
    expect(r.lines[0]?.incomeBased).toBe(true);
  });

  it("doubles both ends of a semester range", () => {
    const r = est({ p: ranged({ period: "semester" }) });
    expect(r.lines[0]?.firstYear).toEqual({ min: 200000, max: 600000, currency: "XTS" });
  });

  it("leaves a flat fee exactly as before (equal ends, no flag)", () => {
    const r = est();
    expect(r.lines[0]).toMatchObject({ firstYear: { min: 100000, max: 100000 } });
    expect(r.lines[0]?.incomeBased).toBeUndefined();
  });

  it("compares a budget against the widened total like any other range", () => {
    // monthly budget 120000 * 10 = 1200000: between the total's minimum (765000) and maximum (1319000)
    const r = est({
      p: ranged(),
      budget: { amountMinor: 120000, currency: "XTS", period: "month" },
    });
    expect(r.budgetFit).toBe("straddles");
  });
});
