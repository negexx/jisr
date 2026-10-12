import { describe, expect, it } from "vitest";
import { BA_GROUPS } from "../../../scripts/import/sources/ba";
import {
  buildDaadRecords,
  classifyDaad,
  cleanDeadline,
  countBaProgrammes,
  type DaadCourse,
  fetchDaadBachelors,
  germanTown,
  isTaughtAbroad,
  languageCodes,
  matchHrkEnglish,
  plainText,
  yearsFromSemesters,
} from "../../../scripts/import/sources/daad";
import { READ_SOURCE } from "../../../scripts/import/staging";
import { canonicalTown, sameTown } from "../../../scripts/import/text";

const inst = (slug: string, name: string, city: string, alias = "") => ({
  slug,
  name,
  city,
  alias,
});

describe("matchHrkEnglish", () => {
  const list = [
    inst("fh-muenster", "FH Münster - University of Applied Sciences", "Münster", "FH Münster"),
    inst(
      "pth-muenster",
      "Philosophisch-Theologische Hochschule Münster - Kirchlich anerkannte Hochschule",
      "Münster",
      "Philosophisch-Theologische Hochschule Münster",
    ),
    inst("uni-muenster", "Universität Münster", "Münster", "Universität Münster"),
    inst("tum", "Technische Universität München", "München", "TU München"),
    inst("lmu", "Ludwig-Maximilians-Universität München", "München", "LMU München"),
    inst("hs-hannover", "Hochschule Hannover", "Hannover", "Hochschule Hannover"),
    inst(
      "evh-hannover",
      "Evangelische Hochschule Hannover",
      "Hannover",
      "Evangelische Hochschule Hannover",
    ),
    inst(
      "hs-aalen",
      "Hochschule Aalen - Technik, Wirtschaft und Gesundheit",
      "Aalen",
      "Hochschule Aalen",
    ),
    inst("rheinwaal", "Hochschule Rhein-Waal", "Kleve", "Hochschule Rhein-Waal"),
  ];
  it("never links FH Münster to the theological Hochschule of the same town", () => {
    expect(
      matchHrkEnglish("FH Münster University of Applied Sciences", "Münster", list)?.slug,
    ).toBe("fh-muenster");
  });
  it("translates English place names: Technical University of Munich", () => {
    expect(matchHrkEnglish("Technical University of Munich", "Munich", list)?.slug).toBe("tum");
    expect(
      matchHrkEnglish("Technical University of Munich", "Garching b. München", list)?.slug,
    ).toBe("tum");
  });
  it("uses the HRK short name written out in the DAAD name", () => {
    expect(
      matchHrkEnglish(
        "Hochschule Hannover - University of Applied Sciences and Arts",
        "Hannover",
        list,
      )?.slug,
    ).toBe("hs-hannover");
  });
  it("treats an English 'University' as a Hochschule when nothing else fits", () => {
    expect(matchHrkEnglish("Aalen University", "Aalen", list)?.slug).toBe("hs-aalen");
    expect(matchHrkEnglish("Rhine-Waal University of Applied Sciences", "Kleve", list)?.slug).toBe(
      "rheinwaal",
    );
  });
  it("returns nothing when several institutions fit or none does", () => {
    const twins = [
      inst("a", "Hochschule Beispielstadt", "Beispielstadt", "Hochschule Beispielstadt"),
      inst("b", "Fachhochschule Beispielstadt", "Beispielstadt", "Fachhochschule Beispielstadt"),
    ];
    expect(matchHrkEnglish("University of Applied Sciences", "Beispielstadt", twins)).toBeNull();
    expect(matchHrkEnglish("Nonexistent University", "Hamburg", list)).toBeNull();
  });
});

describe("programmes taught abroad", () => {
  it("recognises foreign locations and keeps German ones", () => {
    expect(isTaughtAbroad("Singapore")).toBe(true);
    expect(isTaughtAbroad("Ho Chi Minh, Vietnam")).toBe(true);
    expect(isTaughtAbroad("Kempten (Allgäu)")).toBe(false);
    expect(isTaughtAbroad("Berlin")).toBe(false);
    expect(isTaughtAbroad("Berlin, Germany")).toBe(false);
    expect(isTaughtAbroad("Berlin, Deutschland")).toBe(false);
    expect(isTaughtAbroad("Dubai")).toBe(true);
    expect(isTaughtAbroad("Ho Chi Minh City")).toBe(true);
    expect(isTaughtAbroad(null)).toBe(false);
  });
});

