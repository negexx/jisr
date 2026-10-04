import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { type National, PAGES } from "../../../scripts/import/enrich-fr";
import { mentionsInternationalApplicants } from "../../../scripts/import/evidence";
import {
  buildCalendarProposals,
  programmeKind,
  staleProposalFiles,
  writeCalendarProposals,
} from "../../../scripts/import/fr-calendar";
import { ProposalSchema, verifyProposal } from "../../../scripts/import/proposals";

const SENTENCE = "Du 1er octobre 2026 au 15 novembre 2026 à 23h59 (heure marocaine).";
const LICENCE_SENTENCE = "Du 20 janvier 2027 au 2 mars 2027 à 23h59 (heure marocaine).";
const LICENCE_URL = "https://www.maroc.campusfrance.org/calendrier-licence";
const APPLY_BUT_QUOTE =
  "Bac marocain ou Bac international marocain ou diplôme européen, quelque soit votre lieu de résidence, vous devrez formuler vos vœux sur la plateforme Études en France.";
const APPLY_LICENCE_QUOTE =
  "Vous êtes titulaire ou futur titulaire du Bac marocain, Bac international marocain : vous devrez formuler vos vœux sur la plateforme Études en France";

const nothing: National = {
  licenceDuration: null,
  butDuration: null,
  tuition: null,
  exemption: null,
  certification: null,
  applyLicence: null,
  applyBut: null,
  butCalendar: null,
  licenceCalendar: null,
};
const butOnly: National = { ...nothing, butCalendar: { url: PAGES.applyBut, quote: SENTENCE } };
const withApply: National = {
  ...butOnly,
  applyBut: { url: PAGES.applyBut, quote: APPLY_BUT_QUOTE },
  applyLicence: { url: PAGES.applyLicence, quote: APPLY_LICENCE_QUOTE },
};
const slugs = [
  { slug: "fr-iut-a-but-informatique", kind: "but" },
  { slug: "fr-iut-b-but-gea", kind: "but" },
  { slug: "fr-univ-a-licence-informatique", kind: "licence" },
  { slug: "fr-ecole-diplome-maison", kind: "other" },
] as const;

describe("buildCalendarProposals", () => {
  it("gives every BUT programme the intake-only proposal and every Licence none while its calendar is null", () => {
    const proposals = buildCalendarProposals({ slugs, national: butOnly });
    expect(proposals.map((p) => p.slug)).toEqual(["fr-iut-a-but-informatique", "fr-iut-b-but-gea"]);
    expect(proposals[0]).toEqual({
      slug: "fr-iut-a-but-informatique",
      programmePage: null,
      facts: {
        intakes: {
          value: [
            { startDate: null, applicationOpens: "2026-10-01", applicationDeadline: "2026-11-15" },
          ],
          evidence: [{ url: PAGES.applyBut, quote: SENTENCE }],
        },
      },
    });
  });

  it("adds the page that says who the application is for as a second quote", () => {
    const [first] = buildCalendarProposals({ slugs, national: withApply });
    expect(first?.facts.intakes?.evidence).toEqual([
      { url: PAGES.applyBut, quote: SENTENCE },
      { url: PAGES.applyBut, quote: APPLY_BUT_QUOTE },
    ]);
  });

  it("gives the Licence programmes their own calendar when there is one, and never a non-Licence record", () => {
    const national: National = {
      ...withApply,
      licenceCalendar: { url: LICENCE_URL, quote: LICENCE_SENTENCE },
    };
    const proposals = buildCalendarProposals({ slugs, national });
    expect(proposals.map((p) => p.slug)).toEqual([
      "fr-iut-a-but-informatique",
      "fr-iut-b-but-gea",
      "fr-univ-a-licence-informatique",
    ]);
    expect(proposals[2]?.facts.intakes).toEqual({
      value: [
        { startDate: null, applicationOpens: "2027-01-20", applicationDeadline: "2027-03-02" },
      ],
      evidence: [
        { url: LICENCE_URL, quote: LICENCE_SENTENCE },
        { url: PAGES.applyLicence, quote: APPLY_LICENCE_QUOTE },
      ],
    });
  });

  it("produces nothing when no calendar was read", () => {
    expect(buildCalendarProposals({ slugs, national: nothing })).toEqual([]);
    expect(
      buildCalendarProposals({
        slugs,
        national: { ...withApply, butCalendar: null, licenceCalendar: null },
      }),
    ).toEqual([]);
  });

  it("produces nothing for a kind whose sentence cannot be parsed", () => {
    const national: National = {
      ...nothing,
      butCalendar: {
        url: PAGES.applyBut,
        quote: "Du 31 février 2026 au 1er mars 2026 (heure marocaine).",
      },
    };
    expect(buildCalendarProposals({ slugs, national })).toEqual([]);
  });

  it("makes proposals that parse and whose quote says who the deadline is for", () => {
    for (const national of [butOnly, withApply])
      for (const p of buildCalendarProposals({ slugs, national })) {
        expect(() => ProposalSchema.parse(p)).not.toThrow();
        const quote = p.facts.intakes?.evidence[0]?.quote ?? "";
        expect(mentionsInternationalApplicants(quote)).toBe(true);
      }
  });
});

