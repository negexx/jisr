// T1a audit probes: each assertion encodes a documented invariant from
// .claude/rules/matching-domain.md / ADR 0005 / 0009 / 0010 / 0014. A failure here is
// audit evidence (a suspected defect), not a test to fix. READ-ONLY audit.
import { describe, expect, it } from "vitest";
import type { Budget } from "@/data-schema/profile";
import type { AdmissionRoute, CostProfile, Program, ResolvedRule } from "@/data-schema/resolved";
import { generateChecklist } from "@/domain/checklist";
import type { ChecklistInput } from "@/domain/checklist";
import { estimateCost } from "@/domain/costs";
import { filterPrograms, preferenceMismatches } from "@/domain/filter";
import { nextIntake } from "@/domain/intakes";
import { aggregateMatchStatus, matchProgram } from "@/domain/match";
import { scholarshipsForProgram } from "@/domain/scholarships";
import type { Reason } from "@/domain/types";
import {
  channel,
  costLine,
  costProfile,
  fact,
  meta,
  NOW,
  profile,
  program,
  reference,
  requirements,
  route,
  rule,
  scholarship,
  staleMeta,
} from "../fixtures/domain/builders";

const run = (routes: AdmissionRoute[], p: Program = program(), prof = profile()) =>
  matchProgram({ profile: prof, program: p, routes, reference: reference(), now: NOW });
const brief = (rs: Reason[]) => rs.map((r) => `${r.ruleId}:${r.outcome}:${r.code}`);
const failRule = rule("prior_study_years_min", { id: "r-fail", years: 1 });
const passRule = rule("credential_type_in", { id: "r-pass", types: ["xx-test-cred"] });
const withRules = (...rules: ResolvedRule[]) => program({ requirements: requirements({ rules }) });

describe("match semantics", () => {
  it("aggregateMatchStatus([]) is check (no evidence is never satisfied)", () => {
    expect(aggregateMatchStatus([])).toBe("check");
  });

  it("route check with a fresh failing condition is a definite failure (not_satisfied)", () => {
    const r = run([
      route({ outcome: "check", conditions: [rule("prior_study_years_min", { id: "c", years: 1 })] }),
    ]);
    expect(r.status).toBe("not_satisfied");
  });

  it("not_eligible short-circuits: only the route reason, program rules not evaluated", () => {
    const r = run([route({ outcome: "not_eligible" })], withRules(passRule, failRule));
    expect(r.reasons.map((x) => x.ruleId)).toEqual(["route"]);
    expect(brief(r.reasons)).toEqual(["route:fail:route_not_eligible"]);
  });

  it("foundation short-circuits: only the route reason", () => {
    const r = run([route({ outcome: "foundation" })], withRules(failRule));
    expect(r.reasons.map((x) => x.ruleId)).toEqual(["route"]);
    expect(r.status).toBe("check");
  });

  it("a complete program with zero published rules and a direct route is satisfied (vacuous)", () => {
    const r = run([route()], program({ requirements: requirements({ rules: [] }) }));
    expect(brief(r.reasons)).toEqual(["route:pass:ok"]);
    // documents today's behaviour; see F-vacuous in the draft.
    expect(r.status).toBe("satisfied");
  });

  it("a stale route fact never yields satisfied or not_satisfied", () => {
    for (const outcome of ["direct", "not_eligible"] as const) {
      const r = run([route({ outcome, fact: staleMeta() })], withRules(passRule));
      expect(r.status).toBe("check");
    }
  });
});

