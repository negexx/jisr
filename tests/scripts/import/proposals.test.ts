import { describe, expect, it } from "vitest";

import {
  applyRecord,
  applyVerified,
  type Proposal,
  ProposalSchema,
  stillPlaceholder,
  verifyChannel,
  verifyInstitution,
  verifyProposal,
} from "../../../scripts/import/proposals";
import { READ_SOURCE } from "../../../scripts/import/staging";

const PAGE = "https://uni.example/cs";
const FEES = "https://uni.example/fees";
const pages: Record<string, string> = {
  [PAGE]:
    "Applied Computer Science, B.Sc. The programme lasts six semesters and is taught entirely in English. Apply by 15 July 2027.",
  [FEES]: "Tuition fees for non-EU students: €1,500 per semester.",
};
const getText = async (url: string) => {
  const text = pages[url];
  if (text === undefined) throw new Error("404");
  return text;
};

const proposal = (facts: Proposal["facts"], programmePage: string | null = PAGE): Proposal =>
  ProposalSchema.parse({ slug: "p", programmePage, facts });

describe("verifyProposal", () => {
  it("accepts facts whose quote is on the page and whose value agrees with it", async () => {
    const v = await verifyProposal(
      proposal({
        durationYears: {
          value: 3,
          evidence: [{ url: PAGE, quote: "The programme lasts six semesters" }],
        },
        teachingLanguages: {
          value: ["en"],
          evidence: [{ url: PAGE, quote: "taught entirely in English" }],
        },
        tuition: {
          value: { amountMinor: 150000, currency: "EUR", period: "semester" },
          evidence: [{ url: FEES, quote: "Tuition fees for non-EU students: €1,500 per semester" }],
        },
        intakes: {
          value: [{ startDate: null, applicationOpens: null, applicationDeadline: "2027-07-15" }],
          evidence: [{ url: PAGE, quote: "Apply by 15 July 2027" }],
        },
      }),
      "Applied Computer Science (B.Sc.)",
      getText,
    );
    expect(Object.keys(v.facts).sort()).toEqual([
      "durationYears",
      "intakes",
      "teachingLanguages",
      "tuition",
    ]);
    expect(v.programmePage).toBe(PAGE);
    expect(v.rejected).toEqual([]);
  });

  it("rejects a quote that is not on the page, however plausible the value", async () => {
    const v = await verifyProposal(
      proposal({
        durationYears: {
          value: 3,
          evidence: [{ url: PAGE, quote: "The degree takes three years to complete" }],
        },
      }),
      "Applied Computer Science",
      getText,
    );
    expect(v.facts.durationYears).toBeUndefined();
    expect(v.rejected[0]).toMatchObject({ fact: "durationYears" });
  });

  it("rejects a real quote that does not support the value", async () => {
    const v = await verifyProposal(
      proposal({
        tuition: {
          value: { amountMinor: 300000, currency: "EUR", period: "semester" },
          evidence: [{ url: FEES, quote: "Tuition fees for non-EU students: €1,500 per semester" }],
        },
      }),
      "Applied Computer Science",
      getText,
    );
    expect(v.facts.tuition).toBeUndefined();
    expect(v.rejected[0]?.reason).toMatch(/does not appear/);
  });

  it("rejects an invented date even when the quote is real", async () => {
    const v = await verifyProposal(
      proposal({
        intakes: {
          value: [{ startDate: null, applicationOpens: null, applicationDeadline: "2027-08-31" }],
          evidence: [{ url: PAGE, quote: "Apply by 15 July 2027" }],
        },
      }),
      "Applied Computer Science",
      getText,
    );
    expect(v.facts.intakes).toBeUndefined();
    expect(v.rejected[0]?.reason).toMatch(/2027-08-31/);
  });

  it("rejects a programme page that is unreachable or about something else", async () => {
    const other = await verifyProposal(proposal({}, PAGE), "Mechanical Engineering", getText);
    expect(other.programmePage).toBeNull();
    const missing = await verifyProposal(
      proposal({}, "https://uni.example/missing"),
      "Applied Computer Science",
      getText,
    );
    expect(missing.rejected[0]?.reason).toMatch(/could not be fetched/);
  });

  it("does not let evidence from an unreachable page count", async () => {
    const v = await verifyProposal(
      proposal({
        teachingLanguages: {
          value: ["en"],
          evidence: [{ url: "https://uni.example/gone", quote: "taught entirely in English" }],
        },
      }),
      "Applied Computer Science",
      getText,
    );
    expect(v.facts.teachingLanguages).toBeUndefined();
  });
});

