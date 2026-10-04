import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildDaadProposals,
  type DaadOutcome,
  daadDeadline,
  readDaadProgrammes,
} from "../../../scripts/import/daad-deadlines";
import { mentionsInternationalApplicants } from "../../../scripts/import/evidence";
import { ProposalSchema, verifyProposal } from "../../../scripts/import/proposals";

const page = (block: string, beginning = "Winter semester") =>
  `Some programme (Bachelor of Science) Mode of study full-time Beginning ${beginning} Application periods ${block} More information on application periods Please find more details on this website. Joint degree / double degree programme No`;
const ALL = "The following is valid for applicants from: all countries";
const TODAY = "2026-10-04";

const okIntake = (outcome: DaadOutcome) => {
  if (!outcome.ok) throw new Error(`expected ok, got ${outcome.reason}`);
  return outcome;
};

describe("daadDeadline", () => {
  it("reads 'until D' as a recurring deadline when no year is stated", () => {
    const block = `${ALL} For the winter semester: until 15 July`;
    const outcome = okIntake(daadDeadline(page(block), TODAY));
    expect(outcome.intake).toEqual({
      startDate: null,
      applicationOpens: null,
      applicationDeadline: null,
      recurringDeadline: { month: 7, day: 15 },
    });
    expect(outcome.quote).toBe(block);
  });

  it("takes the end of a range as the deadline and leaves the opening out without years", () => {
    const outcome = okIntake(
      daadDeadline(page(`${ALL} For the winter semester: 15 February - 31 May`), TODAY),
    );
    expect(outcome.intake.recurringDeadline).toEqual({ month: 5, day: 31 });
    expect(outcome.intake.applicationOpens).toBeNull();
  });

  it("accepts an unlabelled period only when the programme begins in the winter semester only", () => {
    const outcome = okIntake(daadDeadline(page(`${ALL} 1 November - 31 March`), TODAY));
    expect(outcome.intake.recurringDeadline).toEqual({ month: 3, day: 31 });
    const block = `${ALL} 15 October - 1 December`;
    expect(daadDeadline(page(block, "Summer semester"), TODAY)).toEqual({
      ok: false,
      reason: "summer-only",
    });
    expect(daadDeadline(page(block, "Winter and summer semester"), TODAY)).toEqual({
      ok: false,
      reason: "semester-unclear",
    });
    expect(
      daadDeadline(
        `Some programme Application periods ${block} More information on application periods`,
        TODAY,
      ),
    ).toEqual({ ok: false, reason: "semester-unclear" });
  });

  it("trusts a winter label whatever the programme's beginning field says", () => {
    const block = `${ALL} For the winter semester: until 15 July`;
    expect(daadDeadline(page(block, "Winter and summer semester"), TODAY).ok).toBe(true);
  });

  it("writes a dated deadline when the quote states the year, and drops a past one", () => {
    const future = okIntake(
      daadDeadline(page(`${ALL} For the winter semester: until 15 July 2027`), TODAY),
    );
    expect(future.intake.applicationDeadline).toBe("2027-07-15");
    expect(future.intake.recurringDeadline).toBeNull();
    expect(daadDeadline(page(`${ALL} For the winter semester: until 15 July 2026`), TODAY)).toEqual(
      { ok: false, reason: "past" },
    );
    expect(
      daadDeadline(page(`${ALL} For the winter semester: until 4 October 2026`), TODAY).ok,
    ).toBe(true);
  });

  it("keeps the opening only when both ends of a range state a year", () => {
    const dated = okIntake(
      daadDeadline(page(`${ALL} For the winter semester: 1 November 2026 - 31 March 2027`), TODAY),
    );
    expect(dated.intake.applicationOpens).toBe("2026-11-01");
    expect(dated.intake.applicationDeadline).toBe("2027-03-31");
    const mixed = okIntake(
      daadDeadline(page(`${ALL} For the winter semester: 1 November 2026 - 31 March`), TODAY),
    );
    expect(mixed.intake.applicationOpens).toBeNull();
    expect(mixed.intake.recurringDeadline).toEqual({ month: 3, day: 31 });
  });

  it("uses only the non-EU piece of a page with several audiences", () => {
    const nonEu =
      "The following is valid for applicants from: non-EU countries For the winter semester: 15 April - 15 May";
    const eu =
      "The following is valid for applicants from: EU countries Iceland Norway For the winter semester: 1 June - 15 July";
    const outcome = okIntake(daadDeadline(page(`${nonEu} ${eu}`), TODAY));
    expect(outcome.intake.recurringDeadline).toEqual({ month: 5, day: 15 });
    expect(outcome.quote).toBe(nonEu);
  });

  it("gives nothing for an EU-only audience", () => {
    const block =
      "The following is valid for applicants from: EU countries For the winter semester: until 15 July";
    expect(daadDeadline(page(block), TODAY)).toEqual({
      ok: false,
      reason: "no-qualifying-audience",
    });
  });

  it("ignores a summer period and picks the winter one", () => {
    const summer = `${ALL} For the summer semester: until 15 January`;
    const winter = `${ALL} For the winter semester: until 15 July`;
    expect(daadDeadline(page(summer), TODAY)).toEqual({ ok: false, reason: "summer-only" });
    expect(
      okIntake(daadDeadline(page(`${summer} ${winter}`), TODAY)).intake.recurringDeadline,
    ).toEqual({ month: 7, day: 15 });
  });

  it("refuses two different winter deadlines and accepts two identical ones", () => {
    const a = `${ALL} For the winter semester: until 15 July`;
    const b = `${ALL} For the winter semester: until 1 June`;
    expect(daadDeadline(page(`${a} ${b}`), TODAY)).toEqual({ ok: false, reason: "ambiguous" });
    expect(daadDeadline(page(`${a} ${a}`), TODAY).ok).toBe(true);
  });

  it("gives nothing when there is no block or the block is not in the grammar", () => {
    expect(daadDeadline("Programme duration 7 semesters", TODAY)).toEqual({
      ok: false,
      reason: "no-block",
    });
    for (const block of [
      "This programme has no deadline listed.",
      "At Frankfurt School, programmes start in the winter semester each year. Our application platform opens in September, and the application deadline is at the end of June.",
      "31 August for winter semester 28./29. February for summer semester",
      `${ALL} For the winter semester: until 31 February`,
      `${ALL} For the winter semester: until 15 Julyish`,
    ])
      expect(daadDeadline(page(block), TODAY)).toEqual({ ok: false, reason: "unparsed" });
  });

  it("refuses an audience that is not one of the shapes DAAD prints", () => {
    for (const block of [
      "The following is valid for applicants from: non-EU countries For the summer semester (first-year students): until 15 January",
      "The following is valid for applicants from: non-EU countries For the Summer semester: until 15 January",
      "The following is valid for applicants from: non-EU countries For the next winter semester: until 31 August",
      "The following is valid for applicants from: EU countries, non-EU countries excluded until 15 July",
    ])
      expect(daadDeadline(page(block), TODAY).ok).toBe(false);
  });

  it("refuses a dated range that ends before it starts", () => {
    expect(
      daadDeadline(page(`${ALL} For the winter semester: 1 November 2027 - 31 March 2027`), TODAY),
    ).toEqual({ ok: false, reason: "unparsed" });
  });

  it("handles a deadline year without an opening year, and a leap day", () => {
    const mixed = okIntake(
      daadDeadline(page(`${ALL} For the winter semester: 1 November - 31 March 2027`), TODAY),
    );
    expect(mixed.intake.applicationOpens).toBeNull();
    expect(mixed.intake.applicationDeadline).toBe("2027-03-31");
    const leap = okIntake(
      daadDeadline(page(`${ALL} For the winter semester: until 29 February`), TODAY),
    );
    expect(leap.intake.recurringDeadline).toEqual({ month: 2, day: 29 });
    expect(
      daadDeadline(page(`${ALL} For the winter semester: until 29 February 2027`), TODAY),
    ).toEqual({
      ok: false,
      reason: "unparsed",
    });
  });

  it("only yields quotes that name international applicants", () => {
    for (const block of [
      `${ALL} For the winter semester: until 15 July`,
      `${ALL} 1 November - 31 March`,
      "The following is valid for applicants from: non-EU countries For the winter semester: 15 April - 15 May",
      "The following is valid for applicants from: EU countries non-EU countries For the winter semester: until 15 August",
    ]) {
      const outcome = okIntake(daadDeadline(page(block), TODAY));
      expect(mentionsInternationalApplicants(outcome.quote)).toBe(true);
    }
  });
});

