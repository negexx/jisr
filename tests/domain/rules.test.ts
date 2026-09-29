import { describe, expect, it } from "vitest";
import type { ResolvedRule } from "@/data-schema/resolved";
import type { RuleContext } from "@/domain/rules";
import { evaluateRules } from "@/domain/rules";
import {
  conv20to100,
  conv20toLower,
  credentialType,
  ctx,
  deepFreeze,
  estimateMeta,
  meta,
  profile,
  refKey,
  rule,
  scale20,
  scale100,
  staleMeta,
} from "../fixtures/domain/builders";

const P = "programs/xx-test-prog#requirements.rules.";
const one = (r: ResolvedRule, c: Partial<RuleContext> = {}) => {
  const out = evaluateRules([r], ctx(c));
  expect(out).toHaveLength(1);
  const [reason] = out;
  if (!reason) throw new Error("no reason");
  return reason;
};
type Row = [string, ResolvedRule, Partial<RuleContext>, string, string, string[]];
const check = (rows: Row[]) =>
  it.each(rows)("%s", (_n, r, c, outcome, code, facts) => {
    const reason = one(r, c);
    expect({
      outcome: reason.outcome,
      code: reason.code,
      facts: reason.facts.map(refKey),
    }).toEqual({ outcome, code, facts });
    expect(reason.ruleId).toBe(r.id);
    expect(reason.kind).toBe(r.kind);
  });

const g = (id: string, threshold: number | null, scale = "xx-test-scale-20", m = meta()) =>
  rule("overall_grade_min", { id, scale, threshold, fact: m });
const S20 = "grading-scales/xx-test-scale-20#";
const S100 = "grading-scales/xx-test-scale-100#";
const SL = "grading-scales/xx-test-scale-lower#";
const C100 = "grade-conversions/xx-test-conv-20-100#";
const CL = "grade-conversions/xx-test-conv-20-lower#";
const withOverall = (value: number | null) => ({
  profile: profile({
    credential: { overall: value === null ? null : { scale: "xx-test-scale-20", value } },
  }),
});
const expectedStatus = (overall: number | null = 14) => ({
  profile: profile({
    credential: {
      status: "expected",
      overall: overall === null ? null : { scale: "xx-test-scale-20", value: overall },
    },
  }),
});

describe("evaluateRules: order and shape", () => {
  it("returns [] for no rules", () => expect(evaluateRules([], ctx())).toEqual([]));
  it("one reason per rule, same order", () => {
    const rs = [g("r-b", 12), rule("prior_study_years_min", { id: "r-a", years: 1 })];
    expect(evaluateRules(rs, ctx()).map((r) => r.ruleId)).toEqual(["r-b", "r-a"]);
  });
  it("uses record + pathPrefix for the rule FactRef", () => {
    const r = one(g("r-x", 12), {
      record: "admission-routes/xx-test-route",
      pathPrefix: "conditions",
    });
    expect(r.facts.map(refKey)[0]).toBe("admission-routes/xx-test-route#conditions.r-x");
  });
  it("does not mutate rules or context", () => {
    const rs = deepFreeze([
      g("r", 65, "xx-test-scale-100"),
      rule("manual_check", { id: "m", note: "k" }),
    ]);
    const c = deepFreeze(ctx());
    expect(() => evaluateRules(rs, c)).not.toThrow();
  });
  it("omits optional keys that have no value", () => {
    const r = one(rule("manual_check", { id: "m", note: "k" }));
    expect(Object.keys(r).sort()).toEqual(["code", "facts", "kind", "note", "outcome", "ruleId"]);
  });
});

