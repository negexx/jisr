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
    "Applicants from non-EU countries holding a school-leaving certificate may apply. The scholarship is open to first-year undergraduate students. It pays EUR 5,000 one-time towards tuition and living costs. Applications close on 15 March 2027.",
  [APPLY]:
    "Apply online through the Aurora portal and upload a CV and a motivation letter. Certified translations are required for a motivation letter.",
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
  quote: "Applicants from non-EU countries holding a school-leaving certificate may apply",
};
const LEVEL = {
  url: RULES,
  quote: "The scholarship is open to first-year undergraduate students",
};
const SUPPORT = {
  url: RULES,
  quote: "It pays EUR 5,000 one-time towards tuition and living costs",
};
const DEADLINE = { url: RULES, quote: "Applications close on 15 March 2027" };
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
        evidence: evidence({ deadline: [{ url: RULES, quote: "Applications close on 15 March" }] }),
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
          level: [{ url: RULES, quote: "Applications close on 15 March 2027" }],
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