describe("buildDaadProposals", () => {
  const url = (id: number) =>
    `https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/${id}/`;
  const texts = new Map<string, string>([
    [url(1), page(`${ALL} For the winter semester: until 15 July`)],
    [url(2), page("This programme has no deadline listed.")],
    [url(4), page(`${ALL} For the winter semester: until 15 July 2027`)],
  ]);
  const textOf = async (u: string): Promise<string> => {
    const text = texts.get(u);
    if (text === undefined) throw new Error("unreachable");
    return text;
  };
  const programmes = [
    { slug: "de-a-daad1", url: url(1) },
    { slug: "de-b-daad2", url: url(2) },
    { slug: "de-c-daad3", url: url(3) },
    { slug: "de-d-daad4", url: url(4) },
  ];

  it("makes parseable intake-only proposals citing the DAAD page, and reports the rest", async () => {
    const { proposals, skipped } = await buildDaadProposals({ programmes, textOf, today: TODAY });
    expect(proposals.map((p) => p.slug)).toEqual(["de-a-daad1", "de-d-daad4"]);
    for (const proposal of proposals) {
      expect(() => ProposalSchema.parse(proposal)).not.toThrow();
      expect(proposal.programmePage).toContain("daad.de");
      expect(Object.keys(proposal.facts)).toEqual(["intakes"]);
      expect(proposal.facts.intakes?.evidence).toHaveLength(1);
    }
    expect(skipped).toEqual([
      { slug: "de-b-daad2", reason: "unparsed" },
      { slug: "de-c-daad3", reason: "page unreadable" },
    ]);
  });

  it("makes proposals that verifyProposal accepts", async () => {
    const { proposals } = await buildDaadProposals({ programmes, textOf, today: TODAY });
    for (const proposal of proposals) {
      const verified = await verifyProposal(proposal, "Some programme", textOf);
      expect(verified.rejected).toEqual([]);
      expect(Object.keys(verified.facts)).toEqual(["intakes"]);
    }
  });
});

