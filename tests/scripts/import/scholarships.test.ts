import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

import { findPrepared } from "../../../scripts/import/audit";
import { amountInQuote } from "../../../scripts/import/evidence";
import { stampVerified } from "../../../scripts/import/promote";
import {
  isOfficialSource,
  runVerify,
  type ScholarshipProposal,
  ScholarshipProposalSchema,
  verifyScholarship,
} from "../../../scripts/import/scholarships";
import { ScholarshipRecordSchema } from "../../../src/data-schema/records/scholarship";

const HOME = "https://grants.example/aurora";
const RULES = "https://grants.example/aurora/rules";
const APPLY = "https://grants.example/aurora/apply";

const pages: Record<string, string> = {
  [HOME]:
    "The Aurora Scholarship supports talented students from outside the EU who start a bachelor degree in Germany.",
  [RULES]:
    "Applicants from non-EU countries, including Morocco, holding a school-leaving certificate may apply. The scholarship is open to first-year undergraduate students. It pays EUR 5,000 one-time towards tuition and living costs. Applications from non-EU students close on 15 March 2027.",
  [APPLY]:
    "Apply online through the Aurora portal and upload a CV and a motivation letter. Certified translations are required for a motivation letter.",
  [`${HOME}/master`]:
    "This scholarship is open to non-EU students. Applicants must hold a Bachelor's degree to apply for this Master scholarship. Les titulaires d'une licence peuvent candidater pour un master. Bachelor's degree holders from abroad may apply. Postgraduate students and doctoral candidates are welcome. The scholarship is for Bachelor students from abroad. Das Stipendium ist für ein Erststudium im Ausland gedacht. Le programme est ouvert pour la licence aux étudiants étrangers. The scholarship is for Bachelor graduates. Applicants must have finished a Bachelor in any subject. Bachelor degree alumni may apply. Students enrolled in a Bachelor programme may apply. The scholarship is for Bachelor students enrolled in a Bachelor programme.",
  [`${HOME}/who`]:
    "Applicants from non-EU countries are not eligible for this grant. Non-EU applicants cannot apply to this grant. International applicants: only open to EU citizens living in Germany. International applicants: only for German nationals studying abroad. Applicants from non-EU countries may apply. Applicants from North Africa and the Middle East may apply. Staff of the Foreign Office may apply for this scholarship. Non-EU students are ineligible for this grant. This grant is reserved for German citizens; non-EU applicants should see the DAAD database. Applicants must not be from non-EU countries. Students from South Africa may apply as international applicants. Students from all countries except Morocco may apply as international students. EU and non-EU students are eligible. Students from Morocco may apply as international applicants. Applicants must not have lived in Germany for more than 15 months; international students from all countries may apply. International applicants are not entitled to this grant. International applicants should apply to the DAAD instead. International applicants: only EU citizens are funded.",
  [`${HOME}/pay`]:
    "EUR 300 per month for Bachelor students and EUR 900 per month for Master students. Students receive no more than EUR 934 per month. Non-European students receive up to 934 euros a month. Grants range from 500 up to 934 euros a month. Non-European students receive 5,000 per year. EUR 934 per month for up to 3 years. Once admitted, students receive EUR 934 per month. A total of EUR 8,000 is paid to each non-EU student. Students from abroad receive 1.200 euros per year, paid in two instalments. Paid in 2027: EUR 5,000.50 in total. Bachelor students: EUR 300 per month; Master students: EUR 900 per month. Master students receive EUR 900 per month.",
  [`${HOME}/dates`]: "Applications close on 15 March 2027.",
  [`${HOME}/dates2`]:
    "EU applicants: 15 March 2027; non-EU applicants: 15 January 2027. Deadline for German applicants is 15 March 2027, for foreign applicants 1 February 2027. International applicants must apply by 15 March 2027. The deadline is 15 March 2027 for EU applicants and 15 January 2027 for non-EU applicants. Deadline: 15 March 2027 (international applicants: 15 January 2027). International applicants apply between 15 March 2027 and 15 May 2027. Results for international applicants are announced on 15 March 2027. International applicants will be informed of the results by 15 March 2027. Interviews with international applicants take place until 15 March 2027. Interviews for international applicants take place before 15 March 2027. The portal opens for international applicants on 15 March 2027 and closes later. The application deadline for international students is 15 March 2027. Non-EU applicants can apply until 15 March 2027. Date limite de candidature pour les étudiants internationaux : 15 mars 2027. Bewerbungsfrist für internationale Bewerber: 15. März 2027. Bewerbungsschluss für internationale Bewerber ist der 15. März 2027.",
  "https://blog.aggregator.example/aurora-guide":
    "Applicants from non-EU countries, including Morocco, holding a school-leaving certificate may apply.",
  "https://www.daad.de/en/aurora":
    "Applicants from non-EU countries, including Morocco, holding a school-leaving certificate may apply.",
};
const getText = async (url: string) => {
  const text = pages[url];
  if (text === undefined) throw new Error("404");
  return text;
};

