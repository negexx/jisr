import { describe, expect, it } from "vitest";

import {
  checkChannel,
  checkDeadline,
  checkDuration,
  checkLanguages,
  checkTuition,
  htmlToText,
  normalizeForMatch,
  programmeNameMatches,
  quoteInText,
} from "../../../scripts/import/evidence";

describe("htmlToText", () => {
  it("drops scripts and styles, splits blocks and decodes entities", () => {
    const html = `<html><head><style>p{}</style><script>var a="Tuition 1500"</script></head><body>
      <h1>B.Sc. Computer&nbsp;Science</h1><p>Duration: 6&nbsp;semesters &ndash; full-time</p><ul><li>English</li><li>Fran&ccedil;ais</li></ul></body></html>`;
    const text = htmlToText(html);
    expect(text).toBe("B.Sc. Computer Science Duration: 6 semesters - full-time English Français");
    expect(text).not.toMatch(/Tuition 1500|p\{\}/);
  });
  it("decodes numeric entities", () => {
    expect(htmlToText("<p>&#8364;1,500 &#x2013; per year</p>")).toBe("€1,500 – per year");
  });
});

describe("quoteInText", () => {
  const text = htmlToText(
    "<p>The programme   is taught entirely in <b>English</b>. Tuition fees: €1,500 per semester.</p>",
  );
  it("accepts a verbatim quote regardless of case, spacing and typographic marks", () => {
    expect(quoteInText("taught entirely in English", text)).toBe(true);
    expect(quoteInText("THE PROGRAMME IS TAUGHT ENTIRELY", text)).toBe(true);
    expect(quoteInText("it’s fine".replace("fine", "x"), "it's x was here and there")).toBe(false);
  });
  it("rejects invented, altered or too-short quotes", () => {
    expect(quoteInText("taught entirely in French", text)).toBe(false);
    expect(quoteInText("Tuition fees: €2,000 per semester", text)).toBe(false);
    expect(quoteInText("English", text)).toBe(false);
  });
  it("normalises dashes and apostrophes on both sides", () => {
    expect(
      quoteInText("l’admission – dossier complet", "L'admission - dossier complet est requis"),
    ).toBe(true);
    expect(normalizeForMatch("A ­ B​")).toBe("a b");
  });
});

describe("programmeNameMatches", () => {
  it("needs most distinctive words of the programme name on the page", () => {
    const page = "Bachelor Applied Computer Science - Faculty of Informatics, Winter semester";
    expect(programmeNameMatches("Applied Computer Science (B.Sc.)", page)).toBe(true);
    expect(programmeNameMatches("Mechanical Engineering", page)).toBe(false);
  });
});

describe("checkDuration", () => {
  it("accepts years, semesters or ECTS that match the value", () => {
    expect(checkDuration(3, "The degree takes three years").ok).toBe(true);
    expect(checkDuration(3, "Duration: 6 semesters").ok).toBe(true);
    expect(checkDuration(3, "180 ECTS credits").ok).toBe(true);
    expect(checkDuration(3.5, "7 semesters of study").ok).toBe(true);
    expect(checkDuration(3, "Durée : 3 ans").ok).toBe(true);
    expect(checkDuration(3, "Regelstudienzeit: 6 Semester").ok).toBe(true);
  });
  it("rejects a value the quote does not state", () => {
    expect(checkDuration(4, "Duration: 6 semesters").ok).toBe(false);
    expect(checkDuration(3, "A degree in computer science").ok).toBe(false);
  });
});

describe("checkLanguages", () => {
  it("requires each language to be named in the quote", () => {
    expect(checkLanguages(["en"], "Language of instruction: English").ok).toBe(true);
    expect(checkLanguages(["nl"], "Taal Nederlands").ok).toBe(true);
    expect(checkLanguages(["en", "de"], "Taught in English and German").ok).toBe(true);
    expect(checkLanguages(["en", "de"], "Taught in English").ok).toBe(false);
    expect(checkLanguages(["fr"], "Cours dispensés en français").ok).toBe(true);
  });
});

