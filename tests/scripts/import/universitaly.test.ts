import { describe, expect, it } from "vitest";

import {
  classCodesOf,
  classify,
  courseName,
  PortalPageSchema,
  toCandidate,
} from "../../../scripts/import/sources/universitaly";

import { course, page } from "./universitaly-helpers";

describe("PortalPageSchema", () => {
  it("accepts the response shape and ignores the other top-level keys", () => {
    const parsed = PortalPageSchema.parse(page([course()], 241, 25, "2"));
    expect(parsed.universita.totalPages).toBe(25);
    expect(parsed.universita.corsi).toHaveLength(1);
  });
  it("rejects a response whose shape changed", () => {
    expect(PortalPageSchema.safeParse({ universita: { corsi: [] } }).success).toBe(false);
    expect(PortalPageSchema.safeParse(page([{ ...course(), id: "x" } as never])).success).toBe(
      false,
    );
  });
});

describe("classCodesOf and courseName", () => {
  it("trims the padded class code and adds the interclass", () => {
    expect(
      classCodesOf(
        course({ classe: { codice: "L-34  " }, classeInterclasse: { codice: "L-36  " } }),
      ),
    ).toEqual(["L-34", "L-36"]);
    expect(classCodesOf(course({ classe: null, classeInterclasse: null }))).toEqual([]);
  });
  it("prefers the English name and collapses spaces", () => {
    expect(
      courseName(course({ nomeCorsoEn: "  Data   Science ", nomeCorso: "Scienza dei dati" })),
    ).toBe("Data Science");
    expect(courseName(course({ nomeCorsoEn: null, nomeCorso: "Informatica" }))).toBe("Informatica");
  });
});

describe("classify", () => {
  it("makes an English, in-person Triennale course of an in-scope class a candidate with its field", () => {
    const c = classify(course({ classe: { codice: "L-31  " } }));
    expect(c).toMatchObject({
      status: "candidate",
      classCode: "L-31",
      field: "computer-science",
      confidence: "high",
    });
    expect(classify(course({ classe: { codice: "L-8" } }))).toMatchObject({ field: "engineering" });
    expect(
      classify(
        course({
          classe: { codice: "L-33" },
          nomeCorso: "Economics and Management",
          nomeCorsoEn: "Economics and Management",
        }),
      ),
    ).toMatchObject({
      field: "business-economics",
      confidence: "high",
    });
  });
  it("marks L-41 as a low-confidence candidate", () => {
    expect(classify(course({ classe: { codice: "L-41" } }))).toMatchObject({
      status: "candidate",
      confidence: "low",
    });
  });
  it("uses the interclass when the main class is out of scope", () => {
    const c = classify(
      course({ classe: { codice: "L-36" }, classeInterclasse: { codice: "L-18" } }),
    );
    expect(c).toMatchObject({ status: "candidate", classCode: "L-18" });
    expect(c.classCodes).toEqual(["L-36", "L-18"]);
  });
  it("excludes by reason, in this order", () => {
    expect(classify(course({ tipoLaurea: { descrizione: "Magistrale" } })).status).toBe(
      "not-bachelor",
    );
    expect(classify(course({ lingua: "IT" })).status).toBe("not-english");
    expect(classify(course({ classe: { codice: "L-34" } })).status).toBe("class-out-of-scope");
    expect(classify(course({ lingua: "mu" })).status).toBe("mixed-language");
    expect(classify(course({ lingua: "mu", classe: { codice: "L-34" } })).status).toBe(
      "class-out-of-scope",
    );
    expect(classify(course({ modalitaDidattica: { descrizione: "Teledidattica" } })).status).toBe(
      "not-in-person",
    );
    expect(classify(course({ modalitaErogazione: { codice: "B" } })).status).toBe("not-in-person");
  });
});

describe("toCandidate", () => {
  it("carries what the portal states and the year", () => {
    const cand = toCandidate(classify(course({ id: 7, durataAnni: 3 })));
    expect(cand).toEqual({
      portalId: 7,
      university: "Università degli Studi di BARI ALDO MORO",
      name: "Computer Science",
      classCode: "L-31",
      classCodes: ["L-31"],
      field: "computer-science",
      confidence: "high",
      durationYears: 3,
      url: "https://www.uniba.test/it/corsi/computer-science",
      academicYear: "2026/2027",
    });
  });
  it("refuses a course that is not a candidate", () => {
    expect(() => toCandidate(classify(course({ lingua: "IT" })))).toThrow(/not a candidate/);
  });
});