describe("DAAD fact parsing", () => {
  it("reads unambiguous semester counts only", () => {
    expect(yearsFromSemesters("6 semesters")).toBe(3);
    expect(yearsFromSemesters("7 semesters")).toBe(3.5);
    expect(yearsFromSemesters("6 semesters, 7 semesters")).toBeNull();
    expect(yearsFromSemesters("9 semesters or more")).toBeNull();
    expect(yearsFromSemesters(null)).toBeNull();
  });
  it("turns only a plain 'Register by' date into ISO, leaving prose to a human", () => {
    expect(cleanDeadline("Register by 15 July 2027")).toBe("2027-07-15");
    expect(cleanDeadline("Register by 5 January 2027")).toBe("2027-01-05");
    expect(cleanDeadline("This programme has no deadline.")).toBeNull();
    expect(cleanDeadline("<p>15 April to 15 July</p>")).toBeNull();
  });
  it("maps language names to codes and refuses unknown ones", () => {
    expect(languageCodes(["English", "German"])).toEqual(["en", "de"]);
    expect(languageCodes(["English", "Klingon"])).toBeNull();
    expect(languageCodes([])).toBeNull();
  });
  it("strips markup and entities from DAAD's HTML text", () => {
    expect(plainText("<p><strong>Non EU:</strong></p><p>15 April &ndash; 15 July</p>")).toBe(
      "Non EU: 15 April - 15 July",
    );
    expect(plainText("x".repeat(500), 20)).toHaveLength(23);
  });
});

describe("classifyDaad", () => {
  it("finds the three fields by programme name and flags subject-only hits as low", () => {
    expect(classifyDaad("Applied Computer Science (B.Sc.)", "Computer Science")).toEqual({
      field: "computer-science",
      confidence: "high",
    });
    expect(classifyDaad("Electrical Engineering", "Electrical Engineering")?.field).toBe(
      "engineering",
    );
    expect(classifyDaad("International Business Administration", null)?.field).toBe(
      "business-economics",
    );
    expect(classifyDaad("Advertising & Brand Design (BA)", "Graphic Design")).toBeNull();
    expect(classifyDaad("Engineering and Management", null)?.confidence).toBe("low");
    expect(classifyDaad("Mobility and Logistics", "Traffic Engineering")).toEqual({
      field: "business-economics",
      confidence: "low",
    });
    expect(classifyDaad("Intercultural Studies", "Intercultural Studies")).toBeNull();
  });
});

