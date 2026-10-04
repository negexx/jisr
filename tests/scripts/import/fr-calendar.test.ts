import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { type National, PAGES } from "../../../scripts/import/enrich-fr";
import { mentionsInternationalApplicants } from "../../../scripts/import/evidence";
import {
  buildCalendarProposals,
  writeCalendarProposals,
} from "../../../scripts/import/fr-calendar";
import { ProposalSchema, verifyProposal } from "../../../scripts/import/proposals";

const SENTENCE = "Du 1er octobre 2026 au 15 novembre 2026 à 23h59 (heure marocaine).";
const LICENCE_SENTENCE = "Du 20 janvier 2027 au 2 mars 2027 à 23h59 (heure marocaine).";
const LICENCE_URL = "https://www.maroc.campusfrance.org/calendrier-licence";

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
const slugs = [
  { slug: "fr-iut-a-but-informatique", isBut: true },
  { slug: "fr-iut-b-but-gea", isBut: true },
  { slug: "fr-univ-a-licence-informatique", isBut: false },
];

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

  it("gives the Licence programmes their own calendar when there is one", () => {
    const national: National = {
      ...butOnly,
      licenceCalendar: { url: LICENCE_URL, quote: LICENCE_SENTENCE },
    };
    const proposals = buildCalendarProposals({ slugs, national });
    expect(proposals).toHaveLength(3);
    expect(proposals[2]?.facts.intakes).toEqual({
      value: [
        { startDate: null, applicationOpens: "2027-01-20", applicationDeadline: "2027-03-02" },
      ],
      evidence: [{ url: LICENCE_URL, quote: LICENCE_SENTENCE }],
    });
  });

  it("produces nothing when no calendar was read", () => {
    expect(buildCalendarProposals({ slugs, national: nothing })).toEqual([]);
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
    for (const p of buildCalendarProposals({ slugs, national: butOnly })) {
      expect(() => ProposalSchema.parse(p)).not.toThrow();
      const quote = p.facts.intakes?.evidence[0]?.quote ?? "";
      expect(mentionsInternationalApplicants(quote)).toBe(true);
    }
  });
});

describe("verifyProposal on a calendar proposal", () => {
  const [proposal] = buildCalendarProposals({ slugs, national: butOnly });
  if (proposal === undefined) throw new Error("no proposal");
  const name = "BUT - Informatique";

  it("accepts it against a page that carries the sentence", async () => {
    const page = `Calendrier de candidature. ${SENTENCE} Ensuite, patientez.`;
    const verified = await verifyProposal(proposal, name, async () => page);
    expect(verified.rejected).toEqual([]);
    expect(verified.facts.intakes?.value).toEqual([
      { startDate: null, applicationOpens: "2026-10-01", applicationDeadline: "2026-11-15" },
    ]);
  });

  it("rejects it when the page lacks the sentence", async () => {
    const verified = await verifyProposal(proposal, name, async () => "Une autre page.");
    expect(verified.facts.intakes).toBeUndefined();
    expect(verified.rejected).toEqual([
      { fact: "intakes", reason: "no quote was found verbatim on the cited page(s)" },
    ]);
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