describe("programmeKind", () => {
  it("tells BUT, Licence (also double) and anything else apart by the name", () => {
    expect(programmeKind({ slug: "fr-x", name: "BUT - Informatique" })).toBe("but");
    expect(programmeKind({ slug: "fr-x-but-y", name: "Informatique" })).toBe("but");
    expect(programmeKind({ slug: "fr-x", name: "Licence - Informatique" })).toBe("licence");
    expect(programmeKind({ slug: "fr-x", name: "Double licence - Droit et Gestion" })).toBe(
      "licence",
    );
    expect(programmeKind({ slug: "fr-x", name: "Master - Informatique" })).toBe("other");
    expect(programmeKind({ slug: "fr-x", name: "Diplôme d'ingénieur" })).toBe("other");
  });
});

describe("verifyProposal on a calendar proposal", () => {
  const name = "BUT - Informatique";
  const first = (national: National) => {
    const [proposal] = buildCalendarProposals({ slugs, national });
    if (proposal === undefined) throw new Error("no proposal");
    return proposal;
  };
  const pageWith =
    (...parts: string[]) =>
    async () =>
      `Calendrier de candidature. ${parts.join(" ")} Ensuite, patientez.`;

  it("accepts it against a page that carries the sentence, with or without the apply quote", async () => {
    for (const national of [butOnly, withApply]) {
      const verified = await verifyProposal(
        first(national),
        name,
        pageWith(SENTENCE, APPLY_BUT_QUOTE),
      );
      expect(verified.rejected).toEqual([]);
      expect(verified.facts.intakes?.value).toEqual([
        { startDate: null, applicationOpens: "2026-10-01", applicationDeadline: "2026-11-15" },
      ]);
    }
  });

  it("keeps who the deadline is for in the audit trail, not only the time-zone word", async () => {
    const noZone: National = {
      ...withApply,
      butCalendar: {
        url: PAGES.applyBut,
        quote: "Du 1er octobre 2026 au 15 novembre 2026 à 23h59.",
      },
    };
    const page = pageWith("Du 1er octobre 2026 au 15 novembre 2026 à 23h59.", APPLY_BUT_QUOTE);
    const verified = await verifyProposal(first(noZone), name, page);
    expect(verified.rejected).toEqual([]);
    expect(verified.facts.intakes?.evidence).toHaveLength(2);
    const alone = await verifyProposal(first({ ...noZone, applyBut: null }), name, page);
    expect(alone.facts.intakes).toBeUndefined();
  });

  it("rejects it when the page lacks the sentence", async () => {
    for (const national of [butOnly, withApply]) {
      const verified = await verifyProposal(first(national), name, async () => "Une autre page.");
      expect(verified.facts.intakes).toBeUndefined();
      expect(verified.rejected).toEqual([
        { fact: "intakes", reason: "no quote was found verbatim on the cited page(s)" },
      ]);
    }
  });
});

describe("staleProposalFiles", () => {
  it("lists json files the run did not produce, and nothing for a missing directory", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "fr-calendar-stale-"));
    try {
      const proposals = buildCalendarProposals({ slugs, national: butOnly });
      expect(await staleProposalFiles(path.join(dir, "missing"), proposals)).toEqual([]);
      await writeFile(path.join(dir, "fr-iut-a-but-informatique.json"), "{}");
      await writeFile(path.join(dir, "fr-old-programme.json"), "{}");
      await writeFile(path.join(dir, "notes.txt"), "x");
      expect(await staleProposalFiles(dir, proposals)).toEqual(["fr-old-programme.json"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("writeCalendarProposals", () => {
  it("writes one json file per proposal, and nothing on a dry run", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "fr-calendar-"));
    try {
      const proposals = buildCalendarProposals({ slugs, national: butOnly });
      const out = path.join(dir, "proposals-fr-calendar");
      await writeCalendarProposals(proposals, out, true);
      await expect(readdir(out)).rejects.toThrow();
      await writeCalendarProposals(proposals, out, false);
      expect((await readdir(out)).sort()).toEqual([
        "fr-iut-a-but-informatique.json",
        "fr-iut-b-but-gea.json",
      ]);
      const back = JSON.parse(await readFile(path.join(out, "fr-iut-b-but-gea.json"), "utf8"));
      expect(ProposalSchema.parse(back).slug).toBe("fr-iut-b-but-gea");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