describe("buildDaadRecords", () => {
  const course = (over: Partial<DaadCourse> = {}): DaadCourse => ({
    id: 6217,
    courseName: "Applied Computer Science (B.Sc.)",
    academy: "Technical University of Munich",
    city: "Munich",
    languages: ["English"],
    beginning: "Winter semester",
    programmeDuration: "6 semesters",
    tuitionFees: "Tuition varies",
    costString: null,
    applicationDeadline: "Register by 15 July 2027",
    subject: "Computer Science",
    link: "/deutschland/studienangebote/international-programmes/en/detail/6217/",
    ...over,
  });
  const hrk = [
    {
      hsNr: "184",
      name: "Technische Universität München",
      kind: "Universitäten",
      sponsor: "öffentlich-rechtlich",
      state: "Bayern",
      city: "München",
      homepage: "https://www.tum.de/",
      alias: "TU München",
    },
  ];

  it("prefills language, duration and a clean deadline under the placeholder, citing the DAAD page as the source", () => {
    const records = buildDaadRecords({ courses: [course()], hrk, probed: new Map() });
    const prog = records.find((r) => r.collection === "programs");
    const data = prog?.data as Record<
      string,
      { value: unknown; info_kind: string; source?: string }
    >;
    expect(prog?.data.officialUrl).toBeNull();
    expect((prog?.data.sources as Record<string, { url: string }>).daad?.url).toBe(
      "https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/6217/",
    );
    expect(data.teachingLanguages).toMatchObject({ value: ["en"], info_kind: READ_SOURCE });
    expect(data.durationYears).toMatchObject({ value: 3, info_kind: READ_SOURCE });
    expect(data.intakes?.value).toEqual([
      { startDate: null, applicationOpens: null, applicationDeadline: "2027-07-15" },
    ]);
    expect(data.tuition).toMatchObject({ value: null, info_kind: READ_SOURCE });
    expect(prog?.sourceId).toBe("daad:6217");
    expect(prog?.data.institution).toBe("de-technische-universitat-munchen-hrk184");
  });
  it("attaches to the HRK institution without creating a duplicate institution", () => {
    const records = buildDaadRecords({ courses: [course()], hrk, probed: new Map() });
    expect(records.filter((r) => r.collection === "institutions")).toHaveLength(0);
  });
  it("gives a campus in another town its own institution unit so the programme's city matches", () => {
    const records = buildDaadRecords({
      courses: [course({ id: 9, city: "Straubing", courseName: "Computer Science" })],
      hrk,
      probed: new Map(),
    });
    const unit = records.find((r) => r.collection === "institutions");
    const prog = records.find((r) => r.collection === "programs");
    expect(unit?.id).toBe("de-technische-universitat-munchen-hrk184-straubing");
    expect(unit?.sourceId).toBe("hrk:184@straubing");
    expect((unit?.data.city as { slug: string }).slug).toBe("straubing");
    expect(prog?.data.institution).toBe(unit?.id);
    expect(prog?.data.city).toBe("straubing");
  });
  it("stages an unmatched academy as a candidate institution, never as official", () => {
    const records = buildDaadRecords({
      courses: [course({ academy: "Unknown Academy of Arts", city: "Trier" })],
      hrk,
      probed: new Map(),
    });
    const institution = records.find((r) => r.collection === "institutions");
    expect(institution?.data.info_kind).toBe(READ_SOURCE);
    expect(institution?.data.type).toBeNull();
    expect(records.find((r) => r.collection === "programs")?.review.todo).toMatch(
      /not matched to the HRK list/,
    );
  });
  it("skips programmes taught abroad and outside the three fields", () => {
    const records = buildDaadRecords({
      courses: [
        course({ id: 1, city: "Singapore" }),
        course({ id: 2, courseName: "Graphic Design", subject: "Graphic Design" }),
      ],
      hrk,
      probed: new Map(),
    });
    expect(records.filter((r) => r.collection === "programs")).toHaveLength(0);
  });
  it("flags a possible duplicate of a Studiensuche programme and a German-taught programme", () => {
    const records = buildDaadRecords({
      courses: [course({ languages: ["German", "English"] })],
      hrk,
      probed: new Map(),
      baCounts: new Map([["de-technische-universitat-munchen-hrk184|computer-science", 3]]),
    });
    const todo = records.find((r) => r.collection === "programs")?.review.todo ?? "";
    expect(todo).toMatch(/3 programme\(s\) in this field/);
    expect(todo).toMatch(/taught in German/);
  });
});

describe("classifyDaad: wrong-field cases found in review", () => {
  it("keeps Electrical Engineering and Information Technology in engineering", () => {
    expect(
      classifyDaad("Electrical Engineering and Information Technology", "Electrical Engineering"),
    ).toEqual({
      field: "engineering",
      confidence: "high",
    });
    expect(classifyDaad("Electronics Engineering for Artificial Intelligence", null)?.field).toBe(
      "engineering",
    );
  });
  it("does not read a subject tag, and skips linguistics and unmapped health names", () => {
    expect(classifyDaad("Computational Linguistics", "Computer Science")).toBeNull();
    expect(classifyDaad("BSc in Applied Mathematics", "Engineering and Management")).toBeNull();
    expect(classifyDaad("Life Science and International Health", "Engineering")).toBeNull();
  });
  it("makes a vague 'management' name a judgement call and a plain IT name computer science", () => {
    expect(classifyDaad("International Forest Ecosystem Management", "Forestry")).toEqual({
      field: "business-economics",
      confidence: "low",
    });
    expect(classifyDaad("IT Security", null)).toEqual({
      field: "computer-science",
      confidence: "high",
    });
    expect(classifyDaad("Business Informatics", null)?.field).toBe("computer-science");
  });
});

