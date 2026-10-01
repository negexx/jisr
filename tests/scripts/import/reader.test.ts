import { describe, expect, it } from "vitest";

import type { Completion } from "../../../scripts/import/llm";
import type { Proposal, Verified } from "../../../scripts/import/proposals";
import {
  buildPrompt,
  extractJson,
  INSTRUCTION,
  keepChecked,
  MAX_PAGE_CHARS,
  pool,
  readProgramme,
  salvageProposal,
} from "../../../scripts/import/reader";

const meta = {
  slug: "nl-test-programme",
  name: "Applied Data Science",
  institution: "Test University of Applied Sciences",
  country: "NL",
  field: "computer-science",
};

describe("extractJson", () => {
  it("parses a bare object", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips a markdown fence", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("finds the object inside surrounding prose", () => {
    expect(extractJson('Here you go: {"a":{"b":2}} Hope that helps.')).toEqual({ a: { b: 2 } });
  });

  it("throws when there is no object", () => {
    expect(() => extractJson("no json here")).toThrow();
  });
});

describe("buildPrompt", () => {
  const shared = [{ url: "https://shared.example/studielink", text: "SHARED TEXT" }];
  const own = [
    { url: "https://own.example/programme", text: "PROGRAMME TEXT" },
    { url: "https://own.example/fees", text: "FEES TEXT" },
  ];

  it("keeps the fixed instruction as the system prompt", () => {
    expect(buildPrompt({ ...meta, shared, own }).system).toBe(INSTRUCTION);
  });

  it("puts the shared pages first, the programme's pages after and the task last, so the prefix caches", () => {
    const { user } = buildPrompt({ ...meta, shared, own });
    const at = (s: string) => user.indexOf(s);
    expect(at("SHARED TEXT")).toBeGreaterThanOrEqual(0);
    expect(at("SHARED TEXT")).toBeLessThan(at("PROGRAMME TEXT"));
    expect(at("PROGRAMME TEXT")).toBeLessThan(at("FEES TEXT"));
    expect(at("FEES TEXT")).toBeLessThan(at(meta.slug));
  });

  it("builds the same prefix for two programmes that share the same pages", () => {
    const a = buildPrompt({ ...meta, shared, own }).user;
    const b = buildPrompt({ ...meta, slug: "nl-other", shared, own: [] }).user;
    const prefix = a.slice(0, a.indexOf("=== PAGE https://own.example/programme"));
    expect(b.startsWith(prefix)).toBe(true);
  });

  it("lists a page once when it is both shared and the programme's own", () => {
    const { user } = buildPrompt({ ...meta, shared, own: [...own, ...shared] });
    expect(user.split("https://shared.example/studielink").length - 1).toBe(1);
  });

  it("cuts a page that is too long and says so", () => {
    const long = [{ url: "https://own.example/long", text: "x".repeat(MAX_PAGE_CHARS + 500) }];
    const { user } = buildPrompt({ ...meta, shared: [], own: long });
    expect(user).toContain("[page cut here]");
    expect(user).not.toContain("x".repeat(MAX_PAGE_CHARS + 1));
  });
});

const completion = (text: string): Completion => ({
  model: "fake",
  text,
  usage: { input: 100, cached: 0, output: 10 },
  costUsd: 0.0001,
  latencyMs: 5,
  ttftMs: 1,
  finishReason: "stop",
});

describe("readProgramme", () => {
  const page =
    "Applied Data Science is a 4 years programme taught in English. Apply via Studielink.";
  const pages = { "https://own.example/p": page };
  const getText = async (url: string) => {
    const text = pages[url as keyof typeof pages];
    if (text === undefined) throw new Error("no page");
    return text;
  };
  const model = { id: "fake", wire: "chat" as const, price: { input: 0, output: 0, cached: 0 } };

  it("returns the proposal and what the verifier accepted and rejected", async () => {
    const proposal = {
      slug: meta.slug,
      programmePage: "https://own.example/p",
      facts: {
        durationYears: {
          value: 4,
          evidence: [
            { url: "https://own.example/p", quote: "is a 4 years programme taught in English" },
          ],
        },
        teachingLanguages: {
          value: ["de"],
          evidence: [
            { url: "https://own.example/p", quote: "is a 4 years programme taught in English" },
          ],
        },
      },
    };
    const out = await readProgramme({
      ...meta,
      model,
      shared: [],
      own: [{ url: "https://own.example/p", text: page }],
      session: "s",
      getText,
      completeFn: async () => completion(JSON.stringify(proposal)),
    });
    expect(out.error).toBeNull();
    expect(Object.keys(out.verified?.facts ?? {})).toEqual(["durationYears"]);
    expect(out.verified?.rejected.map((r) => r.fact)).toEqual(["teachingLanguages"]);
  });

  it("reports unparseable output as an error instead of throwing", async () => {
    const out = await readProgramme({
      ...meta,
      model,
      shared: [],
      own: [],
      session: "s",
      getText,
      completeFn: async () => completion("I cannot help with that."),
    });
    expect(out.proposal).toBeNull();
    expect(out.error).toMatch(/json/i);
    expect(out.completion?.usage.output).toBe(10);
  });

  it("drops a fact the model wrote badly and still verifies the rest", async () => {
    const out = await readProgramme({
      ...meta,
      model,
      shared: [],
      own: [],
      session: "s",
      getText,
      completeFn: async () => completion('{"slug":"x","facts":{"durationYears":{"value":"four"}}}'),
    });
    expect(out.error).toBeNull();
    expect(out.dropped).toEqual(["facts.durationYears"]);
  });

  it("reports JSON that is not an object as a schema error", async () => {
    const out = await readProgramme({
      ...meta,
      model,
      shared: [],
      own: [],
      session: "s",
      getText,
      completeFn: async () => completion("[1,2,3]"),
    });
    expect(out.proposal).toBeNull();
    expect(out.error).toMatch(/schema/i);
  });

  it("forces the slug the programme has, whatever the model echoes", async () => {
    const out = await readProgramme({
      ...meta,
      model,
      shared: [],
      own: [],
      session: "s",
      getText,
      completeFn: async () =>
        completion('{"slug":"something-else","programmePage":null,"facts":{}}'),
    });
    expect(out.proposal?.slug).toBe(meta.slug);
  });
});

