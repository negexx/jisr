import { describe, expect, it } from "vitest";

import {
  checkChannel,
  checkDeadline,
  checkDuration,
  checkLanguages,
  checkRecurringDeadline,
  checkTuition,
  countDates,
  currentStudyYear,
  htmlToText,
  INCOME_WORDS,
  mentionsInternationalApplicants,
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
    // the Study Finder misspells the unit
    expect(checkDuration(4, "Duration of the course / programme: 8 semsters semesters").ok).toBe(
      true,
    );
    expect(checkDuration(3.5, "7 semsters").ok).toBe(true);
    expect(checkDuration(3.5, "8 semsters").ok).toBe(false);
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
    expect(checkLanguages(["hu"], "Language of instruction: Hungarian").ok).toBe(true);
    expect(checkLanguages(["hu"], "Language of instruction: English").ok).toBe(false);
    expect(checkLanguages(["it"], "Language of instruction: Italian").ok).toBe(true);
    expect(checkLanguages(["it"], "Lingua di erogazione: italiano").ok).toBe(true);
    expect(checkLanguages(["it"], "Language of instruction: English").ok).toBe(false);
    expect(checkLanguages(["it"], "The programme is taught in Italian").ok).toBe(true);
    expect(checkLanguages(["it"], "Corso erogato in lingua italiana").ok).toBe(true);
    expect(checkLanguages(["it"], "Cours dispensés en italien").ok).toBe(true);
    expect(checkLanguages(["it"], "Unterrichtssprache: Italienisch").ok).toBe(true);
    // "Italian" in the sense of nationality or place is not the teaching language
    for (const quote of [
      "Taught in English; open to Italian and international students",
      "Taught in English at one of the best Italian universities",
      "Tuition fees for Italian citizens and EU students",
      "Italian language courses are offered to all students",
      "Le diplôme italien est reconnu",
      "Das italienische Studiensystem",
    ])
      expect(checkLanguages(["it"], quote).ok).toBe(false);
    expect(
      checkLanguages(["en", "it"], "Taught in English; open to Italian and international students")
        .ok,
    ).toBe(false);
    expect(checkLanguages(["nl"], "Taal Nederlands").ok).toBe(true);
    expect(checkLanguages(["en", "de"], "Taught in English and German").ok).toBe(true);
    expect(checkLanguages(["en", "de"], "Taught in English").ok).toBe(false);
    expect(checkLanguages(["fr"], "Cours dispensés en français").ok).toBe(true);
  });
});