describe("matchHrkEnglish: false matches found in review", () => {
  const list = [
    { slug: "uni-bremen", name: "Universität Bremen", city: "Bremen", alias: "Universität Bremen" },
    {
      slug: "escp",
      name: "ESCP Europe Wirtschaftshochschule Berlin",
      city: "Berlin",
      alias: "ESCP Europe Wirtschaftshochschule Berlin",
    },
  ];
  it("does not turn an art school into the university of the same town", () => {
    expect(matchHrkEnglish("University of the Arts Bremen", "Bremen", list)).toBeNull();
  });
  it("needs more than one shared word", () => {
    expect(matchHrkEnglish("University of Applied Sciences Europe", "Berlin", list)).toBeNull();
  });
  it("still matches the university itself", () => {
    expect(matchHrkEnglish("University of Bremen", "Bremen", list)?.slug).toBe("uni-bremen");
  });
});

describe("town spellings", () => {
  it("folds '/ Saale' and 'b.' variants into one canonical town", () => {
    expect(canonicalTown("Merseburg / Saale")).toBe("Merseburg");
    expect(canonicalTown("Garching b. München")).toBe("Garching bei München");
    expect(sameTown("Merseburg", "Merseburg / Saale")).toBe(true);
    expect(sameTown("Garching b. München", "Garching bei München")).toBe(true);
    expect(sameTown("Bernburg / Saale", "Bernburg")).toBe(true);
  });
  it("writes translated place names with a capital letter", () => {
    expect(germanTown("Munich")).toBe("München");
    expect(germanTown("Cologne")).toBe("Köln");
    expect(germanTown("Kempten (Allgäu)")).toBe("Kempten (Allgäu)");
  });
});

describe("DAAD records: review fixes", () => {
  const course = (over: Partial<DaadCourse> = {}): DaadCourse => ({
    id: 1,
    courseName: "Computer Science",
    academy: "Technical University of Munich",
    city: "Garching b. München",
    languages: ["English"],
    beginning: null,
    programmeDuration: "6 semesters",
    tuitionFees: null,
    costString: null,
    applicationDeadline: "Register by 15 July 2027",
    subject: null,
    link: "/deutschland/studienangebote/international-programmes/en/detail/1/",
    ...over,
  });
  const hrk = [
    {
      hsNr: "184",
      name: "Technische Universität München",
      kind: "Universitäten",
      sponsor: "öffentlich-rechtlich",
      state: "Bayern",
      city: "München",
      homepage: "https://www.tum.de/",
      alias: "TU München",
    },
  ];

  it("leaves officialUrl empty so a human supplies the institution's page, and keeps the DAAD link for review", () => {
    const prog = buildDaadRecords({ courses: [course()], hrk, probed: new Map() }).find(
      (r) => r.collection === "programs",
    );
    expect(prog?.data.officialUrl).toBeNull();
    expect(prog?.review.officialUrl).toBe(
      "https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/1/",
    );
    expect(prog?.review.todo).toMatch(/officialUrl is left empty/);
    expect(prog?.review.todo).toMatch(/EU\/German applicants/);
    expect((prog?.data.sources as Record<string, { url: string }>).daad?.url).toMatch(/daad\.de/);
  });
  it("gives both spellings of a campus town the same unit", () => {
    const a = buildDaadRecords({
      courses: [course({ city: "Garching b. München" })],
      hrk,
      probed: new Map(),
    });
    const b = buildDaadRecords({
      courses: [course({ city: "Garching bei München" })],
      hrk,
      probed: new Map(),
    });
    expect(a.find((r) => r.collection === "institutions")?.id).toBe(
      b.find((r) => r.collection === "institutions")?.id,
    );
  });
  it("counts duplicate hints against the main HRK institution, also for a campus unit", () => {
    const records = buildDaadRecords({
      courses: [course()],
      hrk,
      probed: new Map(),
      baCounts: new Map([["de-technische-universitat-munchen-hrk184|computer-science", 2]]),
    });
    expect(records.find((r) => r.collection === "programs")?.review.todo).toMatch(
      /2 programme\(s\) in this field/,
    );
  });
});

