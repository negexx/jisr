import { describe, expect, it } from "vitest";

import { classifyDutchProgramme } from "../../../scripts/import/fields";
import {
  acceptsNewStudents,
  buildDutchProgramme,
  durationYears,
  isCurrentFullTimeBachelor,
  parseRio,
  townOf,
} from "../../../scripts/import/sources/rio";
import { READ_SOURCE } from "../../../scripts/import/staging";

const row = (over: Record<string, string> = {}): Record<string, string> => ({
  INSTELLINGSCODE: "21PF",
  INSTELLINGSNAAM: "Technische Universiteit Delft",
  VESTIGINGSCODE: "21PF00",
  VESTIGINGSNAAM: "Technische Universiteit Delft: Delft",
  PLAATSNAAM: "DELFT",
  OPLEIDINGSEENHEIDCODE: "56984",
  OPLEIDINGSEENHEID_NAAM: "Technische Informatica",
  OPLEIDINGSEENHEID_INTERNATIONALE_NAAM: "Computer Science and Engineering",
  STUDIELAST: "180",
  NIVEAU: "WO-BA",
  GRAAD: "BACHELOR",
  VORM: "VOLTIJD",
  ONDERDEEL: "TECHNIEK",
  BEKOSTIGINGSCODE: "BEKOSTIGD",
  ACCREDITATIE_VERVALDATUM: "2031-03-20",
  STATUS: "ACTUEEL",
  ...over,
});

describe("isCurrentFullTimeBachelor", () => {
  it("keeps current full-time HBO and WO Bachelors", () => {
    expect(isCurrentFullTimeBachelor(row())).toBe(true);
    expect(isCurrentFullTimeBachelor(row({ NIVEAU: "HBO-BA" }))).toBe(true);
  });
  it("drops historical, future, part-time, dual, Master and Associate Degree rows", () => {
    const dropped: Record<string, string>[] = [
      { STATUS: "HISTORISCH" },
      { STATUS: "TOEKOMSTIG" },
      { VORM: "DEELTIJD" },
      { VORM: "DUAAL" },
      { GRAAD: "MASTER", NIVEAU: "WO-MA" },
      { GRAAD: "ASSOCIATE_DEGREE", NIVEAU: "HBO-AD" },
    ];
    for (const over of dropped) {
      expect(isCurrentFullTimeBachelor(row(over))).toBe(false);
    }
  });
});

describe("durationYears", () => {
  it("derives years from ECTS at 60 per year and refuses odd values", () => {
    expect(durationYears("180")).toBe(3);
    expect(durationYears("240")).toBe(4);
    expect(durationYears("")).toBeNull();
    expect(durationYears("100")).toBeNull();
    expect(durationYears("abc")).toBeNull();
  });
});

describe("classifyDutchProgramme", () => {
  it("finds computer science across sectors, in Dutch and English", () => {
    expect(classifyDutchProgramme("TECHNIEK", "Informatica", "")).toEqual({
      field: "computer-science",
      confidence: "high",
    });
    expect(classifyDutchProgramme("NATUUR", "Informatica", "Computer Science")?.field).toBe(
      "computer-science",
    );
  });
  it("uses the sector for business and engineering and flags unclear names as low", () => {
    expect(classifyDutchProgramme("ECONOMIE", "Bedrijfskunde", "")).toEqual({
      field: "business-economics",
      confidence: "high",
    });
    expect(classifyDutchProgramme("ECONOMIE", "Toerisme", "")?.confidence).toBe("low");
    expect(classifyDutchProgramme("TECHNIEK", "Civiele Techniek", "")).toEqual({
      field: "engineering",
      confidence: "high",
    });
    expect(
      classifyDutchProgramme("TECHNIEK", "Fashion & Textile Technologies", "")?.confidence,
    ).toBe("low");
  });
  it("leaves programmes outside the three fields out", () => {
    expect(classifyDutchProgramme("RECHT", "Rechtsgeleerdheid", "Law")).toBeNull();
    expect(classifyDutchProgramme("TAAL_EN_CULTUUR", "Geschiedenis", "History")).toBeNull();
  });
});

