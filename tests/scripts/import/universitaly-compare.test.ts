import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { classify } from "../../../scripts/import/sources/universitaly";
import {
  compare,
  loadItalyData,
  type OurProgramme,
  renderReport,
} from "../../../scripts/import/sources/universitaly-compare";

import { course } from "./universitaly-helpers";

const ours = (over: Partial<OurProgramme> = {}): OurProgramme => ({
  slug: "it-bari-politecnico-bari-management-engineering-for-innovation-l9",
  institutionSlug: "it-bari-politecnico-bari",
  institutionName: "Politecnico di Bari",
  name: "Management Engineering for Innovation",
  classCode: "L-9",
  officialUrl: "https://orientami.poliba.it/management",
  durationYears: 3,
  languages: ["en"],
  ...over,
});

const poliba = (over = {}) =>
  course({
    id: 10,
    nomeStruttura: "POLITECNICO DI BARI",
    nomeCorso: "Management Engineering for Innovation",
    nomeCorsoEn: "Management Engineering for Innovation",
    classe: { codice: "L-9" },
    url: "https://www.poliba.it/en/management",
    ...over,
  });

describe("loadItalyData", () => {
  it("reads our Italy programmes with their institution name and the class from the slug", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "uni-data-"));
    await mkdir(path.join(dir, "programs"));
    await mkdir(path.join(dir, "institutions"));
    await writeFile(
      path.join(dir, "institutions", "it-bari-politecnico-bari.yaml"),
      "slug: it-bari-politecnico-bari\nname: Politecnico di Bari\n",
    );
    await writeFile(
      path.join(
        dir,
        "programs",
        "it-bari-politecnico-bari-management-engineering-for-innovation-l9.yaml",
      ),
      "slug: it-bari-politecnico-bari-management-engineering-for-innovation-l9\ninstitution: it-bari-politecnico-bari\nname: Management Engineering for Innovation\nofficialUrl: https://orientami.poliba.it/management\ndurationYears:\n  value: 3\nteachingLanguages:\n  value:\n    - en\n",
    );
    await writeFile(
      path.join(dir, "programs", "fr-paris-something-l9.yaml"),
      "slug: fr-paris-something-l9\ninstitution: fr-paris\nname: X\n",
    );
    const result = await loadItalyData(dir);
    expect(result).toEqual([ours()]);
  });
});

describe("compare", () => {
  it("matches a candidate to our programme by university, class and name", () => {
    const cmp = compare([classify(poliba())], [ours()]);
    expect(cmp.matched).toEqual([{ ours: ours().slug, portalId: 10 }]);
    expect(cmp.newProgrammes).toEqual([]);
    expect(cmp.notListed).toEqual([]);
    expect(cmp.candidates).toBe(1);
  });
  it("calls a same-university same-class course with another name a possible match, not a new one", () => {
    const cmp = compare(
      [classify(poliba({ nomeCorsoEn: "Management Engineering and Innovation" }))],
      [ours()],
    );
    expect(cmp.matched).toEqual([]);
    expect(cmp.possible).toHaveLength(1);
    expect(cmp.possible[0]?.ours).toBe(ours().slug);
    expect(cmp.newProgrammes).toEqual([]);
  });
  it("separates a new programme at a known university from a new university", () => {
    const newProg = classify(
      poliba({
        id: 11,
        nomeCorsoEn: "Computer Engineering",
        nomeCorso: "Computer Engineering",
        classe: { codice: "L-8" },
      }),
    );
    const newUni = classify(
      course({
        id: 12,
        nomeStruttura: "Università di Trento",
        nomeCorsoEn: "Computer Science",
        classe: { codice: "L-31" },
      }),
    );
    const cmp = compare([classify(poliba()), newProg, newUni], [ours()]);
    expect(cmp.newProgrammes.map((c) => c.portalId)).toEqual([11]);
    expect(cmp.newUniversities).toEqual([
      {
        university: "Università di Trento",
        programmes: [expect.objectContaining({ portalId: 12 })],
      },
    ]);
  });
  it("lists our programmes the portal does not offer, with the portal's reason when it lists them differently", () => {
    const mixed = classify(poliba({ lingua: "mu" }));
    const cmpMixed = compare([mixed], [ours()]);
    expect(cmpMixed.notListed).toEqual([{ ours: ours(), portalStatus: "mixed-language" }]);
    const cmpAbsent = compare([], [ours()]);
    expect(cmpAbsent.notListed).toEqual([{ ours: ours(), portalStatus: "absent" }]);
    expect(cmpAbsent.institutionsNotSeen).toEqual(["Politecnico di Bari"]);
  });
  it("reports duration, language and url-host mismatches of matched programmes", () => {
    const cmp = compare([classify(poliba({ durataAnni: 4 }))], [ours({ languages: ["it"] })]);
    // hostKey strips a leading "www.".
    expect(cmp.mismatches).toEqual([
      { slug: ours().slug, field: "duration", ours: "3", portal: "4" },
      { slug: ours().slug, field: "language", ours: "it", portal: "en" },
      { slug: ours().slug, field: "url-host", ours: "orientami.poliba.it", portal: "poliba.it" },
    ]);
  });
  it("counts every status and states the academic year the portal reports", () => {
    const cmp = compare(
      [
        classify(poliba()),
        classify(course({ id: 2, lingua: "IT" })),
        classify(course({ id: 3, classe: { codice: "L-34" } })),
      ],
      [ours()],
    );
    expect(cmp.tally).toMatchObject({
      candidate: 1,
      "not-english": 1,
      "class-out-of-scope": 1,
      "mixed-language": 0,
    });
    expect(cmp.academicYear).toBe("2026/2027");
  });
});

describe("renderReport", () => {
  it("renders the sections and the owner's decision list", () => {
    const newUni = classify(
      course({
        id: 12,
        nomeStruttura: "Università di Trento",
        nomeCorsoEn: "Computer Science",
        classe: { codice: "L-31" },
        url: "https://www.unitn.test/cs",
      }),
    );
    const cmp = compare(
      [classify(poliba()), newUni],
      [
        ours(),
        ours({ slug: "it-x-y-l18", institutionName: "Università X", name: "Y", classCode: "L-18" }),
      ],
    );
    const text = renderReport(cmp, {
      fetchedAt: "2026-10-08T10:00:00.000Z",
      cacheDir: "data-staging/universitaly/2026-10-08",
      englishTotal: 241,
      mixedTotal: 137,
      italianTotal: 2713,
    });
    expect(text).toContain("# Universitaly discovery report");
    expect(text).toContain("2026/2027");
    expect(text).toContain("## New universities");
    expect(text).toContain("Università di Trento");
    expect(text).toContain("https://www.unitn.test/cs");
    expect(text).toContain("## Programmes we have that the portal does not list");
    expect(text).toContain("it-x-y-l18");
    expect(text).toContain("## Counts");
    expect(text).toContain("2713");
  });
});
