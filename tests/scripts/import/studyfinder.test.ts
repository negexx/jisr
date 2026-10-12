import { describe, expect, it } from "vitest";

import {
  buildHungaryRecords,
  fieldOfBranch,
  languageCodesOf,
  parseSfDetail,
  parseSfList,
  parseSfTotal,
  type SfDetail,
  semestersToYears,
} from "../../../scripts/import/sources/studyfinder";

const LIST = `<b>3 results:</b><div class="list_element">
					<a class="list_title" href="https://tempus.tpf.hu/studyfinder/index/show/116">Business Informatics</a><br>
					University of Debrecen<br>
					Bachelor<br>
					Language: English, Location: Debrecen<br>
					Faculty: Faculty of Informatics, Duration: 7 semesters semesters
				</div><div class="list_element">
					<a class="list_title" href="https://tempus.tpf.hu/studyfinder/index/show/347">Business Informatics</a><br>
					Dennis Gabor University<br>
					Bachelor<br>
					Language: English, Location: Budapest<br>
					Faculty: , Duration: 7 semesters semesters
				</div><div class="list_element">
					<a class="list_title" href="https://tempus.tpf.hu/studyfinder/index/show/1063">Mechanical Engineering &amp; Design</a><br>
					Széchenyi István University<br>
					Bachelor<br>
					Language: English, Location: Győr<br>
					Faculty: Faculty of Mechanical Engineering, Duration: 7 semesters semesters
				</div>`;

const detailHtml = (over: Partial<Record<string, string>> = {}, extra = "") => `
<label>Institution</label>
<table>
	<tr><td width="25%">Insitution:</td><td><b>${over.institution ?? "University of Debrecen"}</b></td></tr>
	<tr><td>Faculty:</td><td>${over.faculty ?? "Faculty of Informatics"}</td></tr>
</table>
<label>Course / Programme information</label>
<table>
	<tr><td width="50%">Course / programme name:</td><td>${over.name ?? "Business Informatics"}</td></tr>
	<tr><td>Branch of Science:</td><td>${over.branch ?? "Computer Science and Information Technology"}</td></tr>
	<tr><td>Level of studies:</td><td>${over.level ?? "Bachelor"}</td></tr>
	<tr><td>Qualification:</td><td>Business Informatics Engineer</td></tr>
	<tr><td>Language of instruction:</td><td>${over.language ?? "English"}</td></tr>
	<tr><td>Duration of the course / programme:</td><td>${over.duration ?? "7 semesters semesters"}</td></tr>
	<tr><td>Location/city of the course:</td><td>${over.location ?? "Debrecen"}</td></tr>
	<tr><td>Study in Hungary link:</td><td><a href="http://studyinhungary.hu/institution/university-of-debrecen-60.html" target="_blank">http://studyinhungary.hu/institution/university-of-debrecen-60.html</a></td></tr>
	<tr style="border-top:1px solid #dedede;"><td>State Scholarships</td><td>Available</td></tr>
</table>
<label>Contact person information</label>
<table>
	<tr><td>Contact e-mail:</td><td>info@edu.unideb.hu</td></tr>
	<tr><td>Contact website:</td><td><a target="_blank" href="${over.contact ?? "https://www.edu.unideb.hu/p/business-informatics-bsc"}">${over.contact ?? "https://www.edu.unideb.hu/p/business-informatics-bsc"}</a></td></tr>
</table>
${extra}`;

const SH = `<label>The programme is available in the Stipendium Hungaricum Scholarship Programme</label>`;
const DFP = `<label>The programme is available in the Diaspora Scholarship Programme</label>`;

describe("parseSfList", () => {
  it("reads id, name (entities decoded), institution, language, location and duration", () => {
    const list = parseSfList(LIST);
    expect(list).toHaveLength(3);
    expect(list[0]).toEqual({
      id: 116,
      name: "Business Informatics",
      institution: "University of Debrecen",
      language: "English",
      location: "Debrecen",
      duration: "7 semesters",
    });
    expect(list[2]?.name).toBe("Mechanical Engineering & Design");
    expect(list[2]?.location).toBe("Győr");
  });

  it("returns nothing for a page without results", () => {
    expect(parseSfList("<b>0 results:</b>")).toEqual([]);
  });
});