// Reads a dotted path out of a parsed record ("support.value.amount.min").
function at(value: unknown, dotted: string): unknown {
  return dotted
    .split(".")
    .reduce<unknown>(
      (node, key) =>
        typeof node === "object" && node !== null
          ? (node as Record<string, unknown>)[key]
          : undefined,
      value,
    );
}

// A staged record has last_verified_at null in every source; promotion stamps the review date.
const validAfterReview = (record: unknown): boolean =>
  ScholarshipRecordSchema.safeParse(stampVerified(record, "2026-10-05")).success;

const ELIGIBILITY = {
  url: RULES,
  quote:
    "Applicants from non-EU countries, including Morocco, holding a school-leaving certificate may apply",
};
const LEVEL = {
  url: RULES,
  quote: "The scholarship is open to first-year undergraduate students",
};
const SUPPORT = {
  url: RULES,
  quote: "It pays EUR 5,000 one-time towards tuition and living costs",
};
const DEADLINE = { url: RULES, quote: "Applications from non-EU students close on 15 March 2027" };
const HOW = {
  url: APPLY,
  quote: "Apply online through the Aurora portal and upload a CV and a motivation letter",
};
const TRANSLATION = {
  url: APPLY,
  quote: "Certified translations are required for a motivation letter",
};

function raw(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    slug: "aurora-scholarship",
    name: "Aurora Scholarship",
    provider: "Aurora Foundation",
    destinations: ["DE"],
    eligibleNationalities: ["MA"],
    fields: ["computer-science"],
    summary: { fr: "Une bourse pour étudier en Allemagne.", en: "A grant to study in Germany." },
    howToApply: { fr: "Candidature en ligne.", en: "Apply online." },
    officialUrl: HOME,
    support: {
      amount: { min: 5000, max: 5000, currency: "EUR", per: "once" },
      covers: ["tuition"],
    },
    deadline: "2027-03-15",
    documents: [
      { slug: "cv", name: { fr: "CV", en: "CV" }, quotedAs: "CV", translationRequired: false },
      {
        slug: "motivation-letter",
        name: { fr: "Lettre de motivation", en: "Motivation letter" },
        quotedAs: "motivation letter",
        translationRequired: true,
      },
    ],
    evidence: {
      eligibility: [ELIGIBILITY],
      level: [LEVEL],
      support: [SUPPORT],
      deadline: [DEADLINE],
      howToApply: [HOW, TRANSLATION],
    },
    ...over,
  };
}

function proposal(over: Record<string, unknown> = {}): ScholarshipProposal {
  return ScholarshipProposalSchema.parse(raw(over));
}

function evidence(over: Record<string, unknown>): Record<string, unknown> {
  return { ...(raw().evidence as Record<string, unknown>), ...over };
}

describe("amountInQuote", () => {
  it("finds the amount as a whole number, with grouping", () => {
    expect(amountInQuote(5000, "EUR 5,000 one-time")).toBe(true);
    expect(amountInQuote(5000, "5.000 euros")).toBe(true);
  });
  it("does not find it inside a larger number", () => {
    expect(amountInQuote(5000, "EUR 15,000")).toBe(false);
  });
});

