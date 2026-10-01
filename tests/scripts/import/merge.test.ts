import { describe, expect, it } from "vitest";

import { mergeProposals } from "../../../scripts/import/merge";
import type { Proposal } from "../../../scripts/import/proposals";

const ev = (quote: string, url = "https://x.example/p") => [{ url, quote }];
const base: Proposal = {
  slug: "s",
  programmePage: "https://fiche.example/1",
  facts: {
    durationYears: {
      value: 3,
      evidence: ev("La licence se prépare en six semestres.", "https://national.example"),
    },
    applicationChannel: {
      value: "fr-campus-france",
      evidence: ev("vous devrez formuler vos vœux sur la plateforme Études en France"),
    },
  },
  requirements: {
    rules: [
      {
        kind: "language_proficiency",
        language: "fr",
        minCefr: "B2",
        certificateRequired: true,
        acceptedTests: ["tcf", "delf-dalf"],
        evidence: ev("Niveau de français requis : B2"),
      },
    ],
  },
  notes: "national facts",
};
const extra: Proposal = {
  slug: "s",
  programmePage: "https://uni.example/licence",
  facts: {
    durationYears: { value: 4, evidence: ev("La licence dure quatre ans.") },
    teachingLanguages: { value: ["fr"], evidence: ev("Enseignement en français") },
  },
  requirements: {
    rules: [
      {
        kind: "language_proficiency",
        language: "fr",
        minCefr: "B2",
        certificateRequired: true,
        acceptedTests: ["tcf", "delf-dalf"],
        evidence: ev("Un niveau B2 de français est exigé"),
      },
      { kind: "prior_study_years_min", years: 12, evidence: ev("12 années de scolarité") },
    ],
  },
  notes: "from the institution site",
};

describe("mergeProposals", () => {
  const merged = mergeProposals(base, extra);

  it("keeps the base facts and adds only the facts the base lacks", () => {
    expect(merged.facts.durationYears?.value).toBe(3);
    expect(merged.facts.teachingLanguages?.value).toEqual(["fr"]);
    expect(merged.facts.applicationChannel?.value).toBe("fr-campus-france");
  });

  it("keeps the base page as the programme page", () => {
    expect(merged.programmePage).toBe("https://fiche.example/1");
  });

  it("adds extra rules the base does not have, and not a duplicate of one it has", () => {
    expect(merged.requirements?.rules.map((r) => r.kind)).toEqual([
      "language_proficiency",
      "prior_study_years_min",
    ]);
  });

  it("falls back to the extra programme page when the base has none", () => {
    expect(mergeProposals({ ...base, programmePage: null }, extra).programmePage).toBe(
      "https://uni.example/licence",
    );
  });

  it("joins the notes so the auditor reads both", () => {
    expect(merged.notes).toContain("national facts");
    expect(merged.notes).toContain("from the institution site");
  });

  it("returns the base unchanged when there is nothing to add", () => {
    expect(mergeProposals(base, { slug: "s", programmePage: null, facts: {} })).toEqual(base);
  });
});
