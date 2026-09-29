import { describe, expect, it } from "vitest";
import type { Cefr } from "@/data-schema/primitives";
import type { ChecklistInput } from "@/domain/checklist";
import { generateChecklist } from "@/domain/checklist";
import type { MatchResult, Reason } from "@/domain/types";
import { CHECKLIST_STEP_IDS } from "@/domain/types";
import {
  channel,
  deepFreeze,
  estimateMeta,
  fact,
  meta,
  NOW,
  profile,
  program,
  refKey,
  requirements,
  rule,
  scholarship,
  staleMeta,
} from "../fixtures/domain/builders";

const MATCH = {
  programSlug: "xx-test-prog",
  status: "check",
  route: "direct",
  reasons: [],
} as const;
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
const step = (o: Partial<ChecklistInput>, id: (typeof CHECKLIST_STEP_IDS)[number]) => {
  const s = gen(o).steps.find((x) => x.id === id);
  if (!s) throw new Error(id);
  return s;
};
const docs = (flags: Array<boolean | null>, m = meta()) =>
  fact(
    flags.map((t, i) => ({ slug: `xx-test-doc-${i}`, name: `k${i}`, translationRequired: t })),
    m,
  );
const lang = (acceptedTests: string[], m = meta()) =>
  rule("language_proficiency", {
    id: "l-fr",
    language: "fr",
    minCefr: "B2",
    certificateRequired: true,
    acceptedTests,
    fact: m,
  });