describe("verifyScholarship", () => {
  it("builds a record that passes ScholarshipRecordSchema", async () => {
    const result = await verifyScholarship(proposal(), getText);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(validAfterReview(result.record)).toBe(true);
    const record = result.record;
    expect(at(record, "level")).toBe("bachelor");
    expect(at(record, "support")).toMatchObject({
      value: { amount: { min: 500000, max: 500000, currency: "EUR", per: "once" } },
      info_kind: "official",
    });
    expect(at(record, "deadline.value")).toBe("2027-03-15");
    expect(at(record, "summary.fr")).toEqual({
      text: "Une bourse pour étudier en Allemagne.",
      status: "draft",
    });
    expect(at(record, "requirements")).toMatchObject({ coverage: "partial", rules: [] });
    expect(at(record, "officialUrl")).toBe(HOME);
    for (const source of Object.values(at(record, "sources") as Record<string, unknown>))
      expect(at(source, "last_verified_at")).toBeNull();
    expect(at(record, "sources.page-1.url")).toBe(HOME);
    expect(result.evidence.map((e) => e.fact)).toEqual(
      expect.arrayContaining(["eligibility", "level", "support", "deadline", "howToApply"]),
    );
  });

  it("keeps a translation claim only when a quote names the document and translation", async () => {
    const result = await verifyScholarship(proposal(), getText);
    if (!result.ok) throw new Error("expected ok");
    const docs = at(result.record, "documents.value") as {
      slug: string;
      translationRequired: boolean | null;
    }[];
    expect(docs.map((d) => [d.slug, d.translationRequired])).toEqual([
      ["cv", false],
      ["motivation-letter", true],
    ]);
  });

  it("downgrades a translation claim no quote supports to unknown", async () => {
    const result = await verifyScholarship(
      proposal({
        documents: [{ slug: "cv", name: { fr: "CV" }, quotedAs: "CV", translationRequired: true }],
      }),
      getText,
    );
    if (!result.ok) throw new Error("expected ok");
    expect(at(result.record, "documents.value.0.translationRequired")).toBeNull();
  });

  it("rejects without a quote about international applicants", async () => {
    const result = await verifyScholarship(
      proposal({
        evidence: evidence({
          eligibility: [{ url: RULES, quote: "It pays EUR 5,000 one-time towards tuition" }],
        }),
      }),
      getText,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.join(" ")).toMatch(/international/i);
  });

  it("drops a quote that is not on the page and rejects when it was the only eligibility quote", async () => {
    const result = await verifyScholarship(
      proposal({
        evidence: evidence({
          eligibility: [
            { url: RULES, quote: "Everybody from outside the EU may apply at any time" },
          ],
        }),
      }),
      getText,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.join(" ")).toMatch(/eligibility/i);
  });

  it("keeps an eligibility quote that is on the page when another one is not", async () => {
    const result = await verifyScholarship(
      proposal({
        evidence: evidence({
          eligibility: [
            { url: RULES, quote: "Everybody may apply at any time, anywhere" },
            ELIGIBILITY,
          ],
        }),
      }),
      getText,
    );
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.evidence.filter((e) => e.fact === "eligibility")).toEqual([
        { fact: "eligibility", ...ELIGIBILITY },
      ]);
  });

  it("sets support to null when the amount is not in the quote, keeping the rest", async () => {
    const result = await verifyScholarship(
      proposal({
        support: {
          amount: { min: 4000, max: 4000, currency: "EUR", per: "once" },
          covers: ["tuition"],
        },
      }),
      getText,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(at(result.record, "support.value")).toBeNull();
    expect(at(result.record, "deadline.value")).toBe("2027-03-15");
    expect(result.notes.join(" ")).toMatch(/support/);
    expect(result.evidence.some((e) => e.fact === "support")).toBe(false);
    expect(validAfterReview(result.record)).toBe(true);
  });

  it("sets support to null when the currency is not in the quote", async () => {
    const result = await verifyScholarship(
      proposal({
        support: { amount: { min: 5000, max: 5000, currency: "USD", per: "once" }, covers: [] },
      }),
      getText,
    );
    expect(result.ok && at(result.record, "support.value")).toBeNull();
  });

  it("sets support to null when the period is not in the quote", async () => {
    const result = await verifyScholarship(
      proposal({
        support: { amount: { min: 5000, max: 5000, currency: "EUR", per: "month" }, covers: [] },
      }),
      getText,
    );
    expect(result.ok && at(result.record, "support.value")).toBeNull();
  });

  it("keeps only the covered items the quote names", async () => {
    const result = await verifyScholarship(
      proposal({
        support: {
          amount: { min: 5000, max: 5000, currency: "EUR", per: "once" },
          covers: ["tuition", "travel"],
        },
      }),
      getText,
    );
    if (!result.ok) throw new Error("expected ok");
    expect(at(result.record, "support.value.covers")).toEqual(["tuition"]);
  });

  it("keeps a range only when one quote has both amounts", async () => {
    const result = await verifyScholarship(
      proposal({
        support: { amount: { min: 5000, max: 8000, currency: "EUR", per: "once" }, covers: [] },
      }),
      getText,
    );
    expect(result.ok && at(result.record, "support.value")).toBeNull();
  });

  it("sets the deadline to null when the quote states no year", async () => {
    const result = await verifyScholarship(
      proposal({
        evidence: evidence({
          deadline: [{ url: RULES, quote: "Applications from non-EU students close on 15 March" }],
        }),
      }),
      getText,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(at(result.record, "deadline.value")).toBeNull();
  });

  it("sets the deadline to null when it has no quote", async () => {
    const result = await verifyScholarship(
      proposal({ evidence: evidence({ deadline: undefined }) }),
      getText,
    );
    expect(result.ok && at(result.record, "deadline.value")).toBeNull();
  });

  it("writes a null documents fact when there are none", async () => {
    const result = await verifyScholarship(proposal({ documents: null }), getText);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(at(result.record, "documents.value")).toBeNull();
    expect(validAfterReview(result.record)).toBe(true);
  });

  it("drops a document no accepted quote names", async () => {
    const base = proposal();
    const result = await verifyScholarship(
      proposal({
        documents: [
          ...(base.documents ?? []),
          {
            slug: "passport",
            name: { fr: "Passeport" },
            quotedAs: "passport",
            translationRequired: null,
          },
        ],
      }),
      getText,
    );
    if (!result.ok) throw new Error("expected ok");
    const slugs = (at(result.record, "documents.value") as { slug: string }[]).map((d) => d.slug);
    expect(slugs).not.toContain("passport");
  });

  it("rejects a level quote without a bachelor word", async () => {
    const result = await verifyScholarship(
      proposal({
        evidence: evidence({
          level: [
            { url: RULES, quote: "Applications from non-EU students close on 15 March 2027" },
          ],
        }),
      }),
      getText,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.join(" ")).toMatch(/level/i);
  });

  it("rejects without a how-to-apply quote", async () => {
    const result = await verifyScholarship(
      proposal({
        evidence: evidence({
          howToApply: [{ url: APPLY, quote: "Click the big button somewhere" }],
        }),
      }),
      getText,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.join(" ")).toMatch(/howToApply/);
  });

  it("rejects when the official page cannot be fetched", async () => {
    const result = await verifyScholarship(
      proposal({ officialUrl: "https://grants.example/missing" }),
      getText,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.join(" ")).toMatch(/official/i);
  });

  it("rejects an unknown institution slug and accepts a known one", async () => {
    const known = new Set(["tu-berlin"]);
    const bad = await verifyScholarship(proposal({ institutions: ["tu-nowhere"] }), getText, {
      institutions: known,
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reasons.join(" ")).toMatch(/tu-nowhere/);
    const good = await verifyScholarship(proposal({ institutions: ["tu-berlin"] }), getText, {
      institutions: known,
    });
    expect(good.ok).toBe(true);
    if (good.ok) {
      expect(at(good.record, "institutions")).toEqual(["tu-berlin"]);
      expect(validAfterReview(good.record)).toBe(true);
    }
  });

  it("cannot check institutions without the list of them", async () => {
    const result = await verifyScholarship(proposal({ institutions: ["tu-berlin"] }), getText);
    expect(result.ok).toBe(false);
  });
});

describe("ScholarshipProposalSchema", () => {
  it("refuses a non-https official url and an empty destination list", () => {
    expect(() => proposal({ officialUrl: "http://x.example/a" })).toThrow();
    expect(() => proposal({ destinations: [] })).toThrow();
  });
});

describe("runVerify", () => {
  let dir: string;
  let stagingDir: string;
  let dataDir: string;
  let file: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "jisr-scholarship-"));
    stagingDir = path.join(dir, "data-staging");
    dataDir = path.join(dir, "data");
    await mkdir(path.join(dataDir, "institutions"), { recursive: true });
    await writeFile(path.join(dataDir, "institutions", "tu-berlin.yaml"), "slug: tu-berlin\n");
    file = path.join(dir, "aurora.json");
    await writeFile(file, JSON.stringify(raw()));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  const deps = () => ({ getText, stagingDir, dataDir, today: "2026-10-04" });

  it("stages the record with an assistant _review block", async () => {
    const out = await runVerify({ file, dryRun: false }, deps());
    expect(out.ok).toBe(true);
    const target = path.join(stagingDir, "scholarships", "aurora-scholarship.yaml");
    const staged = parse(await readFile(target, "utf8")) as Record<string, unknown>;
    expect(at(staged, "_review")).toMatchObject({
      kind: "scholarships",
      slug: "aurora-scholarship",
      name: "Aurora Scholarship",
      preparedBy: "assistant",
      preparedAt: "2026-10-04",
    });
    expect(at(staged, "_review.todo")).toMatch(/included in the audit sample draw/);
    expect((at(staged, "_review.evidence") as unknown[]).length).toBeGreaterThan(0);
    const { _review: _unused, ...record } = staged;
    expect(validAfterReview(record)).toBe(true);
    // the audit draw picks it up
    expect(await findPrepared(stagingDir)).toEqual(["scholarships/aurora-scholarship"]);
  });

  it("refuses to overwrite a staged file", async () => {
    await runVerify({ file, dryRun: false }, deps());
    const target = path.join(stagingDir, "scholarships", "aurora-scholarship.yaml");
    const before = await readFile(target, "utf8");
    const again = await runVerify({ file, dryRun: false }, deps());
    expect(again.ok).toBe(false);
    expect(again.lines.join("\n")).toMatch(/already/);
    expect(await readFile(target, "utf8")).toBe(before);
  });

  it("refuses a slug already in data/", async () => {
    await mkdir(path.join(dataDir, "scholarships"), { recursive: true });
    await writeFile(path.join(dataDir, "scholarships", "aurora-scholarship.yaml"), "slug: x\n");
    const out = await runVerify({ file, dryRun: false }, deps());
    expect(out.ok).toBe(false);
  });

  it("writes nothing with --dry-run", async () => {
    const out = await runVerify({ file, dryRun: true }, deps());
    expect(out.ok).toBe(true);
    expect(existsSync(path.join(stagingDir, "scholarships"))).toBe(false);
  });

  it("reads the institution slugs from data/institutions", async () => {
    await writeFile(file, JSON.stringify(raw({ institutions: ["tu-nowhere"] })));
    const out = await runVerify({ file, dryRun: false }, deps());
    expect(out.ok).toBe(false);
    expect(out.lines.join("\n")).toMatch(/tu-nowhere/);
    await writeFile(file, JSON.stringify(raw({ institutions: ["tu-berlin"] })));
    expect((await runVerify({ file, dryRun: true }, deps())).ok).toBe(true);
  });

  it("prints accepted and rejected facts with the reason", async () => {
    const out = await runVerify({ file, dryRun: true }, deps());
    expect(out.lines.join("\n")).toMatch(/accepted.*eligibility/);
    await writeFile(
      file,
      JSON.stringify(
        raw({
          support: { amount: { min: 4000, max: 4000, currency: "EUR", per: "once" }, covers: [] },
        }),
      ),
    );
    const second = await runVerify({ file, dryRun: true }, deps());
    expect(second.lines.join("\n")).toMatch(/rejected.*support/);
  });

  it("reports an unreadable proposal instead of throwing", async () => {
    await writeFile(file, "{ not json");
    const out = await runVerify({ file, dryRun: true }, deps());
    expect(out.ok).toBe(false);
  });
});