describe("parseSfDetail", () => {
  it("reads the programme rows, the contact website and the scholarship flags", () => {
    const d = parseSfDetail(detailHtml({}, `${SH}${DFP}`), 116);
    expect(d).toMatchObject({
      id: 116,
      name: "Business Informatics",
      institution: "University of Debrecen",
      faculty: "Faculty of Informatics",
      branch: "Computer Science and Information Technology",
      level: "Bachelor",
      language: "English",
      duration: "7 semesters",
      location: "Debrecen",
      contactWebsite: "https://www.edu.unideb.hu/p/business-informatics-bsc",
      studyInHungaryLink: "http://studyinhungary.hu/institution/university-of-debrecen-60.html",
      shAvailable: true,
      diasporaAvailable: true,
      stateAvailable: true,
    });
  });

  it("marks a programme without the scholarship blocks as not available", () => {
    const d = parseSfDetail(detailHtml(), 7);
    expect(d.shAvailable).toBe(false);
    expect(d.diasporaAvailable).toBe(false);
  });

  it("keeps an http-only contact website apart so the reviewer is told, never as evidence", () => {
    const d = parseSfDetail(detailHtml({ contact: "http://old.example/x" }), 1);
    expect(d.contactWebsite).toBeNull();
    expect(d.contactWebsiteInsecure).toBe("http://old.example/x");
    expect(parseSfDetail(detailHtml(), 1).contactWebsiteInsecure).toBeNull();
  });

  it("leaves a missing or non-https contact website null", () => {
    expect(
      parseSfDetail(detailHtml({ contact: "http://old.example/x" }), 1).contactWebsite,
    ).toBeNull();
    expect(parseSfDetail("<table></table>", 1).contactWebsite).toBeNull();
  });
});

describe("fieldOfBranch, semestersToYears, languageCodesOf", () => {
  it("maps a branch of science to its field and leaves an unknown one null", () => {
    expect(fieldOfBranch("Computer Science and Information Technology")).toBe("computer-science");
    expect(fieldOfBranch("Engineering Science")).toBe("engineering");
    expect(fieldOfBranch("Economic Science")).toBe("business-economics");
    expect(fieldOfBranch("Social Science")).toBeNull();
    expect(fieldOfBranch(null)).toBeNull();
  });

  it("reads the Study Finder's own misspelling of semesters, and refuses an implausible length", () => {
    expect(semestersToYears("8 semsters")).toBe(4);
    expect(semestersToYears("7 semsters semesters")).toBe(3.5);
    expect(semestersToYears("1 semster")).toBeNull();
    expect(semestersToYears("20 semesters")).toBeNull();
    expect(parseSfDetail(detailHtml({ duration: "8 semsters semesters" }), 1).duration).toBe(
      "8 semesters",
    );
  });

  it("turns semesters into years and refuses anything else", () => {
    expect(semestersToYears("7 semesters")).toBe(3.5);
    expect(semestersToYears("6 semesters semesters")).toBe(3);
    expect(semestersToYears("3 years")).toBeNull();
    expect(semestersToYears(null)).toBeNull();
  });

  it("lists the language codes it knows and gives null for an unknown language", () => {
    expect(languageCodesOf("English")).toEqual(["en"]);
    expect(languageCodesOf("English and Hungarian")).toEqual(["en", "hu"]);
    expect(languageCodesOf("Hungarian/English")).toEqual(["hu", "en"]);
    expect(languageCodesOf("Klingon")).toBeNull();
    expect(languageCodesOf(null)).toBeNull();
  });
});

const detail = (id: number, over: Partial<SfDetail> = {}): SfDetail => ({
  id,
  name: "Business Informatics",
  institution: "University of Debrecen",
  faculty: "Faculty of Informatics",
  branch: "Computer Science and Information Technology",
  level: "Bachelor",
  qualification: "Business Informatics Engineer",
  language: "English",
  duration: "7 semesters",
  location: "Debrecen",
  contactWebsite: "https://www.edu.unideb.hu/p/business-informatics-bsc",
  contactWebsiteInsecure: null,
  studyInHungaryLink: null,
  shAvailable: true,
  diasporaAvailable: false,
  stateAvailable: true,
  ...over,
});