describe("countBaProgrammes", () => {
  it("counts classified Studiensuche programmes per matched HRK institution and field", () => {
    const group = BA_GROUPS.find((g) => g.field === "computer-science");
    if (group === undefined) throw new Error("no group");
    const programme = (id: string, name: string) => ({
      id,
      name,
      providerId: 1,
      provider: "Technische Universität München",
      city: "München",
      state: "Bayern",
      hochschulart: "Universität",
      subjects: [],
      models: [],
      group,
    });
    const counts = countBaProgrammes(
      [programme("1", "Informatik"), programme("2", "Informatik Bachelor")],
      hrk(),
    );
    expect(counts.get("de-technische-universitat-munchen-hrk184|computer-science")).toBe(2);
    function hrk() {
      return [
        {
          hsNr: "184",
          name: "Technische Universität München",
          kind: "Universitäten",
          sponsor: "öffentlich-rechtlich",
          state: "Bayern",
          city: "München",
          homepage: "",
          alias: "TU München",
        },
      ];
    }
  });
});

describe("fetchDaadBachelors completeness checks", () => {
  const c = (id: number): DaadCourse => ({
    id,
    courseName: "x",
    academy: "y",
    city: "z",
    languages: [],
    beginning: null,
    programmeDuration: null,
    tuitionFees: null,
    costString: null,
    applicationDeadline: null,
    subject: null,
    link: "/a",
  });
  const many = (n: number, from = 0) => Array.from({ length: n }, (_, i) => c(from + i));
  // Serves the given pages in order and repeats the last one.
  const serve = (pages: { courses: DaadCourse[]; numResults: number }[]) => {
    let call = 0;
    return async () => {
      const page = pages[Math.min(call++, pages.length - 1)];
      if (page === undefined) throw new Error("no page");
      return page;
    };
  };

  it("rejects an empty or implausibly small response", async () => {
    await expect(
      fetchDaadBachelors(async () => ({ courses: [], numResults: 0 }), 0),
    ).rejects.toThrow(/incomplete/);
  });
  it("rejects pages that overlap", async () => {
    const pages = [
      { courses: many(100), numResults: 300 },
      { courses: many(100, 50), numResults: 300 },
      { courses: many(100, 150), numResults: 300 },
    ];
    await expect(fetchDaadBachelors(serve(pages), 0)).rejects.toThrow(/overlap/);
  });
  it("rejects a response that delivers fewer programmes than announced", async () => {
    const pages = [
      { courses: many(100), numResults: 300 },
      { courses: many(100, 100), numResults: 300 },
      { courses: many(50, 200), numResults: 300 },
    ];
    await expect(fetchDaadBachelors(serve(pages), 0)).rejects.toThrow(/collected 250 of 300/);
  });
  it("accepts a complete, non-overlapping crawl", async () => {
    const pages = [
      { courses: many(100), numResults: 250 },
      { courses: many(100, 100), numResults: 250 },
      { courses: many(50, 200), numResults: 250 },
    ];
    const all = await fetchDaadBachelors(serve(pages), 0);
    expect(all).toHaveLength(250);
  });
});

describe("classifyDaad health names", () => {
  it("maps medicine and pharmacy", () => {
    expect(classifyDaad("Molecular Medicine", null)?.field).toBe("medicine");
    expect(classifyDaad("Pharmaceutical Biotechnology", null)?.field).toBe("pharmacy");
  });
  it("maps nursing/health sciences to allied-health", () => {
    expect(classifyDaad("Nursing", null)?.field).toBe("allied-health");
    expect(classifyDaad("Health Sciences", null)?.field).toBe("allied-health");
  });
  it("does not read engineering or economics as medicine", () => {
    expect(classifyDaad("Medical Engineering", null)?.field).toBe("engineering");
    expect(classifyDaad("Health Economics", null)?.field).toBe("business-economics");
  });
});