const QUOTES = (url: string, ...quotes: string[]) => quotes.map((quote) => ({ url, quote }));
const MASTER = `${HOME}/master`;
const WHO = `${HOME}/who`;
const PAY = `${HOME}/pay`;

async function okOrReasons(over: Record<string, unknown>) {
  return verifyScholarship(proposal(over), getText);
}
const reasonsOf = (r: Awaited<ReturnType<typeof okOrReasons>>): string =>
  r.ok ? "" : r.reasons.join(" | ");

describe("amountInQuote decimals", () => {
  it("rejects a decimal tail but accepts .00", () => {
    expect(amountInQuote(5000, "EUR 5,000.50 in total")).toBe(false);
    expect(amountInQuote(5000, "EUR 5,000.00 in total")).toBe(true);
    expect(amountInQuote(5000, "EUR 5.000,50")).toBe(false);
    expect(amountInQuote(5000, "EUR 5,000, paid once")).toBe(true);
  });
});

describe("level: the scholarship itself must be for bachelor students", () => {
  const levelOnly = (...quotes: string[]) =>
    okOrReasons({ evidence: evidence({ level: QUOTES(MASTER, ...quotes) }) });

  it.each([
    "Applicants must hold a Bachelor's degree to apply for this Master scholarship",
    "Les titulaires d'une licence peuvent candidater pour un master",
    "Bachelor's degree holders from abroad may apply",
    "Postgraduate students and doctoral candidates are welcome",
  ])("rejects a graduate-level scholarship (%s)", async (quote) => {
    const result = await levelOnly(quote);
    expect(result.ok).toBe(false);
    expect(reasonsOf(result)).toMatch(/level/i);
  });

  it("rejects when a good level quote is accompanied by a graduate one", async () => {
    const result = await levelOnly(
      "The scholarship is for Bachelor students from abroad",
      "Applicants must hold a Bachelor's degree to apply for this Master scholarship",
    );
    expect(result.ok).toBe(false);
  });

  it("rejects an eligibility quote that makes it a master scholarship", async () => {
    const result = await okOrReasons({
      evidence: evidence({
        eligibility: QUOTES(
          MASTER,
          "Applicants must hold a Bachelor's degree to apply for this Master scholarship",
          "This scholarship is open to non-EU students",
        ),
      }),
    });
    expect(result.ok).toBe(false);
  });

  it.each([
    "The scholarship is for Bachelor students from abroad",
    "Das Stipendium ist für ein Erststudium im Ausland gedacht",
    "Le programme est ouvert pour la licence aux étudiants étrangers",
  ])("accepts a quote that says the scholarship is for undergraduates (%s)", async (quote) => {
    const result = await levelOnly(quote);
    expect(result.ok).toBe(true);
  });

  it("does not take a bare mention of a bachelor degree as the level", async () => {
    const result = await levelOnly("Applicants must hold a Bachelor's degree");
    expect(result.ok).toBe(false);
  });
});