describe("buildHungaryRecords", () => {
  const records = buildHungaryRecords([
    detail(116),
    detail(117, { name: "Mechanical Engineering", branch: "Engineering Science" }),
    detail(118, { location: "Nyíregyháza" }),
    detail(119, { level: "Master" }),
    detail(120, { branch: "Social Science" }),
    detail(121, { name: "Applied Marketing Engineering", branch: "Economic Science" }),
  ]);
  const programmes = records.filter((r) => r.collection === "programs");
  const institutions = records.filter((r) => r.collection === "institutions");

  it("stages Bachelor programmes of the three branches only, slugs ending in the Study Finder id", () => {
    expect(programmes.map((p) => p.id)).toEqual([
      "hu-university-of-debrecen-debrecen-business-informatics-sf116",
      "hu-university-of-debrecen-debrecen-mechanical-engineering-sf117",
      "hu-university-of-debrecen-nyiregyhaza-business-informatics-sf118",
      "hu-university-of-debrecen-debrecen-applied-marketing-engine-sf121",
    ]);
  });

  it("takes the field from the branch and a low confidence when the name points elsewhere", () => {
    const byId = (id: string) => programmes.find((p) => p.id.endsWith(id));
    expect(byId("sf116")?.data.field).toBe("computer-science");
    expect(byId("sf117")?.data.field).toBe("engineering");
    expect(byId("sf121")?.data.field).toBe("business-economics");
    expect(byId("sf116")?.review.confidence).toBe("high");
    expect(byId("sf121")?.review.confidence).toBe("low");
  });

  it("leaves tuition, intakes and documents null for the reader and uses the register page", () => {
    const p = programmes[0];
    expect(p?.data.officialUrl).toBe("https://tempus.tpf.hu/studyfinder/index/show/116");
    expect(p?.data.tuition).toMatchObject({ value: null });
    expect(p?.data.intakes).toMatchObject({ value: null });
    expect(p?.data.documents).toMatchObject({ value: null });
    expect(p?.data.durationYears).toMatchObject({ value: 3.5 });
    expect(p?.data.teachingLanguages).toMatchObject({ value: ["en"] });
    expect(p?.data.country).toBe("HU");
    expect(p?.data.sources).toEqual({
      studyfinder: {
        url: "https://tempus.tpf.hu/studyfinder/index/show/116",
        last_verified_at: null,
      },
    });
  });

  it("stages one institution per name, a campus unit for another city, type and website null", () => {
    expect(institutions.map((i) => i.id)).toEqual([
      "hu-university-of-debrecen-debrecen",
      "hu-university-of-debrecen-nyiregyhaza",
    ]);
    expect(institutions[0]?.data).toMatchObject({ country: "HU", type: null, website: null });
    const campusProgramme = programmes.find((p) => p.id.endsWith("sf118"));
    expect(campusProgramme?.data.institution).toBe("hu-university-of-debrecen-nyiregyhaza");
  });

  it("tells the reviewer about an http-only contact website", () => {
    const [p] = buildHungaryRecords([
      detail(130, { contactWebsite: null, contactWebsiteInsecure: "http://old.example/x" }),
    ]).filter((r) => r.collection === "programs");
    expect(p?.review.todo).toContain("listed only as http");
    expect(p?.review.todo).toContain("http://old.example/x");
    expect(p?.review.todo).not.toContain("no contact website listed");
  });

  it("stops when two institution names would get the same slug", () => {
    const long = "The Very Long Name Of A Hungarian University Of Applied Sciences In Budapest";
    expect(() =>
      buildHungaryRecords([
        detail(140, { institution: `${long} One`, location: "Budapest" }),
        detail(141, { institution: `${long} Two`, location: "Budapest" }),
      ]),
    ).toThrow(/same slug/);
  });

  it("notes scholarship availability and the programme's own page for the reviewer", () => {
    expect(programmes[0]?.review.todo).toContain("Stipendium Hungaricum");
    expect(programmes[0]?.review.todo).toContain(
      "https://www.edu.unideb.hu/p/business-informatics-bsc",
    );
  });
});

describe("parseSfList on an empty result", () => {
  it("returns nothing for the 'No results' page", () => {
    expect(parseSfList("<b>No results...</b>")).toEqual([]);
  });
});

describe("parseSfTotal", () => {
  it("reads the announced number of results, 0 for none, null when absent", () => {
    expect(parseSfTotal("<b>52 results:</b><div")).toBe(52);
    expect(parseSfTotal("<b>1 result:</b>")).toBe(1);
    expect(parseSfTotal("<b>No results...</b>")).toBe(0);
    expect(parseSfTotal("<html></html>")).toBeNull();
  });
});

describe("fieldOfBranch health", () => {
  it("maps both Study Finder health branches to allied-health", () => {
    expect(fieldOfBranch("Health Science")).toBe("allied-health");
    expect(fieldOfBranch("Medical and Health Science")).toBe("allied-health");
  });
});