describe("costs", () => {
  const empty = estimateCost({ program: program(), costProfiles: [], budget: null, now: NOW });

  it("always 7 lines in fixed order even with no cost profile", () => {
    expect(empty.lines.map((l) => l.category)).toEqual([
      "tuition",
      "housing",
      "food",
      "transport",
      "insurance",
      "application_visa",
      "setup",
    ]);
    expect(empty.lines).toHaveLength(7);
    expect(empty.complete).toBe(false);
    expect(empty.totals).toEqual([{ min: 100000, max: 100000, currency: "XTS" }]);
  });

  it("monthly budget is multiplied by the 10-month academic year", () => {
    const r = estimateCost({
      program: program(),
      costProfiles: [],
      budget: { amountMinor: 100000, currency: "XTS", period: "month" } satisfies Budget,
      now: NOW,
    });
    expect(r.academicYearMonths).toBe(10);
    expect(r.budgetFit).toBe("unknown"); // incomplete => unknown regardless
  });

  it("budgetFit is unknown when the single total is in another currency", () => {
    const r = estimateCost({
      program: program({
        tuition: fact(
          { amountMinor: 100000, currency: "XXX", period: "year" as const },
          { class: "volatile" },
        ),
      }),
      costProfiles: [],
      budget: { amountMinor: 100000, currency: "XTS", period: "year" },
      now: NOW,
    });
    expect(r.budgetFit).toBe("unknown");
  });

  it("a range tuition produces min<max with incomeBased only when the basis says so", () => {
    const range = program({
      tuition: fact(
        {
          amountMinor: 100000,
          maxAmountMinor: 300000,
          currency: "XTS",
          period: "year" as const,
          basis: "income_based" as const,
        },
        { class: "volatile" },
      ),
    });
    const r = estimateCost({ program: range, costProfiles: [], budget: null, now: NOW });
    expect(r.lines[0]).toMatchObject({ firstYear: { min: 100000, max: 300000 }, incomeBased: true });
  });

  it("totals never convert across currencies (two currencies => two totals, first-appearance order)", () => {
    const city: CostProfile = costProfile("xx-test-cost-city", "xx-test-city", {
      housing: costLine(40000, 60000, "month", { currency: "XXX" }),
    });
    const country: CostProfile = costProfile("xx-test-cost-country", null, {
      food: costLine(20000, 30000, "month"),
    });
    const r = estimateCost({
      program: program({ city: "xx-test-city" }),
      costProfiles: [city, country],
      budget: null,
      now: NOW,
    });
    expect(r.totals).toEqual([
      { min: 300000, max: 400000, currency: "XTS" },
      { min: 400000, max: 600000, currency: "XXX" },
    ]);
  });

  it("a stale line still counts as present, so complete stays true", () => {
    const city: CostProfile = costProfile("xx-test-cost-city", "xx-test-city", {
      housing: costLine(40000, 60000, "month"),
      food: costLine(20000, 30000, "month"),
      transport: costLine(3000, 5000, "month"),
      insurance: costLine(10000, 20000, "year"),
      application_visa: costLine(5000, 9000, "once"),
      setup: costLine(20000, 40000, "once", { last_verified_at: "2024-01-01" }),
    });
    const r = estimateCost({ program: program(), costProfiles: [city], budget: null, now: NOW });
    expect(r.lines[6]).toMatchObject({ status: "ok", fact: { freshness: "stale" } });
    expect(r.complete).toBe(true);
  });
});

describe("filter semantics", () => {
  const f = (o: object = {}) => ({
    schemaVersion: 1 as const,
    fields: [] as string[],
    studyLanguages: [] as string[],
    destinations: [] as string[],
    institutionType: "any" as const,
    budget: null,
    ...o,
  });

  it("empty fields means all fields (never hides)", () => {
    expect(preferenceMismatches(f(), program(), NOW)).toEqual([]);
  });

  it("stale, non-official and unpublished teaching language never hides", () => {
    expect(
      preferenceMismatches(f({ studyLanguages: ["fr"] }), program({ teachingLanguages: fact(null) }), NOW),
    ).toEqual([]);
    expect(
      preferenceMismatches(
        f({ studyLanguages: ["fr"] }),
        program({ teachingLanguages: fact(["de"], staleMeta()) }),
        NOW,
      ),
    ).toEqual([]);
    expect(
      preferenceMismatches(
        f({ studyLanguages: ["fr"] }),
        program({ teachingLanguages: fact(["de"], { info_kind: "estimate" }) }),
        NOW,
      ),
    ).toEqual([]);
  });

  it("budget is never a filter", () => {
    const withBudget = f({ budget: { amountMinor: 1, currency: "XTS", period: "month" } });
    expect(filterPrograms(withBudget, [program()], NOW).excluded).toEqual([]);
  });
});

