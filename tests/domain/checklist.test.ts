import { describe, expect, it } from "vitest";
import type { ChecklistInput } from "@/domain/checklist";
import { generateChecklist } from "@/domain/checklist";
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
