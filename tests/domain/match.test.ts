import { describe, expect, it } from "vitest";
import type { AdmissionRoute, Program, ResolvedRule } from "@/data-schema/resolved";
import { aggregateMatchStatus, matchProgram } from "@/domain/match";
import { resolveRoute } from "@/domain/route";
import type { Reason } from "@/domain/types";
import {
  deepFreeze,
  estimateMeta,
  meta,
  NOW,
  profile,
  program,
  reference,
  refKey,
  requirements,
  route,
  rule,
  staleMeta,
} from "../fixtures/domain/builders";

const run = (routes: AdmissionRoute[], p: Program = program(), prof = profile()) =>
  matchProgram({ profile: prof, program: p, routes, reference: reference(), now: NOW });
const brief = (rs: Reason[]) => rs.map((r) => `${r.ruleId}:${r.outcome}:${r.code}`);
const failRule = rule("prior_study_years_min", { id: "r-fail", years: 1 });
const passRule = rule("credential_type_in", { id: "r-pass", types: ["xx-test-cred"] });
const withRules = (...rules: ResolvedRule[]) => program({ requirements: requirements({ rules }) });

describe("resolveRoute", () => {
  it.each([
    ["exact match", [route()], "XB", "xx-test-route"],
    ["destination mismatch", [route({ destination: "XC" })], "XB", null],
    ["origin mismatch", [route({ origin: "XC" })], "XB", null],
    ["credential type mismatch", [route({ credentialType: "xx-test-other" })], "XB", null],
    [
      "first of several matches",
      [route({ slug: "xx-test-route-a" }), route({ slug: "xx-test-route-b" })],
      "XB",
      "xx-test-route-a",
    ],
    ["no routes", [], "XB", null],
  ] as const)("%s", (_n, routes, dest, slug) =>
    expect(resolveRoute(profile(), dest, [...routes])?.slug ?? null).toBe(slug));
});