describe("credential_type_in / credential_track_in", () => {
  check([
    [
      "type accepted",
      rule("credential_type_in", { id: "t", types: ["xx-test-cred"] }),
      {},
      "pass",
      "ok",
      [`${P}t`],
    ],
    [
      "type rejected",
      rule("credential_type_in", { id: "t", types: ["xx-test-other"] }),
      {},
      "fail",
      "track_not_accepted",
      [`${P}t`],
    ],
    [
      "type rejected but stale",
      rule("credential_type_in", { id: "t", types: ["xx-test-other"], fact: staleMeta() }),
      {},
      "unknown",
      "stale_source",
      [`${P}t`],
    ],
    [
      "type accepted but estimate",
      rule("credential_type_in", { id: "t", types: ["xx-test-cred"], fact: estimateMeta() }),
      {},
      "unknown",
      "non_official_source",
      [`${P}t`],
    ],
    [
      "track accepted",
      rule("credential_track_in", { id: "k", tracks: ["xx-test-track-sci"] }),
      {},
      "pass",
      "ok",
      [`${P}k`],
    ],
    [
      "track rejected",
      rule("credential_track_in", { id: "k", tracks: ["xx-test-track-lit"] }),
      {},
      "fail",
      "track_not_accepted",
      [`${P}k`],
    ],
    [
      "track accepted but guidance",
      rule("credential_track_in", {
        id: "k",
        tracks: ["xx-test-track-sci"],
        fact: meta({ info_kind: "guidance" }),
      }),
      {},
      "unknown",
      "non_official_source",
      [`${P}k`],
    ],
    [
      "expected status does not affect credential rules",
      rule("credential_type_in", { id: "t", types: ["xx-test-cred"] }),
      expectedStatus(),
      "pass",
      "ok",
      [`${P}t`],
    ],
  ]);
  it("reports student and required values", () => {
    expect(
      one(rule("credential_type_in", { id: "t", types: ["xx-test-a", "xx-test-b"] })),
    ).toMatchObject({
      student: "xx-test-cred",
      required: ["xx-test-a", "xx-test-b"],
    });
    expect(
      one(rule("credential_track_in", { id: "k", tracks: ["xx-test-track-lit"] })),
    ).toMatchObject({
      student: "xx-test-track-sci",
      required: ["xx-test-track-lit"],
    });
  });
});

