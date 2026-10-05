import { describe, expect, it } from "vitest";

import { mentionsInternationalApplicants } from "../../../scripts/import/evidence";
import {
  type ScholarshipProposal,
  ScholarshipProposalSchema,
  verifyScholarship,
} from "../../../scripts/import/scholarships";

// A scheme that is open to every nationality and to every programme (the Deutschlandstipendium)
// never says "Bachelor": "all nationalities" is open to international applicants, and "every course
// of study is eligible" covers the first degree. A quote that also names Master is still a mixed
// level and a quote about master or doctoral students only is still rejected.
const HOME = "https://grants.example/any";
const pages: Record<string, string> = {
  [HOME]:
    "First- and higher-semester students of all nationalities can apply directly to their university. Students from every country may apply. Grundsätzlich ist jedes Studium an einer staatlichen oder staatlich anerkannten Hochschule förderungsfähig. Every course of study at a state university is eligible for funding. Also zum Beispiel auch ein Zweit- oder Ergänzungsstudium, ein Masterstudiengang oder ein duales Studium. Master programmes are eligible for funding. Studierende aller Nationalitäten und aller Fachrichtungen können sich bewerben. Students of all nationalities are not eligible for this grant. It pays 300 euros per month. Apply at your university.",
};
const getText = async (url: string) => {
  const text = pages[url];
  if (text === undefined) throw new Error("404");
  return text;
};
const q = (quote: string) => ({ url: HOME, quote });

function proposal(over: Record<string, unknown> = {}): ScholarshipProposal {
  return ScholarshipProposalSchema.parse({
    slug: "any-scholarship",
    name: "Any scholarship",
    provider: "Any provider",
    destinations: ["DE"],
    eligibleNationalities: [],
    fields: [],
    summary: { fr: "Une bourse." },
    howToApply: { fr: "Candidature à l'université." },
    officialUrl: HOME,
    support: null,
    deadline: null,
    documents: null,
    evidence: {
      eligibility: [
        q("First- and higher-semester students of all nationalities can apply directly"),
      ],
      level: [q("Every course of study at a state university is eligible for funding")],
      howToApply: [q("Apply at your university")],
    },
    ...over,
  });
}
const run = (over: Record<string, unknown> = {}) => verifyScholarship(proposal(over), getText);
const evidence = (over: Record<string, unknown>) => ({
  ...(proposal().evidence as Record<string, unknown>),
  ...over,
});
const reasonsOf = (r: Awaited<ReturnType<typeof run>>): string =>
  r.ok ? "" : r.reasons.join(" | ");

describe("all nationalities", () => {
  it.each([
    "students of all nationalities can apply",
    "open to any nationality",
    "regardless of their nationality",
    "Studierende aller Nationalitäten und aller Fachrichtungen",
    "studenti di tutte le nazionalità",
  ])("is open to international applicants (%s)", (quote) => {
    expect(mentionsInternationalApplicants(quote)).toBe(true);
  });

  it("does not take a mere mention of nationality for it", () => {
    expect(mentionsInternationalApplicants("Please state your nationality in the form")).toBe(
      false,
    );
  });

  it("makes an eligibility quote count", async () => {
    expect((await run()).ok).toBe(true);
  });

  it("still drops an exclusion", async () => {
    const result = await run({
      evidence: evidence({ eligibility: [q("Students of all nationalities are not eligible")] }),
    });
    expect(result.ok).toBe(false);
    expect(reasonsOf(result)).toMatch(/exclusion/);
  });
});

describe("every programme is eligible", () => {
  it.each([
    "Every course of study at a state university is eligible for funding",
    "Grundsätzlich ist jedes Studium an einer staatlichen oder staatlich anerkannten Hochschule förderungsfähig",
  ])("counts as covering the first degree (%s)", async (quote) => {
    expect((await run({ evidence: evidence({ level: [q(quote)] }) })).ok).toBe(true);
  });

  it.each([
    "Master programmes are eligible for funding",
    "Also zum Beispiel auch ein Zweit- oder Ergänzungsstudium, ein Masterstudiengang oder ein duales Studium",
  ])("does not count when it is about master programmes (%s)", async (quote) => {
    const result = await run({ evidence: evidence({ level: [q(quote)] }) });
    expect(result.ok).toBe(false);
  });

  it("rejects when a good quote is next to a master one", async () => {
    const result = await run({
      evidence: evidence({
        level: [
          q("Every course of study at a state university is eligible for funding"),
          q("Master programmes are eligible for funding"),
        ],
      }),
    });
    expect(result.ok).toBe(false);
  });
});