describe("matchProgram route handling", () => {
  it.each([
    ["direct, no rules", [route()], program(), "satisfied", "direct", ["route:pass:ok"]],
    [
      "direct but stale route",
      [route({ fact: staleMeta() })],
      program(),
      "check",
      "direct",
      ["route:unknown:stale_source"],
    ],
    [
      "direct but estimate route",
      [route({ fact: estimateMeta() })],
      program(),
      "check",
      "direct",
      ["route:unknown:non_official_source"],
    ],
    [
      "missing route, rules still evaluated",
      [],
      withRules(passRule),
      "check",
      "missing",
      ["route:unknown:route_check", "r-pass:pass:ok"],
    ],
    [
      "missing route + failing rule",
      [],
      withRules(failRule),
      "not_satisfied",
      "missing",
      ["route:unknown:route_check", "r-fail:fail:below_threshold"],
    ],
    [
      "check route, rules evaluated",
      [route({ outcome: "check" })],
      withRules(passRule),
      "check",
      "check",
      ["route:unknown:route_check", "r-pass:pass:ok"],
    ],
    [
      "foundation short-circuits",
      [route({ outcome: "foundation" })],
      program({ requirements: requirements({ coverage: "partial", rules: [failRule] }) }),
      "check",
      "foundation",
      ["route:unknown:route_foundation"],
    ],
    [
      "not_eligible decisive",
      [route({ outcome: "not_eligible" })],
      withRules(passRule),
      "not_satisfied",
      "not_eligible",
      ["route:fail:route_not_eligible"],
    ],
    [
      "not_eligible stale",
      [route({ outcome: "not_eligible", fact: staleMeta() })],
      withRules(passRule),
      "check",
      "not_eligible",
      ["route:unknown:stale_source"],
    ],
    [
      "not_eligible guidance",
      [route({ outcome: "not_eligible", fact: meta({ info_kind: "guidance" }) })],
      program(),
      "check",
      "not_eligible",
      ["route:unknown:non_official_source"],
    ],
    [
      "direct + failing condition",
      [
        route({
          conditions: [rule("prior_study_years_min", { id: "xx-test-cond", years: 1 })],
        }),
      ],
      program(),
      "not_satisfied",
      "direct",
      ["route:pass:ok", "route:xx-test-cond:fail:below_threshold"],
    ],
    [
      "foundation skips conditions",
      [route({ outcome: "foundation", conditions: [failRule] })],
      program(),
      "check",
      "foundation",
      ["route:unknown:route_foundation"],
    ],
    [
      "direct + failing program rule",
      [route()],
      withRules(failRule),
      "not_satisfied",
      "direct",
      ["route:pass:ok", "r-fail:fail:below_threshold"],
    ],
    [
      "coverage partial",
      [route()],
      program({ requirements: requirements({ coverage: "partial", rules: [passRule] }) }),
      "check",
      "direct",
      ["route:pass:ok", "r-pass:pass:ok", "coverage:unknown:coverage_partial"],
    ],
    [
      "requirements fact stale, complete (A2)",
      [route()],
      program({ requirements: requirements({ fact: staleMeta() }) }),
      "check",
      "direct",
      ["route:pass:ok", "coverage:unknown:stale_source"],
    ],
    [
      "requirements fact estimate, complete (A2)",
      [route()],
      program({ requirements: requirements({ fact: estimateMeta() }) }),
      "check",
      "direct",
      ["route:pass:ok", "coverage:unknown:non_official_source"],
    ],
    [
      "coverage partial wins over stale requirements fact code",
      [route()],
      program({ requirements: requirements({ coverage: "partial", fact: staleMeta() }) }),
      "check",
      "direct",
      ["route:pass:ok", "coverage:unknown:coverage_partial"],
    ],
    [
      "decisive fail wins over stale elsewhere",
      [route({ fact: staleMeta() })],
      withRules(failRule),
      "not_satisfied",
      "direct",
      ["route:unknown:stale_source", "r-fail:fail:below_threshold"],
    ],
    [
      "all rules pass, direct, complete",
      [route()],
      withRules(passRule),
      "satisfied",
      "direct",
      ["route:pass:ok", "r-pass:pass:ok"],
    ],
    [
      "manual_check keeps result at check",
      [route()],
      withRules(rule("manual_check", { id: "m", note: "programs/xx-test-prog#m" })),
      "check",
      "direct",
      ["route:pass:ok", "m:unknown:manual_check"],
    ],
  ] as const)("%s", (_n, routes, p, status, routeOutcome, reasons) => {
    const r = run([...routes], p);
    expect({
      status: r.status,
      route: r.route,
      reasons: brief(r.reasons),
      programSlug: r.programSlug,
    }).toEqual({ status, route: routeOutcome, reasons: [...reasons], programSlug: "xx-test-prog" });
  });

  it("orders route, conditions, program rules in data order, coverage", () => {
    const rb = rule("prior_study_years_min", { id: "r-b", years: 0 });
    const ra = rule("prior_study_years_min", { id: "r-a", years: 0 });
    const r = run(
      [route({ conditions: [rule("prior_study_years_min", { id: "c-1", years: 0 })] })],
      program({ requirements: requirements({ coverage: "partial", rules: [rb, ra] }) }),
    );
    expect(r.reasons.map((x) => x.ruleId)).toEqual([
      "route",
      "route:c-1",
      "r-b",
      "r-a",
      "coverage",
    ]);
  });

  it("route and condition FactRefs", () => {
    const r = run([
      route({ conditions: [rule("prior_study_years_min", { id: "c-1", years: 0 })] }),
    ]);
    expect(r.reasons[0]?.facts.map(refKey)).toEqual(["admission-routes/xx-test-route#"]);
    expect(r.reasons[1]?.facts.map(refKey)).toEqual([
      "admission-routes/xx-test-route#conditions.c-1",
    ]);
  });

  it("program rule FactRefs use the program record and requirements.rules prefix", () => {
    const r = run([route()], withRules(passRule));
    expect(r.reasons[1]?.facts.map(refKey)).toEqual([
      "programs/xx-test-prog#requirements.rules.r-pass",
    ]);
  });

  it("route reasons carry the route FactRef, missing route carries none", () => {
    expect(run([route({ outcome: "foundation" })]).reasons[0]?.facts.map(refKey)).toEqual([
      "admission-routes/xx-test-route#",
    ]);
    expect(run([route({ outcome: "not_eligible" })]).reasons[0]?.facts.map(refKey)).toEqual([
      "admission-routes/xx-test-route#",
    ]);
    expect(run([]).reasons[0]?.facts).toEqual([]);
  });

  it("coverage reason cites the requirements fact", () => {
    const r = run([route()], program({ requirements: requirements({ coverage: "partial" }) }));
    expect(r.reasons.at(-1)).toMatchObject({
      kind: "coverage",
      facts: [{ record: "programs/xx-test-prog", path: "requirements" }],
    });
  });

  it("stale requirements fact on complete coverage cites the requirements fact", () => {
    const r = run([route()], program({ requirements: requirements({ fact: staleMeta() }) }));
    expect(r.reasons.at(-1)).toMatchObject({
      kind: "coverage",
      facts: [{ record: "programs/xx-test-prog", path: "requirements", freshness: "stale" }],
    });
  });

  it("route note is carried", () => {
    expect(
      run([route({ outcome: "foundation", note: "admission-routes/xx-test-route#note" })])
        .reasons[0]?.note,
    ).toBe("admission-routes/xx-test-route#note");
  });

  it("route note is carried on not_eligible, check and direct, absent when null", () => {
    const note = "admission-routes/xx-test-route#note";
    for (const outcome of ["not_eligible", "check", "direct"] as const) {
      expect(run([route({ outcome, note })]).reasons[0]?.note).toBe(note);
    }
    expect(run([route()]).reasons[0]).not.toHaveProperty("note");
  });

  it("does not mutate frozen inputs", () => {
    const input = deepFreeze({
      profile: profile(),
      program: withRules(passRule, failRule),
      routes: [route({ conditions: [passRule] })],
      reference: reference(),
      now: NOW,
    });
    expect(() => matchProgram(input)).not.toThrow();
  });
});