describe("checkTuition", () => {
  it("finds the amount in several number formats", () => {
    expect(checkTuition(150000, "Tuition: €1,500 per semester").ok).toBe(true);
    expect(checkTuition(150000, "Studiengebühr 1.500 Euro").ok).toBe(true);
    expect(checkTuition(150000, "Frais : 1 500 euros").ok).toBe(true);
    expect(checkTuition(289500, "2 895 € pour une licence").ok).toBe(true);
    expect(checkTuition(260100, "collegegeld € 2.601").ok).toBe(true);
  });
  it("does not match a longer number that merely contains the digits", () => {
    expect(checkTuition(150000, "Fee: 21,500 EUR").ok).toBe(false);
    expect(checkTuition(150000, "No fee stated").ok).toBe(false);
  });
  it("accepts a zero fee only with a statement that there are none", () => {
    expect(checkTuition(0, "There are no tuition fees for this programme").ok).toBe(true);
    expect(checkTuition(0, "Semester contribution 150 euros").ok).toBe(false);
  });
  it("accepts the register wording 'Tuition fees per semester None' as a zero fee", () => {
    expect(checkTuition(0, "Tuition fees per semester None").ok).toBe(true);
    expect(checkTuition(0, "Tuition fees: none").ok).toBe(true);
  });
  it("does not read 'none' elsewhere as a zero fee", () => {
    expect(checkTuition(0, "Semester contribution 150 euros. Scholarships: none").ok).toBe(false);
    expect(
      checkTuition(0, "Tuition fees per semester None for EU students, 1,500 EUR for non-EU").ok,
    ).toBe(false);
  });
});

describe("checkDeadline", () => {
  it("matches day and month names in four languages and numeric forms", () => {
    expect(checkDeadline("2027-07-15", "Apply by 15 July 2027").ok).toBe(true);
    expect(checkDeadline("2027-07-15", "Bewerbungsfrist: 15. Juli 2027").ok).toBe(true);
    expect(checkDeadline("2027-01-15", "avant le 15 janvier 2027").ok).toBe(true);
    expect(checkDeadline("2027-05-01", "uiterlijk 1 mei 2027").ok).toBe(true);
    expect(checkDeadline("2027-07-15", "deadline 15/07/2027").ok).toBe(true);
  });
  it("rejects a date the quote does not contain", () => {
    expect(checkDeadline("2027-07-15", "Apply by 1 June 2027").ok).toBe(false);
    expect(checkDeadline("2027-07-15", "Apply by 15 August").ok).toBe(false);
  });
  it("refuses a date whose year the quote does not state", () => {
    expect(checkDeadline("2027-05-01", "uiterlijk 1 mei").ok).toBe(false);
    expect(checkDeadline("2027-07-27", "Apply by 27 July 2026").ok).toBe(false);
  });
});

describe("checkChannel", () => {
  it("only verifies channels it knows, by name", () => {
    expect(checkChannel("fr-parcoursup", "Candidatez sur Parcoursup avant le 1er avril").ok).toBe(
      true,
    );
    expect(checkChannel("nl-studielink", "Register via Studielink").ok).toBe(true);
    expect(checkChannel("fr-campus-france", "passent obligatoirement par Campus France").ok).toBe(
      true,
    );
    expect(checkChannel("nl-studielink", "Register via the portal").ok).toBe(false);
    expect(
      checkChannel(
        "de-uni-assist-vpd",
        "We will issue you with a preliminary review documentation (VPD).",
      ).ok,
    ).toBe(true);
    expect(checkChannel("de-uni-assist-vpd", "Apply on our website").ok).toBe(false);
    expect(
      checkChannel(
        "de-university-direct",
        "upload the recognition results to the Pforzheim University application portal",
      ).ok,
    ).toBe(true);
    expect(checkChannel("unknown-channel", "anything at all here").ok).toBe(false);
  });
});