describe("overall_grade_min", () => {
  check([
    ["same scale pass 14>=12", g("r", 12), {}, "pass", "ok", [`${P}r`, S20]],
    ["same scale equal 12>=12", g("r", 12), withOverall(12), "pass", "ok", [`${P}r`, S20]],
    [
      "same scale fail 11<12",
      g("r", 12),
      withOverall(11),
      "fail",
      "below_threshold",
      [`${P}r`, S20],
    ],
    [
      "missing overall",
      g("r", 12),
      withOverall(null),
      "unknown",
      "missing_student_value",
      [`${P}r`, S20],
    ],
    ["threshold unpublished", g("r", null), {}, "unknown", "threshold_unpublished", [`${P}r`, S20]],
    [
      "missing beats unpublished",
      g("r", null),
      withOverall(null),
      "unknown",
      "missing_student_value",
      [`${P}r`, S20],
    ],
    [
      "unknown rule scale",
      g("r", 12, "xx-test-scale-missing"),
      {},
      "unknown",
      "no_scale_conversion",
      [`${P}r`],
    ],
    [
      "no conversion 20→100 absent",
      g("r", 65, "xx-test-scale-100"),
      { gradeConversions: [] },
      "unknown",
      "no_scale_conversion",
      [`${P}r`, S100],
    ],
    [
      "linear 14→70 >= 65",
      g("r", 65, "xx-test-scale-100"),
      {},
      "pass",
      "ok",
      [`${P}r`, S100, C100],
    ],
    [
      "linear 14→70 < 75",
      g("r", 75, "xx-test-scale-100"),
      {},
      "fail",
      "below_threshold",
      [`${P}r`, S100, C100],
    ],
    [
      "lower_better 14→2.8 > 2.5 fails",
      g("r", 2.5, "xx-test-scale-lower"),
      {},
      "fail",
      "below_threshold",
      [`${P}r`, SL, CL],
    ],
    [
      "lower_better 16→2.2 <= 2.5 passes",
      g("r", 2.5, "xx-test-scale-lower"),
      withOverall(16),
      "pass",
      "ok",
      [`${P}r`, SL, CL],
    ],
    [
      "truncation 15.5→2.3 <= 2.3 passes",
      g("r", 2.3, "xx-test-scale-lower"),
      withOverall(15.5),
      "pass",
      "ok",
      [`${P}r`, SL, CL],
    ],
    [
      "expected status turns pass into unknown",
      g("r", 12),
      expectedStatus(),
      "unknown",
      "missing_student_value",
      [`${P}r`, S20],
    ],
    [
      "expected status turns fail into unknown",
      g("r", 12),
      expectedStatus(9),
      "unknown",
      "missing_student_value",
      [`${P}r`, S20],
    ],
    [
      "expected status keeps threshold_unpublished",
      g("r", null),
      expectedStatus(),
      "unknown",
      "threshold_unpublished",
      [`${P}r`, S20],
    ],
    [
      "expected status keeps no_scale_conversion",
      g("r", 65, "xx-test-scale-100"),
      { ...expectedStatus(), gradeConversions: [] },
      "unknown",
      "no_scale_conversion",
      [`${P}r`, S100],
    ],
    [
      "expected beats stale (expected code applied before downgrade)",
      g("r", 12, "xx-test-scale-20", staleMeta()),
      expectedStatus(),
      "unknown",
      "missing_student_value",
      [`${P}r`, S20],
    ],
    [
      "stale rule fact pass",
      g("r", 12, "xx-test-scale-20", staleMeta()),
      {},
      "unknown",
      "stale_source",
      [`${P}r`, S20],
    ],
    [
      "estimate rule fact fail",
      g("r", 12, "xx-test-scale-20", estimateMeta()),
      withOverall(9),
      "unknown",
      "non_official_source",
      [`${P}r`, S20],
    ],
    [
      "stale scale fact",
      g("r", 12),
      { gradingScales: [{ ...scale20, fact: staleMeta() }] },
      "unknown",
      "stale_source",
      [`${P}r`, S20],
    ],
    [
      "estimate scale fact",
      g("r", 12),
      { gradingScales: [{ ...scale20, fact: estimateMeta() }] },
      "unknown",
      "non_official_source",
      [`${P}r`, S20],
    ],
    [
      "stale conversion fact",
      g("r", 65, "xx-test-scale-100"),
      { gradeConversions: [{ ...conv20to100, fact: staleMeta() }] },
      "unknown",
      "stale_source",
      [`${P}r`, S100, C100],
    ],
    [
      "stale target scale fact with conversion",
      g("r", 65, "xx-test-scale-100"),
      { gradingScales: [{ ...scale100, fact: staleMeta() }] },
      "unknown",
      "stale_source",
      [`${P}r`, S100, C100],
    ],
    [
      "official conversion fact passes",
      g("r", 2.5, "xx-test-scale-lower"),
      withOverall(16),
      "pass",
      "ok",
      [`${P}r`, SL, CL],
    ],
    [
      "guidance conversion fact downgrades",
      g("r", 2.5, "xx-test-scale-lower"),
      {
        ...withOverall(16),
        gradeConversions: [{ ...conv20toLower, fact: meta({ info_kind: "guidance" }) }],
      },
      "unknown",
      "non_official_source",
      [`${P}r`, SL, CL],
    ],
    [
      "unused stale conversion fact does not downgrade a same-scale result",
      g("r", 12),
      { gradeConversions: [{ ...conv20to100, fact: staleMeta() }] },
      "pass",
      "ok",
      [`${P}r`, S20],
    ],
    [
      "stale + estimate → stale_source",
      g("r", 12, "xx-test-scale-20", staleMeta({ info_kind: "estimate" })),
      {},
      "unknown",
      "stale_source",
      [`${P}r`, S20],
    ],
    [
      "estimate + unpublished keeps own code",
      g("r", null, "xx-test-scale-20", estimateMeta()),
      {},
      "unknown",
      "threshold_unpublished",
      [`${P}r`, S20],
    ],
  ]);

  it("reports student, converted and required", () => {
    expect(one(g("r", 65, "xx-test-scale-100"))).toMatchObject({
      student: { scale: "xx-test-scale-20", value: 14 },
      studentConverted: { scale: "xx-test-scale-100", value: 70 },
      required: 65,
    });
  });
  it("omits studentConverted on the same scale", () =>
    expect(one(g("r", 12))).not.toHaveProperty("studentConverted"));
  it("omits student when missing", () =>
    expect(one(g("r", 12), withOverall(null))).not.toHaveProperty("student"));
  it("omits required when the threshold is unpublished", () =>
    expect(one(g("r", null))).not.toHaveProperty("required"));
  it("keeps student values when expected status downgrades the outcome", () => {
    expect(one(g("r", 12), expectedStatus())).toMatchObject({
      student: { scale: "xx-test-scale-20", value: 14 },
      required: 12,
    });
  });
});