describe("aggregateMatchStatus", () => {
  const R = (outcome: Reason["outcome"]): Reason => ({
    ruleId: "x",
    kind: "route",
    outcome,
    code: "ok",
    facts: [],
  });
  it.each([
    [[], "check"],
    [[R("pass")], "satisfied"],
    [[R("pass"), R("unknown")], "check"],
    [[R("unknown"), R("fail")], "not_satisfied"],
    [[R("fail"), R("pass")], "not_satisfied"],
  ] as const)("%j → %s", (rs, s) => expect(aggregateMatchStatus([...rs])).toBe(s));
});

describe("invariants over a matrix", () => {
  const outcomes = ["missing", "direct", "check", "foundation", "not_eligible"] as const;
  const routeMetas = [meta(), staleMeta(), estimateMeta()];
  const ruleSets = [
    [],
    [passRule],
    [failRule],
    [{ ...passRule, fact: staleMeta() }],
    [{ ...failRule, fact: staleMeta() }],
    [rule("manual_check", { id: "m", note: "k" })],
    [passRule, failRule],
    [{ ...passRule, fact: estimateMeta() }],
  ];
  const conditionSets = [[], [passRule], [failRule], [{ ...passRule, fact: staleMeta() }]];
  const coverages = ["complete", "partial"] as const;
  const reqMetas = [meta(), staleMeta(), estimateMeta()];
  const cases = outcomes.flatMap((o) =>
    routeMetas.flatMap((rm) =>
      conditionSets.flatMap((cs) =>
        ruleSets.flatMap((rs) =>
          coverages.flatMap((cov) => reqMetas.map((qm) => ({ o, rm, cs, rs, cov, qm }))),
        ),
      ),
    ),
  );
  const decisiveFact = (f: { info_kind: string; freshness: string }) =>
    f.info_kind === "official" && f.freshness !== "stale";

  it("matrix is large enough to be meaningful", () => {
    expect(cases.length).toBe(5 * 3 * 4 * 8 * 2 * 3);
    expect(cases.length).toBeGreaterThanOrEqual(600);
  });

  it(`holds for ${cases.length} combinations`, () => {
    const seen = { satisfied: 0, check: 0, not_satisfied: 0 };
    for (const { o, rm, cs, rs, cov, qm } of cases) {
      const routes = o === "missing" ? [] : [route({ outcome: o, fact: rm, conditions: cs })];
      const r = run(
        routes,
        program({ requirements: requirements({ coverage: cov, fact: qm, rules: rs }) }),
      );
      seen[r.status] += 1;
      const facts = r.reasons.flatMap((x) => x.facts);
      if (r.status === "satisfied") {
        expect(r.reasons.every((x) => x.outcome === "pass")).toBe(true);
        expect(facts.every(decisiveFact)).toBe(true);
        expect(cov).toBe("complete");
        expect(r.route).toBe("direct");
        expect(qm.info_kind === "official" && qm.last_verified_at === meta().last_verified_at).toBe(
          true,
        );
      }
      if (r.status === "not_satisfied") {
        expect(r.reasons.some((x) => x.outcome === "fail" && x.facts.every(decisiveFact))).toBe(
          true,
        );
      }
      if (r.reasons.some((x) => x.outcome === "fail")) {
        expect(
          r.reasons.filter((x) => x.outcome === "fail").every((x) => x.facts.every(decisiveFact)),
        ).toBe(true);
      }
      if (facts.length > 0 && facts.every((f) => f.freshness === "stale") && o !== "missing") {
        expect(r.status).toBe("check");
      }
      if (facts.length > 0 && facts.every((f) => f.freshness === "stale")) {
        expect(r.status).not.toBe("satisfied");
      }
    }
    expect(seen.satisfied).toBeGreaterThan(0);
    expect(seen.check).toBeGreaterThan(0);
    expect(seen.not_satisfied).toBeGreaterThan(0);
  });
});
