import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  applyRecord,
  applyVerified,
  enrichRecord,
  type Proposal,
  ProposalSchema,
  recordValue,
  stillPlaceholder,
  verifyChannel,
  verifyInstitution,
  verifyProposal,
} from "../../../scripts/import/proposals";
import { READ_SOURCE } from "../../../scripts/import/staging";
import { DocumentListSchema, IntakeSchema } from "../../../src/data-schema/records/program";

const PAGE = "https://uni.example/cs";
const FEES = "https://uni.example/fees";
const pages: Record<string, string> = {
  [PAGE]:
    "Applied Computer Science, B.Sc. The programme lasts six semesters and is taught entirely in English. Non-EU applicants: apply by 15 July 2027.",
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
          evidence: [{ url: PAGE, quote: "Non-EU applicants: apply by 15 July 2027" }],
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

  describe("a tuition range", () => {
    const RANGE = "https://uni.example/range-fees";
    const value = {
      amountMinor: 15600,
      maxAmountMinor: 260000,
      currency: "EUR",
      period: "year",
      basis: "income_based",
    } as const;
    pages[RANGE] =
      "Tuition fees range from EUR 156 to EUR 2,600 a year, depending on the ISEE of the family.";
    pages[`${RANGE}-noincome`] = "Tuition fees range from EUR 156 to EUR 2,600 a year.";

    it("accepts a range whose quote shows both numbers and the income basis, value untouched", async () => {
      const v = await verifyProposal(
        proposal({
          tuition: {
            value,
            evidence: [
              {
                url: RANGE,
                quote:
                  "Tuition fees range from EUR 156 to EUR 2,600 a year, depending on the ISEE of the family",
              },
            ],
          },
        }),
        "Applied Computer Science",
        getText,
      );
      expect(v.rejected).toEqual([]);
      expect(v.facts.tuition?.value).toEqual(value);
      expect(Object.values(v.facts.tuition?.value ?? {})).not.toContain(null);
    });

    it("rejects income_based when the quote does not mention income, never downgrading it", async () => {
      const v = await verifyProposal(
        proposal({
          tuition: {
            value,
            evidence: [
              {
                url: `${RANGE}-noincome`,
                quote: "Tuition fees range from EUR 156 to EUR 2,600 a year",
              },
            ],
          },
        }),
        "Applied Computer Science",
        getText,
      );
      expect(v.facts.tuition).toBeUndefined();
      expect(v.rejected[0]).toMatchObject({ fact: "tuition" });
      expect(v.rejected[0]?.reason).toMatch(/income/);
    });

    it("keeps a plain range with no basis when the quote states both fees", async () => {
      const { basis: _basis, ...plain } = value;
      const v = await verifyProposal(
        proposal({
          tuition: {
            value: plain,
            evidence: [
              {
                url: `${RANGE}-noincome`,
                quote: "Tuition fees range from EUR 156 to EUR 2,600 a year",
              },
            ],
          },
        }),
        "Applied Computer Science",
        getText,
      );
      expect(v.facts.tuition?.value).toEqual(plain);
    });

    it("rejects a null maximum and a basis without a maximum in the schema", () => {
      const evidence = [{ url: RANGE, quote: "Tuition fees range from EUR 156" }];
      const parse = (tuition: unknown) =>
        ProposalSchema.safeParse({
          slug: "p",
          programmePage: null,
          facts: { tuition: { value: tuition, evidence } },
        }).success;
      expect(parse({ amountMinor: 1, maxAmountMinor: null, currency: "EUR", period: "year" })).toBe(
        false,
      );
      expect(
        parse({ amountMinor: 1, currency: "EUR", period: "year", basis: "income_based" }),
      ).toBe(false);
      expect(parse({ amountMinor: 5, maxAmountMinor: 1, currency: "EUR", period: "year" })).toBe(
        false,
      );
      expect(parse({ amountMinor: 1, maxAmountMinor: 5, currency: "EUR", period: "year" })).toBe(
        true,
      );
    });
  });

  describe("a tuition with a second quote that names the country", () => {
    const AMOUNT = "https://uni.example/country-fees";
    const LIST = "https://uni.example/country-list";
    pages[AMOUNT] =
      "Second instalment 2026/27 for students with a household abroad: Group A EUR 200 (area A), EUR 256 (area B).";
    pages[LIST] = "Tabella A - Aree paesi esteri 2026/27. Gruppo A: MAROCCO, Tunisia, Egitto.";
    const BOTH = "https://uni.example/country-fees-both";
    const LOW = "https://uni.example/country-fees-low";
    const HIGH = "https://uni.example/country-fees-high";
    pages[BOTH] = "Second instalment: Group A EUR 200 (area A), EUR 256 (area B).";
    pages[LOW] = "Group A EUR 200 (area A).";
    pages[HIGH] = "Gruppo A: MAROCCO. Area B EUR 256.";
    const amountQuote = {
      url: AMOUNT,
      quote: "Second instalment 2026/27 for students with a household abroad: Group A EUR 200",
    };
    const moroccoQuote = { url: LIST, quote: "Gruppo A: MAROCCO, Tunisia, Egitto" };
    const single = { amountMinor: 20000, currency: "EUR", period: "year" } as const;

    it("accepts it: the amount only has to be in one accepted quote, in either order", async () => {
      for (const evidence of [
        [amountQuote, moroccoQuote],
        [moroccoQuote, amountQuote],
      ]) {
        const v = await verifyProposal(
          proposal({ tuition: { value: single, evidence } }),
          "Applied Computer Science",
          getText,
          2026,
        );
        expect(v.rejected).toEqual([]);
        expect(v.facts.tuition?.value).toEqual(single);
        expect(v.facts.tuition?.evidence).toEqual(evidence);
      }
    });

    it("accepts a range whose two numbers are in ONE quote, next to a country quote without numbers", async () => {
      const range = {
        amountMinor: 20000,
        maxAmountMinor: 25600,
        currency: "EUR",
        period: "year",
      } as const;
      const both = {
        url: BOTH,
        quote: "Group A EUR 200 (area A), EUR 256 (area B)",
      };
      const v = await verifyProposal(
        proposal({ tuition: { value: range, evidence: [both, moroccoQuote] } }),
        "Applied Computer Science",
        getText,
        2026,
      );
      expect(v.rejected).toEqual([]);
      expect(v.facts.tuition?.value).toEqual(range);
    });

    it("still rejects it when no accepted quote has the amount", async () => {
      const v = await verifyProposal(
        proposal({
          tuition: {
            value: { amountMinor: 99900, currency: "EUR", period: "year" },
            evidence: [moroccoQuote, amountQuote],
          },
        }),
        "Applied Computer Science",
        getText,
        2026,
      );
      expect(v.facts.tuition).toBeUndefined();
      expect(v.rejected[0]).toMatchObject({ fact: "tuition" });
    });

    it("does not let a range borrow its lowest and highest from two different quotes", async () => {
      const v = await verifyProposal(
        proposal({
          tuition: {
            value: { amountMinor: 20000, maxAmountMinor: 25600, currency: "EUR", period: "year" },
            evidence: [
              { url: LOW, quote: "Group A EUR 200 (area A)" },
              { url: HIGH, quote: "Gruppo A: MAROCCO. Area B EUR 256" },
            ],
          },
        }),
        "Applied Computer Science",
        getText,
        2026,
      );
      expect(v.facts.tuition).toBeUndefined();
    });
  });

  describe("droppedQuotes: an accepted fact that lost an evidence quote", () => {
    const fees = {
      url: FEES,
      quote: "Tuition fees for non-EU students: €1,500 per semester",
    };
    const value = { amountMinor: 150000, currency: "EUR", period: "semester" } as const;
    const missing = {
      url: PAGE,
      quote: `${"Morocco is in country group A of the annex. ".repeat(6)}this is not on the page`,
    };

    it("lists the dropped quote (cut to 120 characters) when one of two quotes is not on the page", async () => {
      const v = await verifyProposal(
        proposal({ tuition: { value, evidence: [fees, missing] } }),
        "Applied Computer Science",
        getText,
      );
      expect(v.rejected).toEqual([]);
      expect(v.facts.tuition?.evidence).toEqual([fees]);
      expect(v.droppedQuotes).toHaveLength(1);
      expect(v.droppedQuotes?.[0]).toMatchObject({ fact: "tuition", url: PAGE });
      expect(v.droppedQuotes?.[0]?.quote.length).toBeLessThanOrEqual(120);
      expect(v.droppedQuotes?.[0]?.quote.startsWith("Morocco is in country group A")).toBe(true);
    });

    it("also lists a quote whose page could not be fetched", async () => {
      const v = await verifyProposal(
        proposal({
          tuition: { value, evidence: [fees, { url: "https://uni.example/gone", quote: "x" }] },
        }),
        "Applied Computer Science",
        getText,
      );
      expect(v.droppedQuotes).toEqual([
        { fact: "tuition", url: "https://uni.example/gone", quote: "x" },
      ]);
    });

    it("is not set when every quote is found", async () => {
      const v = await verifyProposal(
        proposal({ tuition: { value, evidence: [fees] } }),
        "Applied Computer Science",
        getText,
      );
      expect(v.rejected).toEqual([]);
      expect(v.droppedQuotes).toBeUndefined();
    });

    it("is not set for a fact that was rejected altogether (rejected already says so)", async () => {
      const v = await verifyProposal(
        proposal({ tuition: { value, evidence: [missing] } }),
        "Applied Computer Science",
        getText,
      );
      expect(v.facts.tuition).toBeUndefined();
      expect(v.droppedQuotes).toBeUndefined();
    });

    it("reaches the review block of applyVerified and of enrichRecord, and nothing is added without it", () => {
      const dropped = [{ fact: "tuition", url: PAGE, quote: "Morocco is in group A" }];
      const verified = {
        programmePage: PAGE,
        rejected: [],
        facts: { tuition: { value, evidence: [fees] } },
        droppedQuotes: dropped,
      };
      const staged = {
        slug: "p",
        officialUrl: null,
        durationYears: { value: null, source: "daad", info_kind: READ_SOURCE },
        teachingLanguages: { value: null, source: "daad", info_kind: READ_SOURCE },
        tuition: { value: null, source: "daad", info_kind: READ_SOURCE },
        intakes: { value: null, source: "daad", info_kind: READ_SOURCE },
        applicationChannel: { value: null, source: "daad", info_kind: READ_SOURCE },
        documents: { value: null, source: "daad", info_kind: READ_SOURCE },
        requirements: { coverage: "partial", source: "daad", info_kind: READ_SOURCE, rules: [] },
        sources: { daad: { url: "https://www2.daad.de/x", last_verified_at: null } },
        _review: { todo: "read it" },
      };
      const line = `tuition: "Morocco is in group A" (${PAGE})`;
      expect(applyVerified(staged, verified, "2026-10-08")._review).toMatchObject({
        droppedQuotes: [line],
      });
      expect(enrichRecord(staged, verified, "2026-10-08").record._review).toMatchObject({
        droppedQuotes: [line],
      });
      const { droppedQuotes: _gone, ...clean } = verified;
      // a re-run that dropped nothing removes the stale warning of the earlier run
      const first = applyVerified(staged, verified, "2026-10-08");
      expect(applyVerified(first, clean, "2026-10-09")._review).not.toHaveProperty("droppedQuotes");
      expect(
        applyVerified(first, { ...clean, droppedQuotes: [] }, "2026-10-09")._review,
      ).not.toHaveProperty("droppedQuotes");
      // an enrichment only adds: earlier lines stay and a repeated line is kept once
      const enriched = enrichRecord(staged, verified, "2026-10-08").record;
      const more = {
        ...verified,
        facts: { durationYears: { value: 3, evidence: [fees] } },
        droppedQuotes: [...dropped, { fact: "durationYears", url: PAGE, quote: "six" }],
      };
      expect(enrichRecord(enriched, more, "2026-10-09").record._review).toMatchObject({
        droppedQuotes: [line, `durationYears: "six" (${PAGE})`],
      });
      expect(applyVerified(staged, clean, "2026-10-08")._review).not.toHaveProperty(
        "droppedQuotes",
      );
      expect(enrichRecord(staged, clean, "2026-10-08").record._review).not.toHaveProperty(
        "droppedQuotes",
      );
    });
  });

  it("rejects a tuition amount that its quote ties to a past study year, for the study year given", async () => {
    const OLD = "https://uni.example/old-fees";
    pages[OLD] = "Studiejaar 2025-2026 Instellingscollegegeld Voltijd: € 10.164 per jaar";
    const facts: Proposal["facts"] = {
      tuition: {
        value: { amountMinor: 1016400, currency: "EUR", period: "year" },
        evidence: [
          { url: OLD, quote: "Studiejaar 2025-2026 Instellingscollegegeld Voltijd: € 10.164" },
        ],
      },
    };
    const stale = await verifyProposal(proposal(facts), "Applied Computer Science", getText, 2026);
    expect(stale.facts.tuition).toBeUndefined();
    expect(stale.rejected[0]?.reason).toMatch(/study year 2025/);
    const fine = await verifyProposal(proposal(facts), "Applied Computer Science", getText, 2025);
    expect(fine.facts.tuition).toBeDefined();
  });

  it("rejects an invented date even when the quote is real", async () => {
    const v = await verifyProposal(
      proposal({
        intakes: {
          value: [{ startDate: null, applicationOpens: null, applicationDeadline: "2027-08-31" }],
          evidence: [{ url: PAGE, quote: "Non-EU applicants: apply by 15 July 2027" }],
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

describe("documents fact", () => {
  const page = "https://uni.example/apply";
  const text =
    "International applicants must submit: a certified copy of the school-leaving certificate (translation into German or English required), a CV and a passport copy. Bewerber reichen eine beglaubigte Kopie des Zeugnisses ein.";
  const documentsText = async () => text;
  const QUOTE =
    "a certified copy of the school-leaving certificate (translation into German or English required)";
  const doc = (
    slug: string,
    translationRequired: boolean | null,
    quotedAs = "school-leaving certificate",
  ) => ({
    slug,
    name: { fr: "Diplôme", en: "School-leaving certificate" },
    quotedAs,
    translationRequired,
  });
  const documentsProposal = (documents: unknown, quote = QUOTE) =>
    ProposalSchema.parse({
      slug: "xx-prog",
      programmePage: null,
      facts: { documents: { value: documents, evidence: [{ url: page, quote }] } },
    });

  it("accepts a document list whose quote is on the page and keeps a translation claim the quote supports", async () => {
    const verified = await verifyProposal(
      documentsProposal([doc("school-leaving-certificate", true)]),
      "Prog",
      documentsText,
    );
    expect(verified.facts.documents?.value).toEqual([doc("school-leaving-certificate", true)]);
  });

  it("turns translationRequired true into null when no accepted quote mentions translation", async () => {
    const verified = await verifyProposal(
      documentsProposal([doc("cv", true, "CV")], "a CV and a passport copy"),
      "Prog",
      documentsText,
    );
    expect(verified.facts.documents?.value).toEqual([doc("cv", null, "CV")]);
  });

  it("does not read a certified copy as a translation requirement", async () => {
    const english = await verifyProposal(
      documentsProposal(
        [doc("school-leaving-certificate", true)],
        "a certified copy of the school-leaving certificate",
      ),
      "Prog",
      documentsText,
    );
    expect(english.facts.documents?.value).toEqual([doc("school-leaving-certificate", null)]);
    const german = await verifyProposal(
      documentsProposal(
        [doc("zeugnis", true, "Zeugnisses")],
        "eine beglaubigte Kopie des Zeugnisses ein",
      ),
      "Prog",
      documentsText,
    );
    expect(german.facts.documents?.value).toEqual([doc("zeugnis", null, "Zeugnisses")]);
  });

  it("rejects a document list whose quote is not on the page", async () => {
    const verified = await verifyProposal(
      documentsProposal([doc("cv", null, "CV")], "a sentence that is not on the page at all"),
      "Prog",
      documentsText,
    );
    expect(verified.facts.documents).toBeUndefined();
    expect(verified.rejected.map((r) => r.fact)).toContain("documents");
  });

  it("drops a document no accepted quote names, and the whole fact when none is named", async () => {
    const mixed = await verifyProposal(
      documentsProposal([
        doc("school-leaving-certificate", null),
        doc("birth-certificate", null, "birth certificate"),
      ]),
      "Prog",
      documentsText,
    );
    expect(mixed.facts.documents?.value).toEqual([doc("school-leaving-certificate", null)]);
    const none = await verifyProposal(
      documentsProposal([doc("birth-certificate", null, "birth certificate")]),
      "Prog",
      documentsText,
    );
    expect(none.facts.documents).toBeUndefined();
    expect(none.rejected).toContainEqual({
      fact: "documents",
      reason: "no document is named in an accepted quote",
    });
  });

  it("judges the translation claim per document", async () => {
    const twoQuotes = ProposalSchema.parse({
      slug: "xx-prog",
      programmePage: null,
      facts: {
        documents: {
          value: [doc("school-leaving-certificate", true), doc("cv", true, "CV")],
          evidence: [
            { url: page, quote: QUOTE },
            { url: page, quote: "a CV and a passport copy" },
          ],
        },
      },
    });
    const verified = await verifyProposal(twoQuotes, "Prog", documentsText);
    expect(verified.facts.documents?.value).toEqual([
      doc("school-leaving-certificate", true),
      doc("cv", null, "CV"),
    ]);
  });

  it("refuses an empty list and duplicate slugs at the schema", () => {
    expect(() => documentsProposal([])).toThrow();
    expect(() => documentsProposal([doc("cv", null, "CV"), doc("cv", null, "CV")])).toThrow();
  });

  it("requires quotedAs", () => {
    const withoutQuotedAs = { slug: "cv", name: { fr: "CV" }, translationRequired: null };
    expect(() => documentsProposal([withoutQuotedAs])).toThrow(/quotedAs/);
    expect(() => documentsProposal([{ ...withoutQuotedAs, quotedAs: "CV" }])).not.toThrow();
  });

  it("matches quotedAs as a whole word, never inside a longer word", async () => {
    const onPage = (quote: string) => async () => quote;
    const idQuote = "a copy of a valid passport";
    const id = await verifyProposal(
      documentsProposal([doc("id", null, "ID")], idQuote),
      "Prog",
      onPage(idQuote),
    );
    expect(id.facts.documents).toBeUndefined();
    const cvQuote = "proof of recovery is also needed";
    const cv = await verifyProposal(
      documentsProposal([doc("cv", null, "CV")], cvQuote),
      "Prog",
      onPage(cvQuote),
    );
    expect(cv.facts.documents).toBeUndefined();
    const idCard = "a copy of your ID card is needed";
    const named = await verifyProposal(
      documentsProposal([doc("id", null, "ID")], idCard),
      "Prog",
      onPage(idCard),
    );
    expect(named.facts.documents?.value).toHaveLength(1);
  });

  it("takes regex characters in quotedAs literally", async () => {
    const page2 = async () =>
      "Please send your B.Sc. certificate and a passport (copy) with the application.";
    const literal = ProposalSchema.parse({
      slug: "xx-prog",
      programmePage: null,
      facts: {
        documents: {
          value: [doc("bsc", null, "B.Sc. certificate"), doc("passport", null, "passport (copy)")],
          evidence: [
            { url: page, quote: "send your B.Sc. certificate and a passport (copy) with" },
          ],
        },
      },
    });
    const verified = await verifyProposal(literal, "Prog", page2);
    expect(verified.facts.documents?.value).toHaveLength(2);
    const wildcard = ProposalSchema.parse({
      slug: "xx-prog",
      programmePage: null,
      facts: {
        documents: {
          value: [doc("bsc", null, "B.Sc. certificate")],
          evidence: [{ url: page, quote: "send your BxSc certificate and a passport" }],
        },
      },
    });
    const none = await verifyProposal(
      wildcard,
      "Prog",
      async () => "send your BxSc certificate and a passport",
    );
    expect(none.facts.documents).toBeUndefined();
  });

  it("still matches an exact inflected word", async () => {
    const verified = await verifyProposal(
      documentsProposal(
        [doc("zeugnis", null, "Zeugnisses")],
        "eine beglaubigte Kopie des Zeugnisses ein",
      ),
      "Prog",
      documentsText,
    );
    expect(verified.facts.documents?.value).toHaveLength(1);
  });

  it("recordValue gives the record shape (no quotedAs) with draft localized names and leaves other fields alone", () => {
    expect(recordValue("documents", [doc("cv", null)])).toEqual([
      {
        slug: "cv",
        name: {
          fr: { text: "Diplôme", status: "draft" },
          en: { text: "School-leaving certificate", status: "draft" },
        },
        translationRequired: null,
      },
    ]);
    expect(recordValue("tuition", { amountMinor: 0 })).toEqual({ amountMinor: 0 });
  });

  it("recordValue output is accepted by the record schema", () => {
    const value = recordValue("documents", [doc("cv", true), doc("passport", null, "passport")]);
    expect(DocumentListSchema.safeParse(value).success).toBe(true);
  });
});

describe("intakes: the deadline must be stated for international applicants", () => {
  const page = "https://uni.example/apply";
  const make = (quote: string, text: string) => ({
    verify: () =>
      verifyProposal(
        ProposalSchema.parse({
          slug: "xx-prog",
          programmePage: null,
          facts: {
            intakes: {
              value: [
                { startDate: null, applicationOpens: null, applicationDeadline: "2027-05-01" },
              ],
              evidence: [{ url: page, quote }],
            },
          },
        }),
        "Prog",
        async () => text,
      ),
  });

  it("accepts a dated deadline whose quote says it is for non-EU applicants", async () => {
    const q = "Non-EU applicants must apply by 1 May 2027";
    const verified = await make(q, q).verify();
    expect(verified.facts.intakes).toBeDefined();
  });

  it("rejects a dated deadline whose quotes never mention international applicants", async () => {
    const q = "The application deadline is 1 May 2027";
    const verified = await make(q, q).verify();
    expect(verified.facts.intakes).toBeUndefined();
    expect(verified.rejected).toContainEqual({
      fact: "intakes",
      reason: "no accepted quote says the deadline applies to international or non-EU applicants",
    });
  });

  it("accepts when a second accepted quote carries the international wording", async () => {
    const text =
      "The application deadline is 1 May 2027. Applicants from outside the EU use the same portal.";
    const verified = await verifyProposal(
      ProposalSchema.parse({
        slug: "xx-prog",
        programmePage: null,
        facts: {
          intakes: {
            value: [{ startDate: null, applicationOpens: null, applicationDeadline: "2027-05-01" }],
            evidence: [
              { url: page, quote: "The application deadline is 1 May 2027." },
              { url: page, quote: "Applicants from outside the EU use the same portal." },
            ],
          },
        },
      }),
      "Prog",
      async () => text,
    );
    expect(verified.facts.intakes).toBeDefined();
  });

  it("does not apply the rule to an item with only a start date", async () => {
    const q = "Studies start on 1 September 2027";
    const verified = await verifyProposal(
      ProposalSchema.parse({
        slug: "xx-prog",
        programmePage: null,
        facts: {
          intakes: {
            value: [{ startDate: "2027-09-01", applicationOpens: null, applicationDeadline: null }],
            evidence: [{ url: page, quote: q }],
          },
        },
      }),
      "Prog",
      async () => q,
    );
    expect(verified.facts.intakes).toBeDefined();
  });

  it("does not apply the rule to an item with only an opening date", async () => {
    const q = "Applications open on 1 February 2027";
    const verified = await verifyProposal(
      ProposalSchema.parse({
        slug: "xx-prog",
        programmePage: null,
        facts: {
          intakes: {
            value: [{ startDate: null, applicationOpens: "2027-02-01", applicationDeadline: null }],
            evidence: [{ url: page, quote: q }],
          },
        },
      }),
      "Prog",
      async () => q,
    );
    expect(verified.facts.intakes).toBeDefined();
  });

  it("rejects the whole fact when one item has a deadline without international wording", async () => {
    const text = "Studies start on 1 September 2027. The application deadline is 1 May 2027.";
    const verified = await verifyProposal(
      ProposalSchema.parse({
        slug: "xx-prog",
        programmePage: null,
        facts: {
          intakes: {
            value: [
              { startDate: "2027-09-01", applicationOpens: null, applicationDeadline: null },
              { startDate: null, applicationOpens: null, applicationDeadline: "2027-05-01" },
            ],
            evidence: [
              { url: page, quote: "Studies start on 1 September 2027." },
              { url: page, quote: "The application deadline is 1 May 2027." },
            ],
          },
        },
      }),
      "Prog",
      async () => text,
    );
    expect(verified.facts.intakes).toBeUndefined();
    expect(verified.rejected).toContainEqual({
      fact: "intakes",
      reason: "no accepted quote says the deadline applies to international or non-EU applicants",
    });
  });
});

describe("intakes: a recurring deadline", () => {
  const page = "https://uni.example/apply";
  const recurring = { month: 7, day: 15 };
  const item = (extra: Record<string, unknown>) => ({
    startDate: null,
    applicationOpens: null,
    applicationDeadline: null,
    ...extra,
  });
  const verify = (items: unknown[], quotes: string[], text: string) =>
    verifyProposal(
      ProposalSchema.parse({
        slug: "xx-prog",
        programmePage: null,
        facts: {
          intakes: { value: items, evidence: quotes.map((quote) => ({ url: page, quote })) },
        },
      }),
      "Prog",
      async () => text,
    );
  const parseItem = (value: unknown) =>
    ProposalSchema.safeParse({
      slug: "xx-prog",
      programmePage: null,
      facts: { intakes: { value: [value], evidence: [{ url: page, quote: "q" }] } },
    });

  it("the schema accepts a recurring deadline with no dated one", () => {
    expect(parseItem(item({ recurringDeadline: recurring })).success).toBe(true);
  });

  it("the schema rejects a day that does not exist in the month", () => {
    expect(parseItem(item({ recurringDeadline: { month: 2, day: 30 } })).success).toBe(false);
  });

  it("the schema rejects an item with both a dated and a recurring deadline", () => {
    expect(
      parseItem(item({ applicationDeadline: "2027-07-15", recurringDeadline: recurring })).success,
    ).toBe(false);
  });

  it("accepts a recurring deadline whose quote states day and month for non-EU applicants", async () => {
    const q = "Applicants from outside the EU: application deadline 15 July";
    const verified = await verify([item({ recurringDeadline: recurring })], [q], q);
    expect(verified.facts.intakes).toBeDefined();
  });

  it("rejects a recurring deadline when the quote lacks the day and month", async () => {
    const q = "Applications open all year, for international applicants";
    const verified = await verify([item({ recurringDeadline: recurring })], [q], q);
    expect(verified.facts.intakes).toBeUndefined();
    expect(verified.rejected).toContainEqual({
      fact: "intakes",
      reason: "the deadline 15/7 is not supported by the quotes",
    });
  });

  it("rejects a recurring deadline when no quote names international or non-EU applicants", async () => {
    const q = "The application deadline is 15 July";
    const verified = await verify([item({ recurringDeadline: recurring })], [q], q);
    expect(verified.facts.intakes).toBeUndefined();
    expect(verified.rejected).toContainEqual({
      fact: "intakes",
      reason: "no accepted quote says the deadline applies to international or non-EU applicants",
    });
  });

  it("accepts a list with one dated item and one recurring item when the rule is satisfied", async () => {
    const dated = "Non-EU applicants must apply by 1 May 2027.";
    const open = "Applicants from outside the EU: application deadline 15 July";
    const verified = await verify(
      [item({ applicationDeadline: "2027-05-01" }), item({ recurringDeadline: recurring })],
      [dated, open],
      `${dated} ${open}`,
    );
    expect(verified.facts.intakes).toBeDefined();
  });

  it("recordValue keeps a recurring item, drops a null recurringDeadline, and fits the record schema", () => {
    const value = recordValue("intakes", [
      { ...item({}), recurringDeadline: recurring },
      {
        startDate: "2027-09-01",
        applicationOpens: null,
        applicationDeadline: "2027-05-01",
        recurringDeadline: null,
      },
    ]);
    expect(z.array(IntakeSchema).safeParse(value).success).toBe(true);
    expect(value).toEqual([
      {
        startDate: null,
        applicationOpens: null,
        applicationDeadline: null,
        recurringDeadline: recurring,
      },
      { startDate: "2027-09-01", applicationOpens: null, applicationDeadline: "2027-05-01" },
    ]);
  });
});