const sg = (id: string, subject: string, threshold: number | null, m = meta()) =>
  rule("subject_grade_min", { id, subject, scale: "xx-test-scale-20", threshold, fact: m });
describe("subject_grade_min", () => {
  check([
    ["math 15>=12", sg("s", "xx-test-math", 12), {}, "pass", "ok", [`${P}s`, S20]],
    ["math 15<16", sg("s", "xx-test-math", 16), {}, "fail", "below_threshold", [`${P}s`, S20]],
    [
      "no chemistry entry",
      sg("s", "xx-test-chem", 12),
      {},
      "unknown",
      "missing_student_value",
      [`${P}s`, S20],
    ],
    [
      "unpublished",
      sg("s", "xx-test-math", null),
      {},
      "unknown",
      "threshold_unpublished",
      [`${P}s`, S20],
    ],
    [
      "expected status turns pass into unknown",
      sg("s", "xx-test-math", 12),
      expectedStatus(),
      "unknown",
      "missing_student_value",
      [`${P}s`, S20],
    ],
    [
      "expected status turns fail into unknown",
      sg("s", "xx-test-math", 16),
      expectedStatus(),
      "unknown",
      "missing_student_value",
      [`${P}s`, S20],
    ],
    [
      "stale scale fact",
      sg("s", "xx-test-math", 12),
      { gradingScales: [{ ...scale20, fact: staleMeta() }] },
      "unknown",
      "stale_source",
      [`${P}s`, S20],
    ],
    [
      "estimate rule fact",
      sg("s", "xx-test-math", 16, estimateMeta()),
      {},
      "unknown",
      "non_official_source",
      [`${P}s`, S20],
    ],
  ]);
  it("reports student and required values", () => {
    expect(one(sg("s", "xx-test-math", 12))).toMatchObject({
      student: { scale: "xx-test-scale-20", value: 15 },
      required: 12,
    });
  });
});

const CT = "credential-types/xx-test-cred#";
const st = (id: string, subjects: string[], mode: "all" | "any", m = meta()) =>
  rule("subject_taken", { id, subjects, mode, fact: m });
