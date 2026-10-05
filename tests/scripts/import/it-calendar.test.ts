import { describe, expect, it } from "vitest";

import {
  checkRouteDates,
  dateInNote,
  parseVisaDeadlines,
} from "../../../scripts/import/it-calendar";

const PAGE =
  "Il presente termine vale per la richiesta di visti. Per l’anno accademico 2026/2027, le domande di visto dovranno essere presentate presso le Rappresentanze diplomatico-consolari competenti entro e non oltre il 30 novembre 2026 . Per l’anno accademico 2027/2028, invece, il termine ultimo per la presentazione delle domande di visto è fissato al 31 ottobre 2027. Il presente termine vale per la richiesta di visti al fine della frequenza di corsi ordinamentali.";

describe("parseVisaDeadlines", () => {
  it("reads the two academic-year deadlines from the sentences, never from typed dates", () => {
    expect(parseVisaDeadlines(PAGE)).toEqual([
      { academicYear: "2026/2027", date: "2026-11-30" },
      { academicYear: "2027/2028", date: "2027-10-31" },
    ]);
  });

  it("accepts a straight apostrophe and extra spaces", () => {
    const text = PAGE.replaceAll("’", "'").replace("30 novembre", "30  novembre");
    expect(parseVisaDeadlines(text).map((d) => d.date)).toEqual(["2026-11-30", "2027-10-31"]);
  });

  it("gives nothing when the sentence is absent or the date is impossible", () => {
    expect(parseVisaDeadlines("Nessuna scadenza qui")).toEqual([]);
    expect(
      parseVisaDeadlines(
        "Per l’anno accademico 2026/2027, le domande di visto dovranno essere presentate presso le Rappresentanze entro e non oltre il 31 novembre 2026.",
      ),
    ).toEqual([]);
  });
});

describe("dateInNote", () => {
  it("finds the date in English and French wording", () => {
    expect(dateInNote("by 30 November 2026 for 2026/2027", "2026-11-30", "en")).toBe(true);
    expect(dateInNote("au plus tard le 31 octobre 2027", "2027-10-31", "fr")).toBe(true);
    expect(dateInNote("by 30 November 2026", "2026-11-29", "en")).toBe(false);
    expect(dateInNote("by 30 November 2026", "2026-11-30", "fr")).toBe(false);
  });
});

describe("checkRouteDates", () => {
  const note = {
    en: "Visa application: by 30 November 2026 for 2026/2027 and by 31 October 2027 for 2027/2028.",
    fr: "Visa : au plus tard le 30 novembre 2026 (2026/2027) et le 31 octobre 2027 (2027/2028).",
  };

  it("passes when every page deadline is in both notes", () => {
    expect(checkRouteDates(parseVisaDeadlines(PAGE), note)).toEqual({ ok: true, problems: [] });
  });

  it("reports a date that the page changed and a page with no deadline", () => {
    const moved = parseVisaDeadlines(PAGE.replace("30 novembre 2026", "15 novembre 2026"));
    const result = checkRouteDates(moved, note);
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toMatch(/2026-11-15/);
    expect(checkRouteDates([], note).ok).toBe(false);
  });
});