describe("generateChecklist", () => {
  it("always ten steps in fixed order", () => {
    expect(gen().steps.map((s) => s.id)).toEqual([...CHECKLIST_STEP_IDS]);
    expect(
      gen({ program: program({ documents: fact(null), intakes: fact(null) }), channel: null })
        .steps,
    ).toHaveLength(10);
  });

  it.each([
    ["documents known", {}, "documents", "todo", "applies"],
    [
      "documents unpublished",
      { program: program({ documents: fact(null) }) },
      "documents",
      "todo",
      "unknown_data",
    ],
    ["translation required", {}, "translation", "todo", "applies"],
    [
      "translation none required, decisive",
      { program: program({ documents: docs([false, false]) }) },
      "translation",
      "skipped",
      "not_required_by_source",
    ],
    [
      "translation none required, stale",
      { program: program({ documents: docs([false], staleMeta()) }) },
      "translation",
      "todo",
      "unknown_data",
    ],
    [
      "translation none required, estimate",
      { program: program({ documents: docs([false], estimateMeta()) }) },
      "translation",
      "todo",
      "unknown_data",
    ],
    [
      "translation one unknown",
      { program: program({ documents: docs([false, null]) }) },
      "translation",
      "todo",
      "unknown_data",
    ],
    [
      "translation docs unpublished",
      { program: program({ documents: fact(null) }) },
      "translation",
      "todo",
      "unknown_data",
    ],
    [
      "translation empty document list",
      { program: program({ documents: docs([]) }) },
      "translation",
      "todo",
      "unknown_data",
    ],
    [
      "language: cert held & accepted",
      { program: program({ requirements: requirements({ rules: [lang(["xx-test-cert-fr"])] }) }) },
      "language_exam",
      "skipped",
      "certificate_held",
    ],
    [
      "language: cert held, any test accepted",
      { program: program({ requirements: requirements({ rules: [lang([])] }) }) },
      "language_exam",
      "skipped",
      "certificate_held",
    ],
    [
      "language: cert not accepted",
      {
        program: program({ requirements: requirements({ rules: [lang(["xx-test-cert-other"])] }) }),
      },
      "language_exam",
      "todo",
      "applies",
    ],
    [
      "language: accepted but rule stale",
      {
        program: program({
          requirements: requirements({ rules: [lang(["xx-test-cert-fr"], staleMeta())] }),
        }),
      },
      "language_exam",
      "todo",
      "applies",
    ],
    [
      "language: no rules, complete, decisive",
      {},
      "language_exam",
      "skipped",
      "not_required_by_source",
    ],
    [
      "language: no rules, partial",
      { program: program({ requirements: requirements({ coverage: "partial" }) }) },
      "language_exam",
      "todo",
      "unknown_data",
    ],
    [
      "language: no rules, requirements stale",
      { program: program({ requirements: requirements({ fact: staleMeta() }) }) },
      "language_exam",
      "todo",
      "unknown_data",
    ],
    ["account required", {}, "application_account", "todo", "applies"],
    [
      "no account, decisive",
      { channel: channel({ accountRequired: false }) },
      "application_account",
      "skipped",
      "no_account_required",
    ],
    [
      "no account, stale",
      { channel: channel({ accountRequired: false, fact: staleMeta() }) },
      "application_account",
      "todo",
      "unknown_data",
    ],
    [
      "account requirement unpublished",
      { channel: channel({ accountRequired: null }) },
      "application_account",
      "todo",
      "unknown_data",
    ],
    ["channel missing", { channel: null }, "application_account", "todo", "unknown_data"],
    ["submit upcoming", {}, "submit", "todo", "applies"],
    [
      "submit closed",
      {
        program: program({
          intakes: fact(
            [{ startDate: null, applicationOpens: null, applicationDeadline: "2026-01-01" }],
            { class: "volatile" },
          ),
        }),
      },
      "submit",
      "todo",
      "applies",
    ],
    [
      "submit unknown",
      { program: program({ intakes: fact(null, { class: "volatile" }) }) },
      "submit",
      "todo",
      "unknown_data",
    ],
    ["scholarships none", {}, "scholarships", "skipped", "no_scholarships_listed"],
    ["scholarships listed", { scholarships: [scholarship()] }, "scholarships", "todo", "applies"],
    ["financial documents", {}, "financial_documents", "todo", "applies"],
    ["accommodation", {}, "accommodation", "todo", "applies"],
    ["visa", {}, "visa", "todo", "applies"],
    ["departure", {}, "departure", "todo", "applies"],
  ] as const)("%s", (_n, o, id, status, reason) =>
    expect(step({ ...o } as Partial<ChecklistInput>, id)).toMatchObject({ status, reason }));

  it("submit carries deadline and channel", () => {
    expect(step({}, "submit")).toMatchObject({
      deadline: "2027-01-15",
      channel: "xx-test-channel",
    });
    expect(
      step({ program: program({ intakes: fact([], { class: "volatile" }) }) }, "submit").deadline,
    ).toBeNull();
  });

  it("scholarships sorted, facts are deadlines", () => {
    const s = step(
      {
        scholarships: [
          scholarship({ slug: "xx-test-sch-b" }),
          scholarship({ slug: "xx-test-sch-a" }),
        ],
      },
      "scholarships",
    );
    expect(s.scholarships).toEqual(["xx-test-sch-a", "xx-test-sch-b"]);
    expect(s.facts.map(refKey)).toEqual([
      "scholarships/xx-test-sch-a#deadline",
      "scholarships/xx-test-sch-b#deadline",
    ]);
  });

  it("fact refs follow the record conventions", () => {
    const withRules = program({
      requirements: requirements({ rules: [lang(["xx-test-cert-fr"])] }),
    });
    const c = gen({ program: withRules });
    const facts = (id: (typeof CHECKLIST_STEP_IDS)[number]) =>
      c.steps.find((s) => s.id === id)?.facts.map(refKey);
    expect(facts("documents")).toEqual(["programs/xx-test-prog#documents"]);
    expect(facts("translation")).toEqual(["programs/xx-test-prog#documents"]);
    expect(facts("language_exam")).toEqual([
      "programs/xx-test-prog#requirements.rules.l-fr",
      "programs/xx-test-prog#requirements",
    ]);
    expect(facts("application_account")).toEqual([
      "programs/xx-test-prog#applicationChannel",
      "application-channels/xx-test-channel#",
    ]);
    expect(facts("submit")).toEqual([
      "programs/xx-test-prog#intakes",
      "programs/xx-test-prog#applicationChannel",
    ]);
    expect(facts("financial_documents")).toEqual([]);
  });

  it("optional keys appear only on their steps", () => {
    const c = gen({ scholarships: [scholarship()] });
    const withKey = (key: "deadline" | "channel" | "scholarships") =>
      c.steps.filter((s) => key in s).map((s) => s.id);
    expect(withKey("deadline")).toEqual(["submit"]);
    expect(withKey("channel")).toEqual(["application_account", "submit"]);
    expect(withKey("scholarships")).toEqual(["scholarships"]);
  });

  it("does not mutate its input", () => {
    const input = deepFreeze<ChecklistInput>({
      profile: profile(),
      program: program({ requirements: requirements({ rules: [lang([])] }) }),
      match: { ...MATCH, reasons: [] },
      channel: channel(),
      scholarships: [
        scholarship({ slug: "xx-test-sch-b" }),
        scholarship({ slug: "xx-test-sch-a" }),
      ],
      now: NOW,
    });
    expect(() => generateChecklist(input)).not.toThrow();
  });

  it("never skips on unknown data (all-null inputs)", () => {
    const c = gen({
      program: program({
        documents: fact(null),
        intakes: fact(null),
        requirements: requirements({ coverage: "partial", fact: estimateMeta() }),
      }),
      channel: channel({ accountRequired: null }),
      scholarships: [scholarship()],
    });
    expect(c.steps.filter((s) => s.status === "skipped")).toEqual([]);
  });
});