describe("salvageProposal", () => {
  const evidence = [
    { url: "https://own.example/p", quote: "is a 4 years programme taught in English" },
  ];

  it("keeps the good facts when another fact has no evidence, and reports what it dropped", () => {
    const { proposal, dropped } = salvageProposal({
      slug: "s",
      programmePage: null,
      facts: {
        durationYears: { value: 4, evidence },
        intakes: { value: [], evidence: [] },
        tuition: { value: null, evidence },
      },
    });
    expect(Object.keys(proposal?.facts ?? {})).toEqual(["durationYears"]);
    expect(dropped.sort()).toEqual(["facts.intakes", "facts.tuition"]);
  });

  it("wraps a bare rules array the model wrote instead of the requirements object", () => {
    const { proposal, dropped } = salvageProposal({
      slug: "s",
      programmePage: null,
      facts: {},
      requirements: [
        {
          kind: "language_proficiency",
          language: "fr",
          minCefr: "B2",
          certificateRequired: true,
          acceptedTests: ["tcf"],
          evidence,
        },
      ],
    });
    expect(proposal?.requirements?.rules).toHaveLength(1);
    expect(dropped).toEqual([]);
  });

  it("drops a language rule whose acceptedTests is null, because [] would mean any certificate passes", () => {
    const { proposal, dropped } = salvageProposal({
      slug: "s",
      programmePage: null,
      facts: {},
      requirements: {
        rules: [
          {
            kind: "language_proficiency",
            language: "fr",
            minCefr: "B2",
            certificateRequired: true,
            acceptedTests: null,
            evidence,
          },
        ],
      },
    });
    expect(proposal?.requirements?.rules).toEqual([]);
    expect(dropped).toEqual(["requirements.rules.0"]);
  });

  it("drops a rule that is invalid but keeps the others", () => {
    const { proposal, dropped } = salvageProposal({
      slug: "s",
      programmePage: null,
      facts: {},
      requirements: {
        rules: [
          { kind: "subject_taken", subjects: [], mode: "all", evidence },
          { kind: "prior_study_years_min", years: 12, evidence },
        ],
      },
    });
    expect(proposal?.requirements?.rules.map((r) => r.kind)).toEqual(["prior_study_years_min"]);
    expect(dropped).toEqual(["requirements.rules.0"]);
  });

  it("drops a programmePage that is not an https url instead of failing", () => {
    const { proposal, dropped } = salvageProposal({
      slug: "s",
      programmePage: "not a url",
      facts: {},
    });
    expect(proposal?.programmePage).toBeNull();
    expect(dropped).toEqual(["programmePage"]);
  });

  it("gives up on something that is not a proposal at all", () => {
    expect(salvageProposal({ slug: "s", facts: "nothing" }).proposal).toBeNull();
    expect(salvageProposal("text").proposal).toBeNull();
  });
});

describe("applicant context", () => {
  it("tells the model who the applicant is", () => {
    expect(INSTRUCTION).toMatch(/Moroccan/);
    expect(INSTRUCTION).toMatch(/non-EU|outside the EU/i);
  });

  it("explains the German channels in the task, after the pages", () => {
    const { user } = buildPrompt({ ...meta, country: "DE", shared: [], own: [] });
    expect(user).toMatch(/de-uni-assist-vpd/);
    expect(user).toMatch(/de-university-direct/);
  });

  it("leaves the French application channel to code", () => {
    const { user } = buildPrompt({ ...meta, country: "FR", shared: [], own: [] });
    expect(user).toMatch(/Do not output applicationChannel/);
  });

  it("keeps the instruction identical across countries so it stays cacheable", () => {
    expect(buildPrompt({ ...meta, country: "FR", shared: [], own: [] }).system).toBe(
      buildPrompt({ ...meta, country: "DE", shared: [], own: [] }).system,
    );
  });
});