describe("eligibility: exclusions and nationalities", () => {
  const elig = (...quotes: string[]) =>
    okOrReasons({ evidence: evidence({ eligibility: QUOTES(WHO, ...quotes) }) });

  it.each([
    "Applicants from non-EU countries are not eligible for this grant",
    "Non-EU applicants cannot apply to this grant",
    "International applicants: only open to EU citizens living in Germany",
    "International applicants: only for German nationals studying abroad",
  ])("rejects an exclusion quote (%s)", async (quote) => {
    const result = await okOrReasons({
      eligibleNationalities: [],
      evidence: evidence({ eligibility: QUOTES(WHO, quote) }),
    });
    expect(result.ok).toBe(false);
    expect(reasonsOf(result)).toMatch(/exclusion/);
  });

  it("drops the exclusion quote but keeps a good one", async () => {
    const result = await okOrReasons({
      eligibleNationalities: [],
      evidence: evidence({
        eligibility: QUOTES(
          WHO,
          "Applicants from non-EU countries are not eligible for this grant",
          "Applicants from non-EU countries may apply",
        ),
      }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.notes.join(" ")).toMatch(/eligibility/);
  });

  it("requires a quote naming the country or its region when nationalities are listed", async () => {
    const result = await elig("Applicants from non-EU countries may apply");
    expect(result.ok).toBe(false);
    expect(reasonsOf(result)).toMatch(/MA|Morocc/);
  });

  it("accepts the region instead of the country", async () => {
    const result = await elig(
      "Applicants from non-EU countries may apply",
      "Applicants from North Africa and the Middle East may apply",
    );
    expect(result.ok).toBe(true);
  });

  it("accepts any international applicant when no nationality is listed", async () => {
    const result = await okOrReasons({
      eligibleNationalities: [],
      evidence: evidence({
        eligibility: QUOTES(WHO, "Applicants from non-EU countries may apply"),
      }),
    });
    expect(result.ok).toBe(true);
  });

  it("cannot check a nationality it has no names for", async () => {
    const result = await okOrReasons({
      eligibleNationalities: ["ZZ"],
      evidence: evidence({
        eligibility: QUOTES(WHO, "Applicants from non-EU countries may apply"),
      }),
    });
    expect(result.ok).toBe(false);
  });

  it("does not take the Foreign Office for international applicants", async () => {
    const result = await okOrReasons({
      eligibleNationalities: [],
      evidence: evidence({
        eligibility: QUOTES(WHO, "Staff of the Foreign Office may apply for this scholarship"),
      }),
    });
    expect(result.ok).toBe(false);
    expect(reasonsOf(result)).toMatch(/international/i);
  });
});

describe("support: currency, period and amount must be stated together", () => {
  const support = (quote: string, amount: Record<string, unknown>) =>
    okOrReasons({
      support: { amount, covers: [] },
      evidence: evidence({ support: QUOTES(PAY, quote) }),
    });
  const supportValue = (r: Awaited<ReturnType<typeof okOrReasons>>) =>
    r.ok ? at(r.record, "support.value") : "rejected";
  const A = (min: number, per: string, currency = "EUR", max = min) => ({
    min,
    max,
    currency,
    per,
  });

  it("does not take 'non-European' for the euro", async () => {
    const r = await support("Non-European students receive 5,000 per year", A(5000, "year"));
    expect(supportValue(r)).toBeNull();
  });

  it("does not take 'for up to 3 years' for per year", async () => {
    const r = await support("EUR 934 per month for up to 3 years", A(934, "year"));
    expect(supportValue(r)).toBeNull();
    const month = await support("EUR 934 per month for up to 3 years", A(934, "month"));
    expect(supportValue(month)).not.toBeNull();
  });

  it("does not take 'once admitted' for a one-time payment", async () => {
    const r = await support("Once admitted, students receive EUR 934 per month", A(934, "once"));
    expect(supportValue(r)).toBeNull();
  });

  it("accepts a total and a yearly amount in euros", async () => {
    expect(
      supportValue(
        await support("A total of EUR 8,000 is paid to each non-EU student", A(8000, "total")),
      ),
    ).not.toBeNull();
    expect(
      supportValue(
        await support(
          "Students from abroad receive 1.200 euros per year, paid in two instalments",
          A(1200, "year"),
        ),
      ),
    ).not.toBeNull();
  });

  it("rejects an amount with a decimal tail", async () => {
    const r = await support("Paid in 2027: EUR 5,000.50 in total", A(5000, "total"));
    expect(supportValue(r)).toBeNull();
  });
});

describe("deadline: it must name international applicants", () => {
  it("sets the deadline to null when the quote does not say who it is for", async () => {
    const result = await okOrReasons({
      evidence: evidence({
        deadline: QUOTES(`${HOME}/dates`, "Applications close on 15 March 2027"),
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(at(result.record, "deadline.value")).toBeNull();
    expect(result.notes.join(" ")).toMatch(/deadline.*international/i);
  });
});

describe("official sources", () => {
  it.each([
    ["https://grants.example/other", true],
    ["https://www.grants.example/other", true],
    ["https://www.daad.de/en/x", true],
    ["https://www.studyinholland.nl/x", true],
    ["https://www.campusfrance.org/fr/x", true],
    ["https://www.education.gov.uk/x", true],
    ["https://www.service-public.gouv.fr/x", true],
    ["https://www.bmbf.bund.de/x", true],
    ["https://www.overheid.nl/x", true],
    ["https://www.government.nl/x", true],
    ["https://blog.aggregator.example/x", false],
    ["https://notgov.example/x", false],
    ["https://evil-daad.de.example/x", false],
    ["https://www.evil.gov.com/x", false],
    ["https://gov.evil.com/x", false],
    ["https://www.study.gov.ma/x", true],
    ["https://x.gouv.fr/y", true],
    ["https://daad.de.evil.com/x", false],
    ["https://evil-daad.de/x", false],
  ])("%s -> %s", (url, expected) => {
    expect(isOfficialSource(url, HOME)).toBe(expected);
  });

  it("rejects a quote that is verbatim on an aggregator page", async () => {
    const result = await okOrReasons({
      evidence: evidence({
        eligibility: QUOTES(
          "https://blog.aggregator.example/aurora-guide",
          "Applicants from non-EU countries, including Morocco, holding a school-leaving certificate may apply",
        ),
      }),
    });
    expect(result.ok).toBe(false);
    expect(reasonsOf(result)).toMatch(/official/i);
  });

  it("accepts the same quote on an allow-listed page", async () => {
    const result = await okOrReasons({
      evidence: evidence({
        eligibility: QUOTES(
          "https://www.daad.de/en/aurora",
          "Applicants from non-EU countries, including Morocco, holding a school-leaving certificate may apply",
        ),
      }),
    });
    expect(result.ok).toBe(true);
  });
});

describe("sources", () => {
  it("registers no page for the documents fact when there are no documents", async () => {
    const result = await verifyScholarship(proposal({ documents: null }), getText);
    if (!result.ok) throw new Error("expected ok");
    const urls = Object.values(at(result.record, "sources") as Record<string, { url: string }>).map(
      (s) => s.url,
    );
    expect(urls).not.toContain(APPLY);
  });
});

describe("runVerify without data/institutions", () => {
  it("says the folder is missing instead of calling the slug unknown", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "jisr-scholarship-"));
    try {
      const file = path.join(dir, "p.json");
      await writeFile(file, JSON.stringify(raw({ institutions: ["tu-berlin"] })));
      const out = await runVerify(
        { file, dryRun: true },
        {
          getText,
          stagingDir: path.join(dir, "s"),
          dataDir: path.join(dir, "d"),
          today: "2026-10-04",
        },
      );
      expect(out.ok).toBe(false);
      const text = out.lines.join("\n");
      expect(text).toMatch(/institutions.*not found/);
      expect(text).not.toMatch(/unknown institution/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("level: graduates of a bachelor are not bachelor students", () => {
  const levelOnly = (...quotes: string[]) =>
    okOrReasons({ evidence: evidence({ level: QUOTES(MASTER, ...quotes) }) });

  it.each([
    "The scholarship is for Bachelor graduates",
    "Applicants must have finished a Bachelor in any subject",
    "Bachelor degree alumni may apply",
  ])("rejects (%s)", async (quote) => {
    const result = await levelOnly(quote);
    expect(result.ok).toBe(false);
    expect(reasonsOf(result)).toMatch(/level/i);
  });

  it("still accepts bachelor students and enrolment in a bachelor programme", async () => {
    expect(
      (await levelOnly("The scholarship is for Bachelor students enrolled in a Bachelor programme"))
        .ok,
    ).toBe(true);
    expect((await levelOnly("Students enrolled in a Bachelor programme may apply")).ok).toBe(true);
  });
});

describe("eligibility: more exclusions, and nationalities by country name", () => {
  const alone = (...quotes: string[]) =>
    okOrReasons({
      eligibleNationalities: [],
      evidence: evidence({ eligibility: QUOTES(WHO, ...quotes) }),
    });

  it.each([
    "Non-EU students are ineligible for this grant",
    "This grant is reserved for German citizens; non-EU applicants should see the DAAD database",
    "Applicants must not be from non-EU countries",
  ])("rejects an exclusion (%s)", async (quote) => {
    const result = await alone(quote);
    expect(result.ok).toBe(false);
    expect(reasonsOf(result)).toMatch(/exclusion/);
  });

  it("accepts a quote that includes non-EU students", async () => {
    expect((await alone("EU and non-EU students are eligible")).ok).toBe(true);
  });

  const mine = (quote: string) =>
    okOrReasons({ evidence: evidence({ eligibility: QUOTES(WHO, quote) }) });

  it("does not take South Africa for Morocco or North Africa", async () => {
    const result = await mine("Students from South Africa may apply as international applicants");
    expect(result.ok).toBe(false);
    expect(reasonsOf(result)).toMatch(/MA/);
  });

  it("does not take 'all countries except Morocco' for Morocco", async () => {
    const result = await mine(
      "Students from all countries except Morocco may apply as international students",
    );
    expect(result.ok).toBe(false);
    expect(reasonsOf(result)).toMatch(/MA/);
  });

  it("accepts a quote that names Morocco", async () => {
    expect((await mine("Students from Morocco may apply as international applicants")).ok).toBe(
      true,
    );
  });
});

describe("deadline: two applicant groups", () => {
  const dl = async (date: string, quote: string) => {
    const result = await okOrReasons({
      deadline: date,
      evidence: evidence({ deadline: QUOTES(`${HOME}/dates2`, quote) }),
    });
    if (!result.ok) throw new Error(result.reasons.join(" | "));
    return result;
  };
  const EU_VS_NON = "EU applicants: 15 March 2027; non-EU applicants: 15 January 2027";
  const DE_VS_FOREIGN =
    "Deadline for German applicants is 15 March 2027, for foreign applicants 1 February 2027";

  it("does not take the EU applicants' date for the international one", async () => {
    const result = await dl("2027-03-15", EU_VS_NON);
    expect(at(result.record, "deadline.value")).toBeNull();
    expect(result.notes.join(" ")).toMatch(/deadline/);
  });

  it("does not keep a date whose clause has no deadline word", async () => {
    const result = await dl("2027-01-15", EU_VS_NON);
    expect(at(result.record, "deadline.value")).toBeNull();
  });

  it("does not take the German applicants' date for the foreign one", async () => {
    expect(at((await dl("2027-03-15", DE_VS_FOREIGN)).record, "deadline.value")).toBeNull();
    expect(at((await dl("2027-02-01", DE_VS_FOREIGN)).record, "deadline.value")).toBeNull();
  });

  it.each([
    "The deadline is 15 March 2027 for EU applicants and 15 January 2027 for non-EU applicants",
    "Deadline: 15 March 2027 (international applicants: 15 January 2027)",
    "International applicants apply between 15 March 2027 and 15 May 2027",
    "Results for international applicants are announced on 15 March 2027",
  ])("is null for %s", async (quote) => {
    const result = await dl("2027-03-15", quote);
    expect(at(result.record, "deadline.value")).toBeNull();
    expect(result.notes.join(" ")).toMatch(/deadline/);
  });

  it.each([
    "International applicants will be informed of the results by 15 March 2027",
    "Interviews with international applicants take place until 15 March 2027",
    "Interviews for international applicants take place before 15 March 2027",
    "The portal opens for international applicants on 15 March 2027 and closes later",
  ])("is null for a results, interview or opening date: %s", async (quote) => {
    const result = await dl("2027-03-15", quote);
    expect(at(result.record, "deadline.value")).toBeNull();
  });

  it.each([
    "International applicants must apply by 15 March 2027",
    "The application deadline for international students is 15 March 2027",
    "Non-EU applicants can apply until 15 March 2027",
    "Date limite de candidature pour les étudiants internationaux : 15 mars 2027",
    "Bewerbungsfrist für internationale Bewerber: 15. März 2027",
    "Bewerbungsschluss für internationale Bewerber ist der 15. März 2027",
  ])("keeps %s", async (quote) => {
    const result = await dl("2027-03-15", quote);
    expect(at(result.record, "deadline.value")).toBe("2027-03-15");
  });

  it("keeps a single date for international applicants", async () => {
    const result = await dl("2027-03-15", "International applicants must apply by 15 March 2027");
    expect(at(result.record, "deadline.value")).toBe("2027-03-15");
  });
});

describe("support: a cap is not a fixed amount", () => {
  const cap = async (min: number, max: number, quote: string) => {
    const result = await okOrReasons({
      support: { amount: { min, max, currency: "EUR", per: "month" }, covers: [] },
      evidence: evidence({ support: QUOTES(PAY, quote) }),
    });
    if (!result.ok) throw new Error(result.reasons.join(" | "));
    return result;
  };

  it("sets the amount to null when 'up to' is read as a fixed amount", async () => {
    const result = await cap(934, 934, "Non-European students receive up to 934 euros a month");
    expect(at(result.record, "support.value")).toBeNull();
    expect(result.notes.join(" ")).toMatch(/support/);
  });

  it("keeps a range whose upper bound is a cap", async () => {
    const result = await cap(500, 934, "Grants range from 500 up to 934 euros a month");
    expect(at(result.record, "support.value.amount.max")).toBe(93400);
  });
});

describe("eligibility: narrower 'must not', more exclusions", () => {
  const alone = (quote: string) =>
    okOrReasons({
      eligibleNationalities: [],
      evidence: evidence({ eligibility: QUOTES(WHO, quote) }),
    });

  it.each([
    "International applicants are not entitled to this grant",
    "International applicants should apply to the DAAD instead",
    "International applicants: only EU citizens are funded",
  ])("rejects (%s)", async (quote) => {
    const result = await alone(quote);
    expect(result.ok).toBe(false);
    expect(reasonsOf(result)).toMatch(/exclusion/);
  });

  it("accepts a residence condition that is not an exclusion of foreigners", async () => {
    const result = await alone(
      "Applicants must not have lived in Germany for more than 15 months; international students from all countries may apply",
    );
    expect(result.ok).toBe(true);
  });
});

describe("support: the amount of another level of study", () => {
  const MIXED = "EUR 300 per month for Bachelor students and EUR 900 per month for Master students";
  const mixed = async (amount: number) => {
    const result = await okOrReasons({
      support: { amount: { min: amount, max: amount, currency: "EUR", per: "month" }, covers: [] },
      evidence: evidence({ support: QUOTES(PAY, MIXED) }),
    });
    if (!result.ok) throw new Error(result.reasons.join(" | "));
    return result;
  };

  it("drops the master amount", async () => {
    expect(at((await mixed(900)).record, "support.value")).toBeNull();
  });

  it("keeps the bachelor amount", async () => {
    expect(at((await mixed(300)).record, "support.value.amount.min")).toBe(30000);
  });

  it.each([
    ["Bachelor students: EUR 300 per month; Master students: EUR 900 per month", 900, null],
    ["Master students receive EUR 900 per month", 900, null],
    ["Bachelor students: EUR 300 per month; Master students: EUR 900 per month", 300, 30000],
  ])("a graduate word before the amount: %s (claimed %i)", async (quote, amount, kept) => {
    const result = await okOrReasons({
      support: { amount: { min: amount, max: amount, currency: "EUR", per: "month" }, covers: [] },
      evidence: evidence({ support: QUOTES(PAY, quote) }),
    });
    if (!result.ok) throw new Error(result.reasons.join(" | "));
    expect(at(result.record, "support.value.amount.min") ?? null).toBe(kept);
  });

  it("reads 'no more than' as a ceiling", async () => {
    const result = await okOrReasons({
      support: {
        amount: { min: 934, max: 934, currency: "EUR", per: "month" },
        covers: [],
      },
      evidence: evidence({
        support: QUOTES(PAY, "Students receive no more than EUR 934 per month"),
      }),
    });
    if (!result.ok) throw new Error("expected ok");
    expect(at(result.record, "support.value")).toBeNull();
  });
});

describe("evidence for nationalities", () => {
  it("records which quote named each listed country", async () => {
    const result = await verifyScholarship(proposal(), getText);
    if (!result.ok) throw new Error("expected ok");
    expect(result.evidence).toContainEqual({ fact: "nationality:MA", ...ELIGIBILITY });
  });
});