describe("checkTuition", () => {
  describe("a fee range", () => {
    const quote =
      "Tuition fees range from EUR 156 to EUR 2,600 a year, depending on the ISEE of the family.";
    it("accepts a range whose two amounts are both in the quote, in the stated currency", () => {
      expect(checkTuition(15600, quote, 2026, "EUR", 260000, "income_based").ok).toBe(true);
    });
    it("rejects a range whose maximum is not in the quote", () => {
      expect(checkTuition(15600, quote, 2026, "EUR", 300000, "income_based").ok).toBe(false);
    });
    it("rejects a range whose minimum is not in the quote", () => {
      expect(checkTuition(20000, quote, 2026, "EUR", 260000, "income_based").ok).toBe(false);
    });
    it("rejects a maximum below the minimum", () => {
      expect(checkTuition(260000, quote, 2026, "EUR", 15600).ok).toBe(false);
    });
    it("accepts a range with no basis when the quote only states the two fees", () => {
      expect(
        checkTuition(15600, "Fees: EUR 156 - EUR 2,600 per year.", 2026, "EUR", 260000).ok,
      ).toBe(true);
    });
    it("refuses income_based unless the quote mentions income", () => {
      const noIncome = "Tuition fees range from EUR 156 to EUR 2,600 a year.";
      expect(checkTuition(15600, noIncome, 2026, "EUR", 260000, "income_based").ok).toBe(false);
      expect(
        checkTuition(
          15600,
          "Le tasse vanno da 156 a 2.600 euro in base al reddito (ISEE).",
          2026,
          "EUR",
          260000,
          "income_based",
        ).ok,
      ).toBe(true);
    });
    it("still applies the stale-study-year guard to a range", () => {
      const old = "2019/20: tuition fees range from EUR 156 to EUR 2,600 a year (ISEE).";
      expect(checkTuition(15600, old, 2026, "EUR", 260000, "income_based").ok).toBe(false);
    });
    it("leaves the single-fee behaviour unchanged", () => {
      expect(checkTuition(150000, "Tuition: €1,500 per semester", 2026, "EUR").ok).toBe(true);
    });
    it("accepts a zero minimum only when the quote names a free tier", () => {
      expect(
        checkTuition(
          0,
          "Fees range from EUR 0 to EUR 2,600 a year depending on income.",
          2026,
          "EUR",
          260000,
          "income_based",
        ).ok,
      ).toBe(true);
      expect(
        checkTuition(
          0,
          "Students on low income are esente; the highest fee is EUR 2,600 a year (reddito).",
          2026,
          "EUR",
          260000,
          "income_based",
        ).ok,
      ).toBe(true);
      expect(
        checkTuition(
          0,
          "The highest fee is EUR 2,600 a year, depending on income.",
          2026,
          "EUR",
          260000,
          "income_based",
        ).ok,
      ).toBe(false);
    });
    it("matches income words in the languages the sources use", () => {
      expect(INCOME_WORDS.test("Einkommen")).toBe(true);
      expect(INCOME_WORDS.test("revenus")).toBe(true);
      expect(INCOME_WORDS.test("incomes tax")).toBe(false);
    });
  });
  it("reads the amount in the currency's own minor units: forints are whole", () => {
    const quote = "Tuition fee: 1 500 000 HUF per semester";
    expect(checkTuition(1500000, quote, 2026, "HUF").ok).toBe(true);
    expect(checkTuition(150000000, quote, 2026, "HUF").ok).toBe(false);
  });
  it("keeps hundredths when the currency is EUR or not given", () => {
    expect(checkTuition(150000, "Tuition: €1,500 per semester", 2026, "EUR").ok).toBe(true);
    expect(checkTuition(1500, "Tuition: €1,500 per semester", 2026, "EUR").ok).toBe(false);
  });
  it("finds the amount in several number formats", () => {
    expect(checkTuition(150000, "Tuition: €1,500 per semester", 2026).ok).toBe(true);
    expect(checkTuition(150000, "Studiengebühr 1.500 Euro", 2026).ok).toBe(true);
    expect(checkTuition(150000, "Frais : 1 500 euros", 2026).ok).toBe(true);
    expect(checkTuition(289500, "2 895 € pour une licence", 2026).ok).toBe(true);
    expect(checkTuition(260100, "collegegeld € 2.601", 2026).ok).toBe(true);
  });
  it("does not match a longer number that merely contains the digits", () => {
    expect(checkTuition(150000, "Fee: 21,500 EUR", 2026).ok).toBe(false);
    expect(checkTuition(150000, "No fee stated", 2026).ok).toBe(false);
  });
  it("takes the study year written next to the amount, and refuses a past one", () => {
    const current = "Studiejaar 2026-2027 Instellingscollegegeld Voltijd: € 10.360";
    expect(checkTuition(1036000, current, 2026).ok).toBe(true);
    expect(
      checkTuition(1016400, "Studiejaar 2025-2026 Instellingscollegegeld Voltijd: € 10.164", 2026)
        .ok,
    ).toBe(false);
    const both =
      "Instellingscollegegeld 2026-2027: € 10.360 Instellingscollegegeld 2025-2026: € 10.164";
    expect(checkTuition(1036000, both, 2026).ok).toBe(true);
    expect(checkTuition(1016400, both, 2026).ok).toBe(false);
    expect(checkTuition(1036000, "collegegeld 2026/27 is € 10.360", 2026).ok).toBe(true);
    expect(checkTuition(1036000, "collegegeld 2026-27 is € 10.360", 2026).ok).toBe(true);
    expect(checkTuition(1016400, "collegegeld 2025/26 is € 10.164", 2026).ok).toBe(false);
  });
  it("accepts a quote with no study year (a programme page) and keeps the zero rule", () => {
    expect(checkTuition(1036000, "Instellingscollegegeld € 10.360", 2026).ok).toBe(true);
    expect(checkTuition(0, "There are no tuition fees 2025-2026", 2026).ok).toBe(true);
  });
  it("refuses an old-year amount when the years are column headers, and accepts the real current one next to its own label", () => {
    const table =
      "er zijn 2 mogelijkheden: 2025-2026 2026-2027 wettelijk collegegeld € 2.601,- € 2.694,- instellingscollegegeld € 10.164,- € 10.528,-";
    expect(checkTuition(1016400, table, 2026).ok).toBe(false);
    expect(checkTuition(1052800, table, 2026).ok).toBe(false);
    expect(
      checkTuition(1052800, "Het reguliere instellingscollegegeld van € 10.528", 2026).ok,
    ).toBe(true);
    expect(
      checkTuition(
        1052800,
        "2026-2027 2027-2028 instellingscollegegeld € 10.528,- € 10.800,-",
        2026,
      ).ok,
    ).toBe(true);
  });

  it("looks at the label before the amount first, and checks every occurrence of the amount", () => {
    const inholland =
      "studiejaar 2026-2027 Instellingscollegegeld Voltijd en duaal: € 10.360 Deeltijd: € 9.976 Oekraïne vanaf het studiejaar 2024-2025";
    expect(checkTuition(1036000, inholland, 2026).ok).toBe(true);
    const paren = "Tuition 2026-2027: € 10.360 (2025-2026: € 10.164)";
    expect(checkTuition(1036000, paren, 2026).ok).toBe(true);
    expect(checkTuition(1016400, paren, 2026).ok).toBe(false);
    const twice = "2025-2026: € 10.164 en daarna 2026-2027: € 10.164";
    expect(checkTuition(1016400, twice, 2026).ok).toBe(false);
    expect(checkTuition(1016400, "Voor € 10.164 geldt 2026-2027", 2026).ok).toBe(true);
    expect(checkTuition(1016400, "Voor € 10.164 geldt 2025-2026", 2026).ok).toBe(false);
    expect(
      checkTuition(1036000, "2027-2028 collegegeld € 10.360 en 2026-2027 collegegeld € 9.775", 2027)
        .ok,
    ).toBe(true);
  });

  it("does not take dates, spans of years or a 'since' label for a study year", () => {
    expect(
      checkTuition(1036000, "Updated 2025-11-03: instellingscollegegeld € 10.360", 2026).ok,
    ).toBe(true);
    expect(checkTuition(1036000, "Tarief 2024-2027: € 10.360", 2026).ok).toBe(true);
    expect(
      checkTuition(
        150000,
        "Seit dem Wintersemester 2017/18 beträgt der Beitrag 1.500 Euro pro Semester",
        2026,
      ).ok,
    ).toBe(true);
    expect(checkTuition(1036000, "Fee since 2019-2020: € 10.360", 2026).ok).toBe(true);
  });

  it("still refuses an old study year written after vanaf, from, ab or inside another word, and a header run split by the word eur", () => {
    for (const quote of [
      "Vanaf studiejaar 2025-2026 bedraagt het instellingscollegegeld € 10.164",
      "Tuition fee from 2025/26: € 10,164 per year",
      "Ab dem Wintersemester 2025/26 betragen die Studiengebühren 10.164 Euro",
      "zie tab 2025-2026 instellingscollegegeld € 10.164",
    ])
      expect(checkTuition(1016400, quote, 2026).ok).toBe(false);
    const split = "2025-2026 (in eur) 2026-2027 (in eur) instellingscollegegeld 10.164 10.528";
    expect(checkTuition(1016400, split, 2026).ok).toBe(false);
  });

  it("needs the quote to state the currency of the proposed amount", () => {
    expect(checkTuition(320000, "BSc Engineering Management 3200 2250", 2026, "EUR").ok).toBe(
      false,
    );
    expect(checkTuition(400000, "Bachelor degree programmes 4,000 6", 2026, "EUR").ok).toBe(false);
    expect(checkTuition(320000, "Tuition fee/semester 3,200 EUR", 2026, "EUR").ok).toBe(true);
    expect(checkTuition(300000, "Tuition: 3 000 € per semester", 2026, "EUR").ok).toBe(true);
    expect(checkTuition(300000, "Fee: 3000 Euro", 2026, "EUR").ok).toBe(true);
    expect(checkTuition(750000, "7,500 USD/year", 2026, "USD").ok).toBe(true);
    expect(checkTuition(750000, "Fee: US$7,500 per year", 2026, "USD").ok).toBe(true);
    expect(checkTuition(690000, "690,000 Ft", 2026, "HUF").ok).toBe(true);
    expect(checkTuition(750000, "7,500 EUR/year", 2026, "USD").ok).toBe(false);
    expect(checkTuition(100000, "Fee 1000 per year", 2026, "CHF").ok).toBe(true);
    // the currency must stand beside the amount, and the one after the amount wins
    expect(
      checkTuition(
        690000,
        "Tuition fee for non-European students: 690,000 per semester",
        2026,
        "HUF",
      ).ok,
    ).toBe(false);
    expect(checkTuition(30000, "non-European students: 3,000 per semester", 2026, "EUR").ok).toBe(
      false,
    );
    expect(checkTuition(300000, "690,000 HUF 3,000 EUR", 2026, "EUR").ok).toBe(true);
    expect(checkTuition(3000, "690,000 HUF 3,000 EUR", 2026, "HUF").ok).toBe(false);
    expect(checkTuition(690000, "690,000 HUF 3,000 EUR", 2026, "HUF").ok).toBe(true);
    expect(checkTuition(700000, "1 980 000 Ft 7 000 €", 2026, "EUR").ok).toBe(true);
    expect(checkTuition(1980000, "1 980 000 Ft 7 000 €", 2026, "HUF").ok).toBe(true);
    expect(checkTuition(1036000, "Instellingscollegegeld € 10.360", 2026, "EUR").ok).toBe(true);
    expect(checkTuition(340000, "Fee: US$3,400 per semester", 2026, "USD").ok).toBe(true);
    expect(checkTuition(340000, "Fee: 3,400 dollars per semester", 2026, "USD").ok).toBe(true);
    expect(checkTuition(250000, "Tuition fee EUR 2,500 / year", 2026, "EUR").ok).toBe(true);
    expect(checkTuition(150000, "Tuition: 1,500.00* Eurasian programme", 2026, "EUR").ok).toBe(
      false,
    );
    expect(checkTuition(100000, "Fee 1000 per year", 2026).ok).toBe(true);
    expect(checkTuition(30000, "Amateur 3000", 2026, "EUR").ok).toBe(false);
    expect(checkTuition(690000, "690.000,- Ft per semester", 2026, "HUF").ok).toBe(true);
    expect(checkTuition(300000, "Tuition 3.000,- EUR per semester", 2026, "EUR").ok).toBe(true);
    expect(checkTuition(300000, "Tuition 3000,-€", 2026, "EUR").ok).toBe(true);
  });

  it("knows which study year is the current one", () => {
    expect(currentStudyYear(new Date("2026-10-04"))).toBe(2026);
    expect(currentStudyYear(new Date("2026-08-01"))).toBe(2026);
    expect(currentStudyYear(new Date("2026-03-01"))).toBe(2025);
  });
  it("accepts a zero fee only with a statement that there are none", () => {
    expect(checkTuition(0, "There are no tuition fees for this programme", 2026).ok).toBe(true);
    expect(checkTuition(0, "Semester contribution 150 euros", 2026).ok).toBe(false);
  });
  it("accepts the register wording 'Tuition fees per semester None' as a zero fee", () => {
    expect(checkTuition(0, "Tuition fees per semester None", 2026).ok).toBe(true);
    expect(checkTuition(0, "Tuition fees: none", 2026).ok).toBe(true);
  });
  it("does not read 'none' elsewhere as a zero fee", () => {
    expect(checkTuition(0, "Semester contribution 150 euros. Scholarships: none", 2026).ok).toBe(
      false,
    );
    expect(
      checkTuition(0, "Tuition fees per semester None for EU students, 1,500 EUR for non-EU", 2026)
        .ok,
    ).toBe(false);
  });
});