describe("subject_taken", () => {
  check([
    ["all [math] taken", st("t", ["xx-test-math"], "all"), {}, "pass", "ok", [`${P}t`]],
    [
      "any [math, chem]",
      st("t", ["xx-test-math", "xx-test-chem"], "any"),
      {},
      "pass",
      "ok",
      [`${P}t`],
    ],
    [
      "all [math, physics]: not listed but curriculum has it",
      st("t", ["xx-test-math", "xx-test-physics"], "all"),
      {},
      "unknown",
      "missing_student_value",
      [`${P}t`],
    ],
    [
      "all [chem]: curriculum lacks it",
      st("t", ["xx-test-chem"], "all"),
      {},
      "fail",
      "track_not_accepted",
      [`${P}t`, CT],
    ],
    [
      "any [chem, bio]: curriculum lacks both",
      st("t", ["xx-test-chem", "xx-test-bio"], "any"),
      {},
      "fail",
      "track_not_accepted",
      [`${P}t`, CT],
    ],
    [
      "any [physics, chem]: not listed but curriculum has physics",
      st("t", ["xx-test-physics", "xx-test-chem"], "any"),
      {},
      "unknown",
      "missing_student_value",
      [`${P}t`],
    ],
    [
      "track with null curriculum",
      st("t", ["xx-test-chem"], "all"),
      { profile: profile({ credential: { track: "xx-test-track-lit", subjects: [] } }) },
      "unknown",
      "missing_student_value",
      [`${P}t`],
    ],
    [
      "unknown credential type",
      st("t", ["xx-test-chem"], "all"),
      { profile: profile({ credential: { type: "xx-test-other" } }) },
      "unknown",
      "missing_student_value",
      [`${P}t`],
    ],
    [
      "unknown track of known type",
      st("t", ["xx-test-chem"], "all"),
      { profile: profile({ credential: { track: "xx-test-track-missing" } }) },
      "unknown",
      "missing_student_value",
      [`${P}t`],
    ],
    [
      "curriculum fail but credential type stale",
      st("t", ["xx-test-chem"], "all"),
      { credentialTypes: [credentialType({ fact: staleMeta() })] },
      "unknown",
      "stale_source",
      [`${P}t`, CT],
    ],
    [
      "curriculum fail but rule estimate",
      st("t", ["xx-test-chem"], "all", estimateMeta()),
      {},
      "unknown",
      "non_official_source",
      [`${P}t`, CT],
    ],
    [
      "student-listed pass ignores credential type staleness",
      st("t", ["xx-test-math"], "all"),
      { credentialTypes: [credentialType({ fact: staleMeta() })] },
      "pass",
      "ok",
      [`${P}t`],
    ],
    [
      "expected status does not affect subject_taken",
      st("t", ["xx-test-math"], "all"),
      expectedStatus(),
      "pass",
      "ok",
      [`${P}t`],
    ],
  ]);
  it("reports taken subjects and required subjects", () => {
    expect(one(st("t", ["xx-test-chem"], "all"))).toMatchObject({
      student: ["xx-test-math"],
      required: ["xx-test-chem"],
    });
  });
});

const lp = (o: {
  minCefr?: "B1" | "B2" | "C1" | null;
  certificateRequired?: boolean | null;
  acceptedTests?: string[];
  language?: string;
  fact?: ReturnType<typeof meta>;
}) =>
  rule("language_proficiency", {
    id: "l",
    language: o.language ?? "fr",
    minCefr: o.minCefr === undefined ? "B2" : o.minCefr,
    certificateRequired: o.certificateRequired === undefined ? false : o.certificateRequired,
    acceptedTests: o.acceptedTests ?? [],
    ...(o.fact ? { fact: o.fact } : {}),
  });