describe("readDaadProgrammes", () => {
  it("returns the German DAAD programmes that hold no intake at all (an official intake is never overwritten)", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "daad-deadlines-"));
    try {
      const dir = path.join(root, "programs");
      await mkdir(dir, { recursive: true });
      const daadUrl = (id: number) =>
        `https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/${id}/`;
      const record = (slug: string, officialUrl: string, intakes: string) =>
        `slug: ${slug}\ninstitution: x\ncountry: ${slug.slice(0, 2).toUpperCase()}\nofficialUrl: ${officialUrl}\n${intakes}sources:\n  programme:\n    url: ${officialUrl}\n    last_verified_at: 2026-10-01\n`;
      const withDeadline =
        "intakes:\n  value:\n    - startDate: null\n      applicationOpens: null\n      applicationDeadline: null\n      recurringDeadline:\n        month: 7\n        day: 15\n  source: programme\n  info_kind: official\n";
      const noDeadline =
        "intakes:\n  value:\n    - startDate: 2027-10-01\n      applicationOpens: null\n      applicationDeadline: null\n  source: programme\n  info_kind: official\n";
      await writeFile(path.join(dir, "de-a-daad1.yaml"), record("de-a-daad1", daadUrl(1), ""));
      await writeFile(
        path.join(dir, "de-b-daad2.yaml"),
        record("de-b-daad2", daadUrl(2), withDeadline),
      );
      await writeFile(
        path.join(dir, "de-c-daad3.yaml"),
        record("de-c-daad3", daadUrl(3), noDeadline),
      );
      await writeFile(
        path.join(dir, "de-d-studiensuche.yaml"),
        record("de-d-studiensuche", "https://www.hs-example.de/studium/", ""),
      );
      await writeFile(path.join(dir, "fr-e-daad5.yaml"), record("fr-e-daad5", daadUrl(5), ""));
      expect(await readDaadProgrammes(root)).toEqual([{ slug: "de-a-daad1", url: daadUrl(1) }]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