describe("requirements", () => {
  const ADMISSION = "https://uni.example/admission";
  const text =
    "Applicants need German language skills at level B2 (TestDaF or DSH). Mathematics must have been taken until graduation. An aptitude interview is held in June.";
  const getAdmission = async (url: string) => {
    if (url !== ADMISSION && url !== PAGE) throw new Error("404");
    return url === PAGE ? (pages[PAGE] ?? "") : text;
  };
  const rule = (r: object) =>
    ProposalSchema.parse({
      slug: "p",
      programmePage: PAGE,
      facts: {},
      requirements: { rules: [r] },
    });

  it("accepts rules whose quote is on the page and whose values agree with it", async () => {
    const v = await verifyProposal(
      ProposalSchema.parse({
        slug: "p",
        programmePage: PAGE,
        facts: {},
        requirements: {
          rules: [
            {
              kind: "language_proficiency",
              language: "de",
              minCefr: "B2",
              certificateRequired: null,
              acceptedTests: ["testdaf"],
              evidence: [
                { url: ADMISSION, quote: "German language skills at level B2 (TestDaF or DSH)" },
              ],
            },
            {
              kind: "subject_taken",
              subjects: ["mathematics"],
              mode: "all",
              evidence: [
                { url: ADMISSION, quote: "Mathematics must have been taken until graduation" },
              ],
            },
            {
              kind: "manual_check",
              note: "Entretien d'aptitude en juin",
              evidence: [{ url: ADMISSION, quote: "An aptitude interview is held in June" }],
            },
          ],
        },
      }),
      "Applied Computer Science",
      getAdmission,
    );
    expect(v.requirements?.map((r) => r.kind)).toEqual([
      "language_proficiency",
      "subject_taken",
      "manual_check",
    ]);
    expect(v.rejected).toEqual([]);
  });

  it("accepts a language rule whose level and accepted tests are in different quotes", async () => {
    const A = "https://uni.example/level";
    const B = "https://uni.example/certs";
    const v = await verifyProposal(
      ProposalSchema.parse({
        slug: "p",
        programmePage: PAGE,
        facts: {},
        requirements: {
          rules: [
            {
              kind: "language_proficiency",
              language: "fr",
              minCefr: "C1",
              certificateRequired: true,
              acceptedTests: ["tcf", "delf-dalf"],
              evidence: [
                { url: A, quote: "Niveau de français requis pour s'inscrire à la formation : C1" },
                { url: B, quote: "la certification de français (TCF, DELF, DALF) est obligatoire" },
              ],
            },
          ],
        },
      }),
      "Applied Computer Science",
      async (url) =>
        url === A
          ? "Niveau de français requis pour s'inscrire à la formation : C1"
          : url === B
            ? "Sauf dispense, la certification de français (TCF, DELF, DALF) est obligatoire."
            : (pages[url] ?? ""),
    );
    expect(v.requirements).toHaveLength(1);
    expect(v.rejected).toEqual([]);
  });

  it("rejects a language rule whose only support is a recommendation", async () => {
    const soft = "https://uni.example/soft";
    const v = await verifyProposal(
      ProposalSchema.parse({
        slug: "p",
        programmePage: PAGE,
        facts: {},
        requirements: {
          rules: [
            {
              kind: "language_proficiency",
              language: "en",
              minCefr: "B2",
              certificateRequired: false,
              acceptedTests: [],
              evidence: [
                {
                  url: soft,
                  quote:
                    "A good command of English (at least level B2, as recommended by the CEFR)",
                },
              ],
            },
          ],
        },
      }),
      "Applied Computer Science",
      async (url) =>
        url === soft
          ? "A good command of English (at least level B2, as recommended by the CEFR) is expected."
          : (pages[url] ?? ""),
    );
    expect(v.requirements).toBeUndefined();
    expect(v.rejected[0]?.reason).toMatch(/soft wording/);
  });

  it("rejects a level, a test or a subject the quote does not state", async () => {
    const v = await verifyProposal(
      ProposalSchema.parse({
        slug: "p",
        programmePage: PAGE,
        facts: {},
        requirements: {
          rules: [
            {
              kind: "language_proficiency",
              language: "de",
              minCefr: "C1",
              certificateRequired: null,
              acceptedTests: [],
              evidence: [
                { url: ADMISSION, quote: "German language skills at level B2 (TestDaF or DSH)" },
              ],
            },
            {
              kind: "subject_taken",
              subjects: ["philosophy"],
              mode: "any",
              evidence: [
                { url: ADMISSION, quote: "Mathematics must have been taken until graduation" },
              ],
            },
            {
              kind: "manual_check",
              note: "x",
              evidence: [{ url: ADMISSION, quote: "A quote that is not on the page at all" }],
            },
          ],
        },
      }),
      "Applied Computer Science",
      getAdmission,
    );
    expect(v.requirements).toBeUndefined();
    expect(v.rejected).toHaveLength(3);
    expect(v.rejected[0]?.reason).toMatch(/level C1/);
    expect(v.rejected[1]?.reason).toMatch(/subject philosophy/);
  });

  it("writes accepted rules as official, partial coverage, cited and never complete", () => {
    const next = applyVerified(
      {
        slug: "p",
        requirements: { coverage: "partial", source: "daad", info_kind: READ_SOURCE, rules: [] },
        _review: { todo: "t" },
      },
      {
        programmePage: PAGE,
        rejected: [],
        facts: {},
        requirements: [
          {
            kind: "language_proficiency",
            language: "de",
            minCefr: "B2",
            certificateRequired: null,
            acceptedTests: ["testdaf"],
            evidence: [{ url: ADMISSION, quote: "q1" }],
          },
          {
            kind: "manual_check",
            note: "Entretien en juin",
            evidence: [{ url: ADMISSION, quote: "q2" }],
          },
        ],
      },
      "2026-10-02",
    );
    expect(next.requirements).toMatchObject({
      coverage: "partial",
      info_kind: "official",
      rules: [
        { id: "req-1", kind: "language_proficiency", minCefr: "B2", info_kind: "official" },
        {
          id: "req-2",
          kind: "manual_check",
          note: { fr: { text: "Entretien en juin", status: "draft" } },
        },
      ],
    });
    expect(JSON.stringify(next)).not.toContain(
      '"evidence":[{"url":"https://uni.example/admission"',
    );
    expect((next._review as { evidence: { fact: string }[] }).evidence.map((e) => e.fact)).toEqual([
      "requirements.req-1",
      "requirements.req-2",
    ]);
    void rule;
  });
});