describe("checkRecurringDeadline", () => {
  it.each([
    [7, 15, "Application deadline: 15 July"],
    [7, 15, "Bewerbungsfrist: 15. Juli"],
    [5, 1, "Meld je uiterlijk 1 mei aan"],
    [11, 30, "applications until 30.11."],
    [1, 15, "Frist 15/01"],
    [5, 1, "1 May - 30 Nov"],
    [11, 30, "1 May - 30 Nov"],
    [7, 15, "by the 15th of July"],
    [7, 15, "Deadline: July 15"],
    [7, 1, "1er juillet"],
  ])("accepts %i/%i in: %s", (month, day, quote) => {
    expect(checkRecurringDeadline(month, day, quote).ok).toBe(true);
  });
  it.each([
    [7, 16, "Application deadline: 15 July"],
    [8, 15, "Application deadline: 15 July"],
    [7, 15, "Applications open all year"],
    [7, 15, "Non-EU applicants: apply by 15 July 2025"],
    [7, 15, "Deadline for non-EU applicants: 15.07.2024"],
    [7, 15, "winter semester 2027/28: 15 July"],
    [7, 15, "applications open 1 July; 15 places available"],
    [7, 15, "15 ECTS, start in July"],
  ])("rejects %i/%i in: %s", (month, day, quote) => {
    expect(checkRecurringDeadline(month, day, quote).ok).toBe(false);
  });
});