describe("generateChecklist language_exam", () => {
  const langRule = (
    o: {
      id?: string;
      language?: string;
      minCefr?: "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | null;
      acceptedTests?: string[];
      fact?: ReturnType<typeof meta>;
    } = {},
  ) =>
    rule("language_proficiency", {
      id: o.id ?? "l-fr",
      language: o.language ?? "fr",
      minCefr: o.minCefr === undefined ? "B2" : o.minCefr,
      certificateRequired: true,
      acceptedTests: o.acceptedTests ?? [],
      fact: o.fact ?? meta(),
    });
  const langReason = (ruleId: string, outcome: "pass" | "fail" | "unknown"): Reason => ({
    ruleId,
    kind: "language_proficiency",
    outcome,
    code: outcome === "pass" ? "ok" : "missing_student_value",
    facts: [],
  });
  const student = (
    ...languages: Array<{ language: string; level: Cefr | "unknown"; certificate: string | null }>
  ) => profile({ languages });
  const B2_CERT = { language: "fr", level: "B2", certificate: "xx-test-cert-fr" } as const;
  const withRules = (...rules: ReturnType<typeof langRule>[]) =>
    program({ requirements: requirements({ rules }) });
  const matchOf = (route: MatchResult["route"], reasons: Reason[] = []): MatchResult => ({
    ...MATCH,
    route,
    reasons,
  });
  const exam = (o: Partial<ChecklistInput>) => step(o, "language_exam");

  it.each([
    [
      "level below minCefr with a certificate",
      { profile: student({ ...B2_CERT, level: "A2" }), program: withRules(langRule()) },
      "todo",
      "applies",
    ],
    [
      "level unknown",
      { profile: student({ ...B2_CERT, level: "unknown" }), program: withRules(langRule()) },
      "todo",
      "applies",
    ],
    [
      "minCefr unpublished",
      { profile: student(B2_CERT), program: withRules(langRule({ minCefr: null })) },
      "todo",
      "applies",
    ],
    [
      "level meets minCefr with accepted certificate",
      { profile: student({ ...B2_CERT, level: "C1" }), program: withRules(langRule()) },
      "skipped",
      "certificate_held",
    ],
    [
      "level exactly at minCefr",
      { profile: student(B2_CERT), program: withRules(langRule()) },
      "skipped",
      "certificate_held",
    ],
    [
      "route condition language reason failed",
      {
        program: withRules(langRule()),
        match: matchOf("direct", [langReason("route:xx-test-cond", "fail")]),
      },
      "todo",
      "applies",
    ],
    [
      "route condition language reason unknown",
      {
        program: withRules(langRule()),
        match: matchOf("direct", [langReason("route:xx-test-cond", "unknown")]),
      },
      "todo",
      "applies",
    ],
    [
      "route condition language reason passed",
      {
        profile: student(B2_CERT),
        program: withRules(langRule()),
        match: matchOf("direct", [langReason("route:xx-test-cond", "pass")]),
      },
      "skipped",
      "certificate_held",
    ],
    [
      "no program rules, route language condition present",
      { match: matchOf("direct", [langReason("route:xx-test-cond", "pass")]) },
      "todo",
      "applies",
    ],
    [
      "no program rules, route foundation",
      { match: matchOf("foundation") },
      "todo",
      "unknown_data",
    ],
    [
      "no program rules, route not_eligible",
      { match: matchOf("not_eligible") },
      "todo",
      "unknown_data",
    ],
    ["no program rules, route missing", { match: matchOf("missing") }, "todo", "unknown_data"],
    [
      "no program rules, route check, no language reasons",
      { match: matchOf("check") },
      "skipped",
      "not_required_by_source",
    ],
    [
      "language rule is an estimate",
      {
        profile: student(B2_CERT),
        program: withRules(langRule({ fact: estimateMeta() })),
      },
      "todo",
      "applies",
    ],
    [
      "requirements fact is an estimate, complete, no rules",
      { program: program({ requirements: requirements({ fact: estimateMeta() }) }) },
      "todo",
      "unknown_data",
    ],
    [
      "one fresh and one stale rule",
      {
        profile: student(B2_CERT, { language: "en", level: "B2", certificate: "xx-test-cert-en" }),
        program: withRules(langRule(), langRule({ id: "l-en", language: "en", fact: staleMeta() })),
      },
      "todo",
      "applies",
    ],
    [
      "two languages, only one certificate held",
      {
        profile: student(B2_CERT, { language: "en", level: "B2", certificate: null }),
        program: withRules(langRule(), langRule({ id: "l-en", language: "en" })),
      },
      "todo",
      "applies",
    ],
    [
      "two languages, both held",
      {
        profile: student(B2_CERT, { language: "en", level: "B2", certificate: "xx-test-cert-en" }),
        program: withRules(langRule(), langRule({ id: "l-en", language: "en" })),
      },
      "skipped",
      "certificate_held",
    ],
    [
      "rule language has no profile entry",
      {
        profile: student({ language: "en", level: "C1", certificate: "xx-test-cert-en" }),
        program: withRules(langRule()),
      },
      "todo",
      "applies",
    ],
    [
      "certificate is null",
      {
        profile: student({ ...B2_CERT, certificate: null }),
        program: withRules(langRule()),
      },
      "todo",
      "applies",
    ],
  ] as const)("%s", (_n, o, status, reason) =>
    expect(exam({ ...o } as Partial<ChecklistInput>)).toMatchObject({ status, reason }));

  it("channel estimate with accountRequired false stays todo", () => {
    expect(
      step(
        { channel: channel({ accountRequired: false, fact: estimateMeta() }) },
        "application_account",
      ),
    ).toMatchObject({ status: "todo", reason: "unknown_data" });
  });
});