describe("applyVerified", () => {
  const staged = () => ({
    slug: "p",
    officialUrl: null,
    durationYears: { value: 3, source: "daad", info_kind: READ_SOURCE },
    teachingLanguages: { value: ["en"], source: "daad", info_kind: READ_SOURCE },
    tuition: { value: null, source: "daad", info_kind: READ_SOURCE },
    intakes: { value: null, source: "daad", info_kind: READ_SOURCE },
    applicationChannel: { value: null, source: "daad", info_kind: READ_SOURCE },
    documents: { value: null, source: "daad", info_kind: READ_SOURCE },
    requirements: { coverage: "partial", source: "daad", info_kind: READ_SOURCE, rules: [] },
    sources: { daad: { url: "https://www2.daad.de/x", last_verified_at: null } },
    _review: { todo: "read it", sourceId: "daad:1" },
  });

  it("fills verified facts as official, resets unverified guesses to to-be-checked and cites the pages", () => {
    const next = applyVerified(
      staged(),
      {
        programmePage: PAGE,
        rejected: [],
        facts: {
          durationYears: {
            value: 3,
            evidence: [{ url: PAGE, quote: "The programme lasts six semesters" }],
          },
          tuition: {
            value: { amountMinor: 150000, currency: "EUR", period: "semester" },
            evidence: [{ url: FEES, quote: "x" }],
          },
        },
      },
      "2026-10-02",
    );
    expect(next).toMatchObject({ officialUrl: PAGE, tuition: { source: "page-2" } });
    expect(next.durationYears).toEqual({ value: 3, source: "programme", info_kind: "official" });
    // the DAAD-prefilled language was not verified by a quote: back to to-be-checked, not kept
    expect(next.teachingLanguages).toEqual({
      value: null,
      source: "programme",
      info_kind: "official",
    });
    expect(next.sources).toEqual({
      programme: { url: PAGE, last_verified_at: null },
      "page-2": { url: FEES, last_verified_at: null },
    });
    expect(next).toMatchObject({ requirements: { rules: [] } });
    expect(next._review).toMatchObject({ preparedBy: "assistant", sourceId: "daad:1" });
    expect(stillPlaceholder(next)).toEqual([]);
  });

  it("leaves the record blocked when the programme page was not verified", () => {
    const before = staged();
    const next = applyVerified(
      before,
      { programmePage: null, rejected: [], facts: {} },
      "2026-10-02",
    );
    expect(next).toEqual(before);
    expect(stillPlaceholder(next).length).toBeGreaterThan(0);
  });

  it("keeps the preparer's caveats and rejections for the auditor, and is idempotent", () => {
    const verified = {
      programmePage: PAGE,
      facts: {},
      rejected: [{ fact: "intakes", reason: "the quote does not state the year 2027" }],
      notes: "tuition is last year's tariff",
    };
    const once = applyVerified(staged(), verified, "2026-10-02");
    expect(once._review).toMatchObject({
      notes: "tuition is last year's tariff",
      rejected: ["intakes: the quote does not state the year 2027"],
    });
    const twice = applyVerified(once, verified, "2026-10-02");
    expect(
      String((twice._review as { todo: string }).todo).match(/prepared by the assistant/g),
    ).toHaveLength(1);
  });

  it("never writes last_verified_at", () => {
    const next = applyVerified(
      staged(),
      { programmePage: PAGE, rejected: [], facts: {} },
      "2026-10-02",
    );
    expect(JSON.stringify(next)).not.toMatch(/"last_verified_at":"/);
  });
});

describe("institutions and channels", () => {
  const site = "https://uni.example/";
  const sitePages: Record<string, string> = {
    [site]: "University Example is a public university in Lille. Welcome to University Example.",
  };
  const get = async (url: string) => {
    const t = sitePages[url];
    if (t === undefined) throw new Error("404");
    return t;
  };
  it("verifies an institution website that names the institution and carries a real quote", async () => {
    const ok = await verifyInstitution(
      {
        slug: "i",
        website: site,
        evidence: [{ url: site, quote: "University Example is a public university in Lille" }],
        type: {
          value: "public",
          evidence: [{ url: site, quote: "is a public university in Lille" }],
        },
      },
      "University Example",
      get,
    );
    expect(ok).toMatchObject({ ok: true, type: "public" });
    const wrong = await verifyInstitution(
      {
        slug: "i",
        website: site,
        evidence: [{ url: site, quote: "University Example is a private college" }],
      },
      "University Example",
      get,
    );
    expect(wrong.ok).toBe(false);
    const other = await verifyInstitution(
      {
        slug: "i",
        website: site,
        evidence: [{ url: site, quote: "Welcome to University Example." }],
      },
      "Totally Different Name",
      get,
    );
    expect(other).toMatchObject({ ok: false });
  });

  it("refuses a quote that is on the page but names nothing distinctive about the institution", async () => {
    const vague = await verifyInstitution(
      {
        slug: "i",
        website: site,
        evidence: [{ url: site, quote: "is a public university in Lille" }],
      },
      "University Example",
      get,
    );
    expect(vague).toMatchObject({ ok: false });
    expect(vague.ok === false && vague.reason).toMatch(/distinctive/);
  });
  it("applies a verified institution: official, cited to its own site, type only when evidenced", () => {
    const staged = {
      slug: "i",
      website: "http://old",
      type: null,
      source: "hrk",
      info_kind: READ_SOURCE,
      sources: { hrk: { url: "https://x", last_verified_at: null } },
      _review: { todo: "t" },
    };
    const next = applyRecord(
      staged,
      { ok: true, evidence: [{ url: site, quote: "q" }], type: "public" },
      "2026-10-02",
      site,
    );
    expect(next).toMatchObject({
      website: site,
      type: "public",
      source: "page",
      info_kind: "official",
      sources: { page: { url: site, last_verified_at: null } },
    });
    const noType = applyRecord(
      staged,
      { ok: true, evidence: [{ url: site, quote: "q" }] },
      "2026-10-02",
      site,
    );
    expect(noType.type).toBeNull();
  });
  it("verifies a channel only when a quote names it", async () => {
    const pages2: Record<string, string> = {
      "https://p.example/":
        "Parcoursup is the national platform for applying to higher education in France.",
    };
    const g = async (u: string) => pages2[u] ?? "";
    const ok = await verifyChannel(
      {
        slug: "fr-parcoursup",
        evidence: [
          { url: "https://p.example/", quote: "Parcoursup is the national platform for applying" },
        ],
      },
      "Parcoursup",
      g,
    );
    expect(ok.ok).toBe(true);
    const no = await verifyChannel(
      {
        slug: "fr-parcoursup",
        evidence: [
          {
            url: "https://p.example/",
            quote: "the national platform for applying to higher education",
          },
        ],
      },
      "Parcoursup",
      g,
    );
    expect(no.ok).toBe(false);
  });
});

describe("verifyProposal and a required certificate with no accepted tests", () => {
  const withRule = (certificateRequired: boolean | null, acceptedTests: string[]): Proposal =>
    ProposalSchema.parse({
      slug: "p",
      programmePage: PAGE,
      facts: {},
      requirements: {
        rules: [
          {
            kind: "language_proficiency",
            language: "en",
            minCefr: null,
            certificateRequired,
            acceptedTests,
            evidence: [{ url: PAGE, quote: "taught entirely in English" }],
          },
        ],
      },
    });

  it("accepts the rule but as 'certificate requirement unknown' (an empty list would let any certificate pass)", async () => {
    const v = await verifyProposal(withRule(true, []), "Applied Computer Science", getText);
    const rule = v.requirements?.[0];
    expect(rule?.kind === "language_proficiency" && rule.certificateRequired).toBeNull();
  });

  it("keeps 'required' when the accepted tests are named", async () => {
    const v = await verifyProposal(withRule(true, ["ielts"]), "Applied Computer Science", getText);
    // the quote does not name IELTS, so the rule is refused, never silently accepted
    expect(v.requirements).toBeUndefined();
  });
});
