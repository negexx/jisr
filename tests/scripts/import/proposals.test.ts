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
