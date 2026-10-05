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
    "First- and higher-semester students of all nationalities can apply directly to their university. Students from every country may apply. Grundsätzlich ist jedes Studium an einer staatlichen oder staatlich anerkannten Hochschule förderungsfähig. Every course of study at a state university is eligible for funding. Also zum Beispiel auch ein Zweit- oder Ergänzungsstudium, ein Masterstudiengang oder ein duales Studium. Master programmes are eligible for funding. Studierende aller Nationalitäten und aller Fachrichtungen können sich bewerben. Students of all nationalities are not eligible for this grant. It pays 300 euros per month. Apply at your university. enrolling full-time in bachelor's degree courses. To access the scholarship in the first year of Bachelor’s degree. Students enrolled in bachelor's degree courses. Applicants must hold a Bachelor's degree. Open to holders of Bachelor's degree. For those who finished a Bachelor's degree. Enrolling in bachelor's degree courses and master's degree courses. After a Bachelor's degree. Open to students of all nationalities except Moroccan citizens. Nicht jedes Studium ist förderungsfähig. Not every course of study is eligible for funding. Every course of study is eligible only after the first degree.",
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

  it.each([
    "not open to students of any nationality other than German",
    "open to students of all nationalities except Chinese citizens",
    "Studierende aller Nationalitäten außer deutschen",
    "studenti di tutte le nazionalità tranne quella italiana",
  ])("is not open to international applicants when it excludes some (%s)", (quote) => {
    expect(mentionsInternationalApplicants(quote)).toBe(false);
  });

  it("does not take a mere mention of nationality for it", () => {
    expect(mentionsInternationalApplicants("Please state your nationality in the form")).toBe(
      false,
    );
  });

  it("makes an eligibility quote count", async () => {
    expect((await run()).ok).toBe(true);
  });

  it("drops 'all nationalities except Moroccan citizens' as an exclusion", async () => {
    const result = await run({
      evidence: evidence({
        eligibility: [q("open to students of all nationalities except Moroccan citizens")],
      }),
    });
    expect(result.ok).toBe(false);
  });

  it("still drops an exclusion", async () => {
    const result = await run({
      evidence: evidence({ eligibility: [q("Students of all nationalities are not eligible")] }),
    });
    expect(result.ok).toBe(false);
    expect(reasonsOf(result)).toMatch(/exclusion/);
  });
});

describe("in bachelor's degree courses", () => {
  const level = (quote: string) => run({ evidence: evidence({ level: [q(quote)] }) });

  it.each([
    "enrolling full-time in bachelor's degree courses",
    "To access the scholarship in the first year of Bachelor’s degree",
    "Students enrolled in bachelor's degree courses",
  ])("counts as the first degree (%s)", async (quote) => {
    expect((await level(quote)).ok).toBe(true);
  });

  it.each([
    "Applicants must hold a Bachelor's degree",
    "open to holders of Bachelor's degree",
    "for those who finished a Bachelor's degree",
    "enrolling in bachelor's degree courses and master's degree courses",
    "after a Bachelor's degree",
  ])("does not count when it is a prerequisite or mixed (%s)", async (quote) => {
    expect((await level(quote)).ok).toBe(false);
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
    "Nicht jedes Studium ist förderungsfähig",
    "Not every course of study is eligible for funding",
    "Every course of study is eligible only after the first degree",
  ])("does not count a negation or a later stage (%s)", async (quote) => {
    const result = await run({ evidence: evidence({ level: [q(quote)] }) });
    expect(result.ok).toBe(false);
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