describe("buildDutchProgramme", () => {
  const record = buildDutchProgramme({
    row: row(),
    instSlug: "nl-technische-universiteit-delft-21pf",
    instName: "Technische Universiteit Delft",
    city: "Delft",
    today: "2026-10-01",
  });

  it("stages a programme whose city matches its institution", () => {
    expect(record?.id).toBe("nl-technische-universiteit-delft-21pf-technische-informatica-56984");
    expect(record?.data).toMatchObject({
      institution: "nl-technische-universiteit-delft-21pf",
      country: "NL",
      city: "delft",
      field: "computer-science",
      level: "bachelor",
    });
  });
  it("leaves every fact blocked by the placeholder and only notes the ECTS-derived duration", () => {
    const data = record?.data as Record<string, { value: unknown; info_kind: string }>;
    expect(record?.review.todo).toMatch(/180 ECTS, i\.e\. about 3 years/);
    for (const key of [
      "durationYears",
      "teachingLanguages",
      "tuition",
      "intakes",
      "applicationChannel",
      "documents",
    ]) {
      expect(data[key]).toMatchObject({ value: null, info_kind: READ_SOURCE });
    }
  });
  it("leaves officialUrl empty so a human must supply the programme page", () => {
    expect(record?.data.officialUrl).toBeNull();
    expect(record?.review.todo).toMatch(/set officialUrl \(required\)/);
  });
  it("notes funding, accreditation and the international name for the reviewer", () => {
    const private_ = buildDutchProgramme({
      row: row({ BEKOSTIGINGSCODE: "NIET_BEKOSTIGD" }),
      instSlug: "x",
      instName: "X",
      city: "Delft",
      today: "2026-10-01",
    });
    expect(record?.review.todo).toMatch(/accredited until 2031-03-20/);
    expect(record?.review.todo).toMatch(/international name "Computer Science and Engineering"/);
    expect(private_?.review.todo).toMatch(/not publicly funded/);
  });
  it("skips programmes outside the three fields", () => {
    expect(
      buildDutchProgramme({
        row: row({
          ONDERDEEL: "RECHT",
          OPLEIDINGSEENHEID_NAAM: "Rechtsgeleerdheid",
          OPLEIDINGSEENHEID_INTERNATIONALE_NAAM: "Law",
        }),
        instSlug: "x",
        instName: "X",
        city: "Delft",
        today: "2026-10-01",
      }),
    ).toBeNull();
  });
});

describe("parseRio", () => {
  it("fails loudly when the layout changes", () => {
    expect(() => parseRio('"A","B"\n"1","2"')).toThrow(/columns are missing/);
  });
});

describe("programmes that no longer take students", () => {
  it("drops rows whose intake has ended and keeps open or future ends", () => {
    expect(acceptsNewStudents(row({ INSTROOM_EINDDATUM: "" }), "2026-10-01")).toBe(true);
    expect(acceptsNewStudents(row({ INSTROOM_EINDDATUM: "2027-09-01" }), "2026-10-01")).toBe(true);
    expect(acceptsNewStudents(row({ INSTROOM_EINDDATUM: "2026-09-01" }), "2026-10-01")).toBe(false);
    expect(acceptsNewStudents(row({ INSTROOM_EINDDATUM: "2026-10-01" }), "2026-10-01")).toBe(false);
  });
  it("flags an expired accreditation, a coming end of intake and designated funding", () => {
    const record = buildDutchProgramme({
      row: row({
        ACCREDITATIE_VERVALDATUM: "2025-09-27",
        INSTROOM_EINDDATUM: "2027-09-01",
        BEKOSTIGINGSCODE: "AANGEWEZEN",
      }),
      instSlug: "x",
      instName: "X",
      city: "Delft",
      today: "2026-10-01",
    });
    expect(record?.review.todo).toMatch(/accreditation expired on 2025-09-27/);
    expect(record?.review.todo).toMatch(/intake ends 2027-09-01/);
    expect(record?.review.todo).toMatch(/designated \(aangewezen\)/);
  });
});

describe("townOf", () => {
  it("drops province suffixes and city districts", () => {
    expect(townOf("EDE GLD", "EDE")).toBe("Ede");
    expect(townOf("VELP GLD", "ROSENDAAL")).toBe("Velp");
    expect(townOf("AMSTERDAM ZUIDOOST", "AMSTERDAM")).toBe("Amsterdam");
    expect(townOf("HENGELO OV", "HENGELO")).toBe("Hengelo");
  });
  it("leaves ordinary multi-word towns alone", () => {
    expect(townOf("DEN HAAG", "'S-GRAVENHAGE")).toBe("Den Haag");
    expect(townOf("BERGEN OP ZOOM", "BERGEN OP ZOOM")).toBe("Bergen op Zoom");
  });
});

describe("Dutch classifier exclusions", () => {
  it("returns nothing for teacher training, even with a field word in the name", () => {
    expect(
      classifyDutchProgramme("ONDERWIJS", "Opleiding tot leraar voortgezet onderwijs Economie", ""),
    ).toBeNull();
    expect(classifyDutchProgramme("TECHNIEK", "Leraar Informatica", "")).toBeNull();
  });
  it("makes a computer-science name outside the technical sectors a judgement call", () => {
    expect(
      classifyDutchProgramme(
        "TAAL_EN_CULTUUR",
        "Communicatie- en Informatiewetenschappen",
        "Communication and Information Sciences",
      ),
    ).toEqual({
      field: "computer-science",
      confidence: "low",
    });
    expect(
      classifyDutchProgramme("SECTOROVERSTIJGEND", "Cybersecurity & Cybercrime", "")?.confidence,
    ).toBe("low");
  });
});