const langs = (level: "B2" | "unknown", certificate: string | null) => ({
  profile: profile({ languages: [{ language: "fr", level, certificate }] }),
});
describe("language_proficiency", () => {
  check([
    ["no entry for de", lp({ language: "de" }), {}, "unknown", "missing_student_value", [`${P}l`]],
    [
      "level unknown",
      lp({}),
      langs("unknown", null),
      "unknown",
      "missing_student_value",
      [`${P}l`],
    ],
    [
      "level unknown beats unpublished",
      lp({ minCefr: null }),
      langs("unknown", null),
      "unknown",
      "missing_student_value",
      [`${P}l`],
    ],
    [
      "minCefr unpublished",
      lp({ minCefr: null }),
      {},
      "unknown",
      "threshold_unpublished",
      [`${P}l`],
    ],
    ["B2 < C1", lp({ minCefr: "C1" }), {}, "fail", "below_threshold", [`${P}l`]],
    [
      "below minCefr fails even when certificate is unpublished",
      lp({ minCefr: "C1", certificateRequired: null }),
      {},
      "fail",
      "below_threshold",
      [`${P}l`],
    ],
    ["B2 >= B2, no cert required", lp({ minCefr: "B2" }), {}, "pass", "ok", [`${P}l`]],
    ["B2 >= B1, no cert required", lp({ minCefr: "B1" }), {}, "pass", "ok", [`${P}l`]],
    [
      "cert required, held and accepted",
      lp({ certificateRequired: true, acceptedTests: ["xx-test-cert-fr"] }),
      {},
      "pass",
      "ok",
      [`${P}l`],
    ],
    [
      "cert required, held but not accepted",
      lp({ certificateRequired: true, acceptedTests: ["xx-test-cert-other"] }),
      {},
      "unknown",
      "missing_student_value",
      [`${P}l`],
    ],
    [
      "cert required, any test, cert held",
      lp({ certificateRequired: true, acceptedTests: [] }),
      {},
      "pass",
      "ok",
      [`${P}l`],
    ],
    [
      "cert required, none held",
      lp({ certificateRequired: true }),
      langs("B2", null),
      "unknown",
      "missing_student_value",
      [`${P}l`],
    ],
    [
      "cert requirement unpublished",
      lp({ certificateRequired: null }),
      {},
      "unknown",
      "threshold_unpublished",
      [`${P}l`],
    ],
    [
      "fail but stale",
      lp({ minCefr: "C1", fact: staleMeta() }),
      {},
      "unknown",
      "stale_source",
      [`${P}l`],
    ],
    [
      "pass but estimate",
      lp({ minCefr: "B1", fact: estimateMeta() }),
      {},
      "unknown",
      "non_official_source",
      [`${P}l`],
    ],
    [
      "expected status does not affect language rules",
      lp({ minCefr: "B1" }),
      expectedStatus(),
      "pass",
      "ok",
      [`${P}l`],
    ],
  ]);
  it("reports student level and required minCefr", () => {
    expect(one(lp({ minCefr: "C1" }))).toMatchObject({ student: "B2", required: "C1" });
  });
  it("omits student when there is no entry and required when unpublished", () => {
    const r = one(lp({ language: "de", minCefr: null }));
    expect(r).not.toHaveProperty("student");
    expect(r).not.toHaveProperty("required");
  });
  it("reports level unknown as the student value", () => {
    expect(one(lp({}), langs("unknown", null))).toMatchObject({ student: "unknown" });
  });
});

describe("prior_study_years_min / manual_check", () => {
  check([
    [
      "0 < 1",
      rule("prior_study_years_min", { id: "y", years: 1 }),
      {},
      "fail",
      "below_threshold",
      [`${P}y`],
    ],
    [
      "1 >= 1",
      rule("prior_study_years_min", { id: "y", years: 1 }),
      { profile: profile({ priorHigherEducationYears: 1 }) },
      "pass",
      "ok",
      [`${P}y`],
    ],
    [
      "2 >= 1",
      rule("prior_study_years_min", { id: "y", years: 1 }),
      { profile: profile({ priorHigherEducationYears: 2 }) },
      "pass",
      "ok",
      [`${P}y`],
    ],
    [
      "estimate",
      rule("prior_study_years_min", { id: "y", years: 1, fact: estimateMeta() }),
      {},
      "unknown",
      "non_official_source",
      [`${P}y`],
    ],
    [
      "manual",
      rule("manual_check", { id: "m", note: "programs/xx-test-prog#requirements.rules.m.note" }),
      {},
      "unknown",
      "manual_check",
      [`${P}m`],
    ],
    [
      "manual with stale fact keeps its own code",
      rule("manual_check", { id: "m", note: "k", fact: staleMeta() }),
      {},
      "unknown",
      "manual_check",
      [`${P}m`],
    ],
  ]);
  it("manual_check carries note", () =>
    expect(one(rule("manual_check", { id: "m", note: "k" })).note).toBe("k"));
  it("prior_study_years_min reports student and required numbers", () => {
    expect(one(rule("prior_study_years_min", { id: "y", years: 2 }))).toMatchObject({
      student: 0,
      required: 2,
    });
  });
});