describe("checklist skip logic", () => {
  const MATCH = { programSlug: "xx-test-prog", status: "check", route: "direct", reasons: [] } as const;
  const gen = (o: Partial<ChecklistInput> = {}) =>
    generateChecklist({
      profile: profile(),
      program: program(),
      match: { ...MATCH, reasons: [] },
      channel: channel(),
      scholarships: [],
      now: NOW,
      ...o,
    });
  const step = (o: Partial<ChecklistInput>, id: string) =>
    gen(o).steps.find((s) => s.id === id);

  it("every fact stale: only the empty-scholarship step is skipped", () => {
    const input: Partial<ChecklistInput> = {
      program: program({
        documents: fact([{ slug: "d", name: "k", translationRequired: false }], staleMeta()),
        applicationChannel: fact("xx-test-channel", staleMeta()),
        requirements: requirements({
          coverage: "complete",
          fact: staleMeta(),
          rules: [rule("language_proficiency", { id: "l", language: "fr", minCefr: "B2", certificateRequired: true, acceptedTests: [], fact: staleMeta() })],
        }),
      }),
      channel: channel({ accountRequired: false, fact: staleMeta() }),
    };
    const skipped = gen(input)
      .steps.filter((s) => s.status === "skipped")
      .map((s) => s.id);
    expect(skipped).toEqual(["scholarships"]);
  });

  it("a language rule with certificateRequired:false and no certificate stays todo", () => {
    const p = profile({ languages: [{ language: "fr", level: "B2", certificate: null }] });
    const prog = program({
      requirements: requirements({
        rules: [rule("language_proficiency", { id: "l", language: "fr", minCefr: "B2", certificateRequired: false, acceptedTests: [] })],
      }),
    });
    const s = step({ profile: p, program: prog }, "language_exam");
    // documents today's behaviour; the match reason for this rule would be `pass`.
    expect(s).toMatchObject({ status: "todo" });
  });
});

describe("intake state machine", () => {
  it("a past dated deadline is never upcoming (closed)", () => {
    const r = nextIntake(
      program({
        intakes: fact([{ startDate: "2026-09-01", applicationOpens: null, applicationDeadline: "2026-01-01" }], { class: "volatile" }),
      }),
      NOW,
    );
    expect(r.kind).toBe("closed");
  });

  it("a recurring-only intake is guidance, never a dated upcoming status", () => {
    const r = nextIntake(
      program({
        intakes: fact([{ startDate: null, applicationOpens: null, applicationDeadline: null, recurringDeadline: { month: 7, day: 15 } }], { class: "volatile" }),
      }),
      NOW,
    );
    expect(r.kind).toBe("recurring");
    expect(JSON.stringify({ ...r, fact: null })).not.toMatch(/20\d\d-\d\d-\d\d/);
  });
});

describe("scholarships", () => {
  it("nationality filters a program-linked scholarship too", () => {
    const prog = program({ scholarships: ["xx-test-sch-a"] });
    const s = scholarship({ slug: "xx-test-sch-a", eligibleNationalities: ["XC"] });
    expect(scholarshipsForProgram(profile(), prog, [s])).toEqual([]);
  });

  it("a program-linked scholarship applies despite destination/field mismatch", () => {
    const prog = program({ scholarships: ["xx-test-sch-a"] });
    const s = scholarship({
      slug: "xx-test-sch-a",
      destinations: ["XC"],
      fields: ["xx-test-field-other"],
    });
    expect(scholarshipsForProgram(profile(), prog, [s]).map((x) => x.slug)).toEqual([
      "xx-test-sch-a",
    ]);
  });
});