describe("checkRecurringDeadline reasons", () => {
  it("says a quote with a year is a dated deadline", () => {
    expect(checkRecurringDeadline(7, 15, "apply by 15 July 2025")).toEqual({
      ok: false,
      reason: "the quote states a year: a dated deadline, not a recurring one",
    });
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
  it("rejects a date whose day is not beside its month", () => {
    expect(checkDeadline("2027-06-15", "Non-EU: 1 June to 15 July 2027").ok).toBe(false);
    expect(
      checkDeadline("2027-07-01", "Non-EU: classes start 1 September; apply until 20 July 2027").ok,
    ).toBe(false);
  });
  it("accepts the day beside the month in each written form", () => {
    expect(checkDeadline("2027-07-15", "Non-EU: apply by 15th of July 2027").ok).toBe(true);
    expect(checkDeadline("2027-07-15", "Non-EU deadline: July 15, 2027").ok).toBe(true);
    expect(checkDeadline("2027-07-15", "Non-EU deadline: 2027-07-15").ok).toBe(true);
    expect(checkDeadline("2027-01-01", "Non-EU: 1er janvier 2027").ok).toBe(true);
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
    expect(
      checkChannel(
        "hu-university-direct",
        "Fill in the online application form of the programme on the website of the chosen university",
      ).ok,
    ).toBe(true);
    expect(checkChannel("hu-university-direct", "Apply on the Study Finder").ok).toBe(false);
    for (const quote of [
      "You can apply only online by completing our online application form and uploading your documents.",
      "Register on the online application site of the University of Pécs",
      "submitted during the application procedure by all applicants through our online application platform",
      "John von Neumann University - Apply Online.",
    ])
      expect(checkChannel("hu-university-direct", quote).ok).toBe(true);
    for (const quote of [
      "Applications must be submitted through the Stipendium Hungaricum application system.",
      "Hungarian applicants apply through the Felvi application system.",
      "The programme is available in the Stipendium Hungaricum Scholarship Programme",
    ])
      expect(checkChannel("hu-university-direct", quote).ok).toBe(false);
    for (const quote of [
      "Apply for the Stipendium Hungaricum scholarship on the online platform",
      "Stipendium Hungaricum application call 2026/2027",
      "Applications are made through the Stipendium Hungaricum programme",
    ])
      expect(checkChannel("hu-stipendium-hungaricum", quote).ok).toBe(true);
    expect(
      checkChannel(
        "hu-stipendium-hungaricum",
        "The programme is available in the Stipendium Hungaricum Scholarship Programme",
      ).ok,
    ).toBe(false);
    for (const quote of [
      "The electronic question can be submitted to the following e-mail address: admission@metropolitan.hu",
      "Admission procedure in general and general requirements: refer to admission regulations at www.bme.hu.",
      "Study in Hungary link: https://en.uni-miskolc.hu/mechanical-engineering",
    ])
      expect(checkChannel("hu-university-direct", quote).ok).toBe(false);
    expect(
      checkChannel("hu-stipendium-hungaricum", "Apply for the Stipendium Hungaricum scholarship")
        .ok,
    ).toBe(true);
    expect(checkChannel("hu-stipendium-hungaricum", "Apply through the university").ok).toBe(false);
    for (const quote of [
      "Non-EU students residing abroad must submit the pre-enrolment application on the Universitaly portal",
      "Pre-enrolment on Universitaly is mandatory for non-EU applicants",
      "La domanda di preiscrizione va presentata sul portale UNIVERSITALY",
    ])
      expect(checkChannel("it-universitaly", quote).ok).toBe(true);
    expect(checkChannel("it-universitaly", "Apply through the university").ok).toBe(false);
    for (const quote of [
      "Apply online on the university's application portal",
      "Fill in the application form on the University of Bologna website",
      "Applications are submitted through the university's own application platform",
    ])
      expect(checkChannel("it-university-direct", quote).ok).toBe(true);
    for (const quote of [
      "Pre-enrolment on Universitaly is mandatory for non-EU applicants",
      "For information write to admissions@unibo.it",
      "Italian applicants apply through the national system",
      "EU students and non-EU students legally residing in Italy apply online through the university's application portal",
      "Italian and EU citizens apply via the online application system",
      "Italian nationals apply through the university's application portal",
      "Candidates already living in Italy use the online application system",
      "EEA applicants apply online on the application portal",
    ])
      expect(checkChannel("it-university-direct", quote).ok).toBe(false);
    expect(
      checkChannel(
        "it-university-direct",
        "Non-EU students residing abroad apply online on the university's application portal",
      ).ok,
    ).toBe(true);
    expect(checkChannel("unknown-channel", "anything at all here").ok).toBe(false);
  });
});

describe("mentionsInternationalApplicants", () => {
  it.each([
    "15 May for non-EU and non-EEA applicants",
    "Deadline for international applicants: 15 July",
    "With a qualification from abroad 01 May - 30 Nov",
    "Bewerbungsfrist für Bewerber mit ausländischer Hochschulzugangsberechtigung",
    "Frist für Drittstaatsangehörige: 15. Juli",
    "Für Nicht-EU-Bürger gilt der 1. Juni",
    "Studenten van buiten de EU: niet-EER studenten melden zich aan vóór 1 april",
    "Aanmelden voor internationale studenten uiterlijk 1 april",
    "candidats étrangers : date limite le 15 janvier",
    "Applicants from outside the EU must apply by 1 March",
    "étudiants internationaux : date limite le 15 janvier",
    "candidats étrangères : date limite le 15 janvier",
    "hors de l'Union européenne : date limite le 15 janvier",
    "étudiants extra-européens : date limite le 15 janvier",
    "Bewerbung außerhalb der EU bis 15. Juli",
    "Bewerbung ausserhalb der EU bis 15. Juli",
    "Bewerbung für Nicht-EWR Staatsangehörige bis 15. Juli",
    "Aanmelden buiten de EU/EER vóór 1 april",
    "diploma behaald buiten Nederland: aanmelden vóór 1 april",
    "Deadline for non-EER applicants: 1 April",
    "Deadline for third-country nationals: 1 April",
    "Deadline for non-European applicants: 1 April",
    "Applicants who studied abroad must apply by 1 March",
    "Bewerber aus dem Ausland: 15. Juli",
    "Applicants with a degree from abroad: 1 March",
    "Deadline for international students: 1 March",
    "Foreign applicants: 1 March",
    "Du 1er octobre 2026 au 15 novembre 2026 à 23h59 (heure marocaine)",
    "Candidats marocains : date limite le 15 novembre",
    "Moroccan applicants must apply by 1 March",
    "Bewerbung für marokkanische Staatsangehörige bis 15. Juli",
    "Marokkaanse studenten melden zich aan vóór 1 april",
    "Bewerbung aus Marokko bis 15. Juli",
    "Studenten uit Marokko melden zich aan vóór 1 april",
    "Diplôme du Maroc : date limite le 15 novembre",
    "The following is valid for applicants from: all countries For the winter semester: until 15 July",
  ])("is true for: %s", (quote) => {
    expect(mentionsInternationalApplicants(quote)).toBe(true);
  });

  it.each([
    "Application deadline 30 June 2027",
    "Bewerbungsfrist: 15. Juli",
    "Meld je uiterlijk 1 mei aan via Studielink",
    "Applications for the winter semester: 2 May to 15 July 2027",
    "International Economics and Sustainability (B.A.) no no September 15, 2026 Osnabrück",
    "International Business: apply by 1 May 2027",
    "Contact the International Office",
    "The following is valid for applicants from: EU countries For the winter semester: until 15 July",
    "All countries have a deadline: 15 July",
    "Bachelor International Management",
    "Foreign languages are taught",
    "Teaching abroad semester",
    "Auslandssemester im 5. Semester",
    "",
  ])("is false for: %s", (quote) => {
    expect(mentionsInternationalApplicants(quote)).toBe(false);
  });
});

describe("countDates", () => {
  it("counts each date a quote states", () => {
    expect(countDates("Apply by 15 March 2027")).toBe(1);
    expect(countDates("EU applicants: 15 March 2027; non-EU applicants: 15 January 2027")).toBe(2);
    expect(countDates("closes March 15 and 01.02.2027 and 2027-04-01")).toBe(3);
    expect(countDates("no date here")).toBe(0);
  });
});
