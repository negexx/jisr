import { describe, expect, it } from "vitest";

import { classifyDutchProgramme } from "../../../scripts/import/fields";
import {
  buildDutchProgramme,
  durationYears,
  isCurrentFullTimeBachelor,
  parseRio,
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
  it("prefills the duration from ECTS but leaves every fact blocked by the placeholder", () => {
    const data = record?.data as Record<string, { value: unknown; info_kind: string }>;
    expect(data.durationYears).toMatchObject({ value: 3, info_kind: READ_SOURCE });
    for (const key of [
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
      }),
    ).toBeNull();
  });
});

describe("parseRio", () => {
  it("fails loudly when the layout changes", () => {
    expect(() => parseRio('"A","B"\n"1","2"')).toThrow(/columns are missing/);
  });
});