describe("intakes with no dates", () => {
  const evidence = [
    { url: "https://own.example/p", quote: "Duur en startmoment 4 jaar, september" },
  ];

  it("drops an intake entry whose dates are all null, and the fact when nothing is left", () => {
    const { proposal, dropped } = salvageProposal({
      slug: "s",
      programmePage: null,
      facts: {
        intakes: {
          value: [{ startDate: null, applicationOpens: null, applicationDeadline: null }],
          evidence,
        },
      },
    });
    expect(proposal?.facts.intakes).toBeUndefined();
    expect(dropped).toEqual(["facts.intakes"]);
  });

  it("keeps the entries that do state a date", () => {
    const { proposal } = salvageProposal({
      slug: "s",
      programmePage: null,
      facts: {
        intakes: {
          value: [
            { startDate: null, applicationOpens: null, applicationDeadline: null },
            { startDate: null, applicationOpens: null, applicationDeadline: "2027-05-01" },
          ],
          evidence,
        },
      },
    });
    expect(proposal?.facts.intakes?.value).toHaveLength(1);
  });
});

describe("French programmes", () => {
  it("ignores an applicationChannel the model proposed, because the route data decides it", async () => {
    const page =
      "Applied Data Science is a 4 years programme. La candidature se fait sur la plateforme Parcoursup.";
    const proposal = {
      slug: meta.slug,
      programmePage: null,
      facts: {
        applicationChannel: {
          value: "fr-parcoursup",
          evidence: [
            {
              url: "https://own.example/p",
              quote: "La candidature se fait sur la plateforme Parcoursup.",
            },
          ],
        },
      },
    };
    const out = await readProgramme({
      ...meta,
      country: "FR",
      model: { id: "fake", wire: "chat", price: { input: 0, output: 0, cached: 0 } },
      shared: [],
      own: [],
      session: "s",
      getText: async () => page,
      completeFn: async () => completion(JSON.stringify(proposal)),
    });
    expect(out.verified?.facts.applicationChannel).toBeUndefined();
    expect(out.dropped).toContain("facts.applicationChannel");
  });
});

describe("pool", () => {
  it("runs every item with the given concurrency", async () => {
    const seen: number[] = [];
    let running = 0;
    let peak = 0;
    await pool([1, 2, 3, 4, 5, 6], 3, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      seen.push(n);
      running--;
    });
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("after a failure starts nothing new, waits for the calls in flight and then rethrows", async () => {
    const finished: number[] = [];
    const started: number[] = [];
    await expect(
      pool([1, 2, 3, 4, 5, 6], 2, async (n) => {
        started.push(n);
        if (n === 1) throw new Error("budget");
        await new Promise((r) => setTimeout(r, 30));
        finished.push(n);
      }),
    ).rejects.toThrow("budget");
    expect(finished).toContain(2);
    expect(started).toEqual([1, 2]);
  });
});

describe("keepChecked", () => {
  const ev = [{ url: "https://x.example/p", quote: "some quote of some length" }];
  const proposal: Proposal = {
    slug: "s",
    programmePage: null,
    facts: {
      durationYears: { value: 3, evidence: ev },
      teachingLanguages: { value: ["en"], evidence: ev },
    },
    requirements: {
      rules: [
        { kind: "prior_study_years_min", years: 12, evidence: ev },
        { kind: "subject_taken", subjects: ["mathematics"], mode: "all", evidence: ev },
      ],
    },
  };

  it("removes from the proposal what the checker removed, so a later verify cannot bring it back", () => {
    const checked: Verified = {
      programmePage: null,
      facts: { durationYears: { value: 3, evidence: ev } },
      rejected: [],
      requirements: [
        { kind: "subject_taken", subjects: ["mathematics"], mode: "all", evidence: ev },
      ],
    };
    const kept = keepChecked(proposal, checked);
    expect(Object.keys(kept.facts)).toEqual(["durationYears"]);
    expect(kept.requirements?.rules.map((r) => r.kind)).toEqual(["subject_taken"]);
  });

  it("drops the whole requirements block when no rule is left", () => {
    const kept = keepChecked(proposal, { programmePage: null, facts: {}, rejected: [] });
    expect(kept.facts).toEqual({});
    expect(kept.requirements).toBeUndefined();
  });
});

describe("duration wording in the instruction", () => {
  it("shows half years, so 7 semesters is not rounded to 3 or 4 years", () => {
    expect(INSTRUCTION).toMatch(/7 semesters = 3\.5/);
    expect(INSTRUCTION).toMatch(/210 ECTS = 3\.5/);
  });
});
