import { describe, expect, it } from "vitest";

import type { Completion } from "../../../scripts/import/llm";
import type { Proposal, Verified } from "../../../scripts/import/proposals";
import {
  buildPrompt,
  extractJson,
  flagValue,
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

  it("lets the reader use an institution-wide fee page for a Dutch programme, under strict conditions, after the pages", () => {
    const { user, system } = buildPrompt({ ...meta, shared, own });
    expect(user).toContain("instellingscollegegeld");
    expect(user).toContain("wettelijk collegegeld");
    expect(user.indexOf("instellingscollegegeld")).toBeGreaterThan(user.indexOf("FEES TEXT"));
    expect(buildPrompt({ ...meta, shared, own, studyYear: 2027 }).user).toContain("2027-2028");
    expect(buildPrompt({ ...meta, shared, own, studyYear: 2027 }).user).not.toContain(
      "{STUDY_YEAR}",
    );
    expect(user).toContain("own page always wins");
    expect(user).toContain("m.u.v.");
    expect(user).toContain("Give two quotes");
    expect(system).toBe(INSTRUCTION);
    for (const country of ["FR", "DE"])
      expect(buildPrompt({ ...meta, country, shared, own }).user).not.toContain(
        "instellingscollegegeld",
      );
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

  it("explains the Hungarian channels and the fee currency in the task, after the pages", () => {
    const { user } = buildPrompt({ ...meta, country: "HU", shared: [], own: [] });
    expect(user).toMatch(/hu-university-direct/);
    expect(user).toMatch(/hu-stipendium-hungaricum/);
    expect(user).toMatch(/HUF/);
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

describe("readProgramme and the pages the model was given", () => {
  const supplied = "https://own.example/p";
  const aggregator = "https://aggregator.example/uni";
  const page = "Applied Data Science is a 4 years programme. Tuition: EUR 1,500 per semester.";
  const model = { id: "fake", wire: "chat" as const, price: { input: 0, output: 0, cached: 0 } };
  const quote = (url: string, text: string) => ({ url, quote: text });
  const read = (proposal: unknown) =>
    readProgramme({
      ...meta,
      model,
      shared: [],
      own: [{ url: supplied, text: page }],
      session: "s",
      getText: async () => page,
      completeFn: async () => completion(JSON.stringify(proposal)),
    });

  it("drops evidence from a page the model was not given, and the fact if nothing remains", async () => {
    const out = await read({
      slug: meta.slug,
      programmePage: supplied,
      facts: {
        durationYears: {
          value: 4,
          evidence: [
            quote(aggregator, "is a 4 years programme"),
            quote(supplied, "is a 4 years programme"),
          ],
        },
        tuition: {
          value: { amountMinor: 150000, currency: "EUR", period: "semester" },
          evidence: [quote(aggregator, "Tuition: EUR 1,500 per semester")],
        },
      },
    });
    expect(out.proposal?.facts.durationYears?.evidence).toEqual([
      quote(supplied, "is a 4 years programme"),
    ]);
    expect(out.proposal?.facts.tuition).toBeUndefined();
    expect(Object.keys(out.verified?.facts ?? {})).toEqual(["durationYears"]);
    expect(out.dropped).toEqual([
      `facts.durationYears.evidence:${aggregator}`,
      `facts.tuition.evidence:${aggregator}`,
      "facts.tuition",
    ]);
  });

  it("drops the same from a requirement rule and an unsupplied programme page", async () => {
    const out = await read({
      slug: meta.slug,
      programmePage: aggregator,
      facts: {},
      requirements: {
        rules: [
          { kind: "prior_study_years_min", years: 12, evidence: [quote(aggregator, "12 years")] },
          {
            kind: "manual_check",
            note: "Check the page",
            evidence: [quote(supplied, "is a 4 years programme")],
          },
        ],
      },
    });
    expect(out.proposal?.programmePage).toBeNull();
    expect(out.proposal?.requirements?.rules.map((r) => r.kind)).toEqual(["manual_check"]);
    expect([...out.dropped].sort()).toEqual(
      [
        "programmePage",
        `requirements.rules.0.evidence:${aggregator}`,
        "requirements.rules.0",
      ].sort(),
    );
  });

  it("keeps what the model proposed, before the filter, for diagnosis", async () => {
    const out = await read({
      slug: meta.slug,
      programmePage: supplied,
      facts: {
        tuition: {
          value: { amountMinor: 150000, currency: "EUR", period: "semester" },
          evidence: [quote(aggregator, "Tuition: EUR 1,500 per semester")],
        },
      },
    });
    expect(out.proposal?.facts.tuition).toBeUndefined();
    expect(out.rawProposal?.facts.tuition?.evidence).toEqual([
      quote(aggregator, "Tuition: EUR 1,500 per semester"),
    ]);
  });

  it("leaves a proposal that only cites supplied pages untouched", async () => {
    const out = await read({
      slug: meta.slug,
      programmePage: supplied,
      facts: { durationYears: { value: 4, evidence: [quote(supplied, "is a 4 years programme")] } },
    });
    expect(out.dropped).toEqual([]);
    expect(out.proposal?.programmePage).toBe(supplied);
  });
});

describe("readProgramme matches cited urls to the supplied ones by canonical form", () => {
  const model = { id: "fake", wire: "chat" as const, price: { input: 0, output: 0, cached: 0 } };
  const page = "Applied Data Science is a 4 years programme taught in English.";
  const quoteText = "is a 4 years programme";
  const readWith = (suppliedUrl: string, cited: string) =>
    readProgramme({
      ...meta,
      model,
      shared: [],
      own: [{ url: suppliedUrl, text: page }],
      session: "s",
      getText: async (url) => {
        if (url !== suppliedUrl) throw new Error(`verifier fetched ${url}`);
        return page;
      },
      completeFn: async () =>
        completion(
          JSON.stringify({
            slug: meta.slug,
            programmePage: cited,
            facts: { durationYears: { value: 4, evidence: [{ url: cited, quote: quoteText }] } },
          }),
        ),
    });

  it.each([
    [
      "an &amp; in the supplied url cited with &",
      "https://u.example/p?a=1&amp;b=2",
      "https://u.example/p?a=1&b=2",
    ],
    [
      "tracking parameters in the supplied url",
      "https://u.example/p?id=3&utm_source=x&mtm_campaign=y",
      "https://u.example/p?id=3",
    ],
    ["a trailing slash", "https://u.example/p/", "https://u.example/p"],
    ["a bare question mark and a fragment", "https://u.example/p?#top", "https://u.example/p"],
    ["the host case", "https://U.Example/p", "https://u.example/p"],
  ])("keeps evidence when the difference is only %s, and rewrites it to the supplied string", async (_label, suppliedUrl, cited) => {
    const out = await readWith(suppliedUrl, cited);
    expect(out.dropped).toEqual([]);
    expect(out.proposal?.programmePage).toBe(suppliedUrl);
    expect(out.proposal?.facts.durationYears?.evidence).toEqual([
      { url: suppliedUrl, quote: quoteText },
    ]);
    expect(Object.keys(out.verified?.facts ?? {})).toEqual(["durationYears"]);
  });

  it.each([
    ["another path", "https://u.example/p", "https://u.example/q"],
    ["another host", "https://u.example/p", "https://other.example/p"],
    ["another query parameter", "https://u.example/p?id=3", "https://u.example/p?id=4"],
    ["another path case", "https://u.example/Programme", "https://u.example/programme"],
  ])("still drops evidence for %s", async (_label, suppliedUrl, cited) => {
    const out = await readWith(suppliedUrl, cited);
    expect(out.dropped).toContain(`facts.durationYears.evidence:${cited}`);
    expect(out.dropped).toContain("programmePage");
    expect(out.proposal?.facts.durationYears).toBeUndefined();
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

describe("manual_check note length", () => {
  const evidence = [
    { url: "https://own.example/p", quote: "Les attendus sont des prérequis généraux" },
  ];
  const rule = (fr: string, en = "short") => ({
    kind: "manual_check",
    note: { fr, en },
    evidence,
  });

  it("tells the model how long a note may be", () => {
    expect(INSTRUCTION).toMatch(/300 characters/);
  });

  it("drops a note longer than the schema allows instead of failing the record later", () => {
    const { proposal, dropped } = salvageProposal({
      slug: "s",
      programmePage: null,
      facts: {},
      requirements: { rules: [rule("x".repeat(401)), rule("court")] },
    });
    expect(proposal?.requirements?.rules).toHaveLength(1);
    expect(dropped).toEqual(["requirements.rules.0"]);
  });

  it("checks every language of the note", () => {
    const { proposal, dropped } = salvageProposal({
      slug: "s",
      programmePage: null,
      facts: {},
      requirements: { rules: [rule("court", "y".repeat(401))] },
    });
    expect(proposal?.requirements?.rules).toHaveLength(0);
    expect(dropped).toEqual(["requirements.rules.0"]);
  });

  it("keeps a note of exactly the limit", () => {
    const { proposal } = salvageProposal({
      slug: "s",
      programmePage: null,
      facts: {},
      requirements: { rules: [rule("x".repeat(400))] },
    });
    expect(proposal?.requirements?.rules).toHaveLength(1);
  });
});

describe("a required certificate with no accepted tests", () => {
  const evidence = [
    { url: "https://own.example/p", quote: "Please provide an official language certificate." },
  ];
  const rule = (extra: Record<string, unknown>) => ({
    kind: "language_proficiency",
    language: "en",
    minCefr: "B2",
    certificateRequired: true,
    acceptedTests: [],
    evidence,
    ...extra,
  });

  it("becomes 'certificate requirement unknown' instead of 'any certificate counts'", () => {
    const { proposal, dropped } = salvageProposal({
      slug: "s",
      programmePage: null,
      facts: {},
      requirements: { rules: [rule({})] },
    });
    const kept = proposal?.requirements?.rules[0];
    expect(kept?.kind === "language_proficiency" && kept.certificateRequired).toBeNull();
    expect(kept?.kind === "language_proficiency" && kept.minCefr).toBe("B2");
    expect(dropped).toEqual([]);
  });

  it("leaves a rule that names its tests alone", () => {
    const { proposal } = salvageProposal({
      slug: "s",
      programmePage: null,
      facts: {},
      requirements: { rules: [rule({ acceptedTests: ["ielts"] })] },
    });
    const kept = proposal?.requirements?.rules[0];
    expect(kept?.kind === "language_proficiency" && kept.certificateRequired).toBe(true);
  });

  it("also treats a model's 'no certificate needed' as unknown, because nothing can verify a negative", () => {
    const { proposal } = salvageProposal({
      slug: "s",
      programmePage: null,
      facts: {},
      requirements: { rules: [rule({ certificateRequired: false })] },
    });
    const kept = proposal?.requirements?.rules[0];
    expect(kept?.kind === "language_proficiency" && kept.certificateRequired).toBeNull();
  });
});

describe("flagValue", () => {
  it("is undefined when the flag is absent", () => {
    expect(flagValue(["--model", "x"], "check")).toBeUndefined();
  });

  it("returns the value after the flag", () => {
    expect(flagValue(["--check", "qwen3.7-plus"], "check")).toBe("qwen3.7-plus");
  });

  it("refuses a flag with no value or whose value is another flag (a trailing --base must not mean 'none')", () => {
    expect(() => flagValue(["--base"], "base")).toThrow(/needs a value/);
    expect(() => flagValue(["--base", "--dry-run"], "base")).toThrow(/needs a value/);
  });
});

describe("documents fact in the reader", () => {
  const withDocuments = (value: unknown) => ({
    slug: "s",
    programmePage: null,
    facts: {
      documents: {
        value,
        evidence: [{ url: "https://uni.example/apply", quote: "a CV and a passport copy" }],
      },
    },
  });
  const item = (slug: string, translationRequired: boolean | null) => ({
    slug,
    name: { fr: "CV" },
    quotedAs: "CV",
    translationRequired,
  });

  it("describes the fact in the instruction", () => {
    expect(INSTRUCTION).toMatch(/documents:/);
  });

  it("turns an unverifiable translationRequired false into null", () => {
    const { proposal } = salvageProposal(withDocuments([item("cv", false)]));
    expect(proposal?.facts.documents?.value[0]?.translationRequired).toBeNull();
  });

  it("requires quotedAs in the instruction", () => {
    expect(INSTRUCTION).toMatch(/quotedAs/);
  });

  it("turns a missing translationRequired into null instead of dropping the fact", () => {
    const { proposal, dropped } = salvageProposal(
      withDocuments([{ slug: "cv", name: { fr: "CV" }, quotedAs: "CV" }]),
    );
    expect(proposal?.facts.documents?.value[0]?.translationRequired).toBeNull();
    expect(dropped).toEqual([]);
  });

  it("drops the documents fact when two items share a slug", () => {
    const { proposal, dropped } = salvageProposal(
      withDocuments([item("cv", null), item("cv", null)]),
    );
    expect(proposal?.facts.documents).toBeUndefined();
    expect(dropped).toContain("facts.documents");
  });
});

describe("deadline instruction", () => {
  it("tells the reader that a deadline needs a quote for international applicants", () => {
    expect(INSTRUCTION).toMatch(/applicationDeadline is the deadline of the NON-EU/);
    expect(INSTRUCTION).toMatch(/general deadline/i);
  });
});

describe("recurring deadline", () => {
  const evidence = [{ url: "https://own.example/p", quote: "Non-EU applicants: apply by 15 July" }];
  const salvageIntakes = (items: unknown[]) =>
    salvageProposal({
      slug: "s",
      programmePage: null,
      facts: { intakes: { value: items, evidence } },
    });

  it("tells the reader to write a deadline without a year as recurringDeadline", () => {
    expect(INSTRUCTION).toContain("recurringDeadline");
    expect(INSTRUCTION).toContain(
      "Write a start or opening date, or a dated deadline, only if the quote states day, month and YEAR",
    );
    expect(INSTRUCTION).toContain("If the quote states a year, never use recurringDeadline.");
  });

  it("keeps an item that has only a recurring deadline", () => {
    const { proposal, dropped } = salvageIntakes([
      {
        startDate: null,
        applicationOpens: null,
        applicationDeadline: null,
        recurringDeadline: { month: 7, day: 15 },
      },
    ]);
    expect(proposal?.facts.intakes?.value).toHaveLength(1);
    expect(dropped).toEqual([]);
  });

  it("still drops an item whose dates and recurring deadline are all null", () => {
    const { proposal, dropped } = salvageIntakes([
      {
        startDate: null,
        applicationOpens: null,
        applicationDeadline: null,
        recurringDeadline: null,
      },
    ]);
    expect(proposal?.facts.intakes).toBeUndefined();
    expect(dropped).toEqual(["facts.intakes"]);
  });
});
