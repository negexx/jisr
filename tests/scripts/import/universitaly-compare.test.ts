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
  universityTokens,
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
        possiblyOurs: [],
      },
    ]);
  });
  it("lists our programmes the portal does not offer, with the portal's reason when it lists them differently", () => {
    const mixed = classify(poliba({ lingua: "mu" }));
    const cmpMixed = compare([mixed], [ours()]);
    expect(cmpMixed.notListed).toEqual([{ ours: ours(), portalStatus: "mixed-language" }]);
    const cmpAbsent = compare([], [ours()]);
    // No portal university has this name at all: reported as university-not-matched, not "absent".
    expect(cmpAbsent.notListed).toEqual([{ ours: ours(), portalStatus: "university-not-matched" }]);
    // The university is on the portal but not this course (another class): plain "absent".
    const other = poliba({
      id: 99,
      nomeCorsoEn: "Other",
      nomeCorso: "Other",
      classe: { codice: "L-8" },
    });
    expect(compare([classify(other)], [ours()]).notListed).toEqual([
      { ours: ours(), portalStatus: "absent" },
    ]);
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

const bocconiOurs = (over: Partial<OurProgramme> = {}): OurProgramme =>
  ours({
    slug: "it-milano-bocconi-economics-l33",
    institutionSlug: "it-milano-bocconi",
    institutionName: "Università commerciale Luigi Bocconi di Milano",
    name: "Economics",
    classCode: "L-33",
    ...over,
  });

const bocconiPortal = (over = {}) =>
  course({
    id: 30,
    nomeStruttura: "Università Commerciale Luigi Bocconi MILANO",
    nomeCorso: "Economics",
    nomeCorsoEn: "Economics",
    classe: { codice: "L-33" },
    ...over,
  });

describe("universityTokens", () => {
  it("drops generic words and short tokens, keeps the distinctive ones", () => {
    expect(universityTokens("Università commerciale Luigi Bocconi di Milano")).toEqual([
      "commerciale",
      "luigi",
      "bocconi",
      "milano",
    ]);
    expect(universityTokens("Università degli Studi di Trento")).toEqual(["trento"]);
    expect(universityTokens("The University of Ab")).toEqual(["university"]);
  });
});

describe("compare: near-match university names", () => {
  it("keeps a differently spelled university as new but points at the one of ours it may be", () => {
    const cmp = compare([classify(bocconiPortal()), classify(poliba())], [bocconiOurs(), ours()]);
    expect(cmp.matched).toEqual([{ ours: ours().slug, portalId: 10 }]);
    expect(cmp.newUniversities).toEqual([
      {
        university: "Università Commerciale Luigi Bocconi MILANO",
        programmes: [expect.objectContaining({ portalId: 30 })],
        possiblyOurs: ["Università commerciale Luigi Bocconi di Milano"],
      },
    ]);
    expect(cmp.institutionsNotSeen).toEqual(["Università commerciale Luigi Bocconi di Milano"]);
    expect(cmp.notListed).toEqual([
      { ours: bocconiOurs(), portalStatus: "university-not-matched" },
    ]);
  });
  it("gives an unrelated new university no near match", () => {
    const trento = classify(
      course({ id: 12, nomeStruttura: "Università di Trento", nomeCorsoEn: "Computer Science" }),
    );
    const cmp = compare([trento], [bocconiOurs()]);
    expect(cmp.newUniversities).toEqual([
      expect.objectContaining({ university: "Università di Trento", possiblyOurs: [] }),
    ]);
  });
  it("uses the real portal status when the university spelling matches", () => {
    const cmp = compare([classify(poliba({ lingua: "mu" }))], [ours()]);
    expect(cmp.notListed).toEqual([{ ours: ours(), portalStatus: "mixed-language" }]);
  });
  it("renders the near match and the explanation", () => {
    const cmp = compare([classify(bocconiPortal())], [bocconiOurs()]);
    const text = renderReport(cmp, {
      fetchedAt: "2026-10-08T10:00:00.000Z",
      cacheDir: "d",
      englishTotal: 1,
      mixedTotal: 0,
      italianTotal: 0,
    });
    expect(text).toContain(
      "(possibly the same as one of ours: Università commerciale Luigi Bocconi di Milano)",
    );
    expect(text).toContain("university-not-matched");
    expect(text).toContain("## Our universities whose name matches no portal university name");
    expect(text).not.toContain("Our universities no portal course name matches");
  });
  it("trims the possible-match line when the portal has no link", () => {
    const cmp = compare(
      [classify(poliba({ nomeCorsoEn: "Management Engineering and Innovation", url: null }))],
      [ours()],
    );
    const text = renderReport(cmp, {
      fetchedAt: "x",
      cacheDir: "d",
      englishTotal: 1,
      mixedTotal: 0,
      italianTotal: 0,
    });
    for (const l of text.split(/\r?\n/)) expect(l).toBe(l.trimEnd());
    expect(text).toContain("also hides a programme of ours");
  });
});

describe("compare: several programmes of ours with the same name and class", () => {
  const bologna = (slug: string): OurProgramme =>
    ours({
      slug,
      institutionSlug: `${slug}-inst`,
      institutionName: "Alma Mater Studiorum Università di Bologna",
      name: "Economics",
      classCode: "L-33",
      officialUrl: null,
    });
  const bol = (id: number) =>
    classify(
      course({
        id,
        nomeStruttura: "ALMA MATER STUDIORUM - Università di BOLOGNA",
        nomeCorso: "Economics",
        nomeCorsoEn: "Economics",
        classe: { codice: "L-33" },
      }),
    );
  const sameUni = (o: OurProgramme) => ({
    ...o,
    institutionName: "ALMA MATER STUDIORUM - Università di BOLOGNA",
  });

  it("maps two identical portal courses to two different programmes of ours", () => {
    const a = sameUni(bologna("it-bologna-a-economics-l33"));
    const b = sameUni(bologna("it-bologna-b-economics-l33"));
    const cmp = compare([bol(1), bol(2)], [a, b]);
    expect(cmp.matched).toEqual([
      { ours: a.slug, portalId: 1 },
      { ours: b.slug, portalId: 2 },
    ]);
    expect(cmp.possible).toEqual([]);
    expect(cmp.notListed).toEqual([]);
  });
  it("sends the second identical course to possible when only one programme of ours exists", () => {
    const a = sameUni(bologna("it-bologna-a-economics-l33"));
    const cmp = compare([bol(1), bol(2)], [a]);
    expect(cmp.matched).toEqual([{ ours: a.slug, portalId: 1 }]);
    expect(cmp.possible).toHaveLength(1);
    expect(cmp.possible[0]?.why).toBe(`duplicate of ${a.slug} already matched (other campus?)`);
    expect(cmp.newProgrammes).toEqual([]);
  });
  it("treats a different-name course as a new programme when every same-class programme is used", () => {
    const a = sameUni(bologna("it-bologna-a-economics-l33"));
    const other = classify(
      course({
        id: 3,
        nomeStruttura: "ALMA MATER STUDIORUM - Università di BOLOGNA",
        nomeCorso: "Business",
        nomeCorsoEn: "Business",
        classe: { codice: "L-18" },
      }),
    );
    const sameClassOther = classify(
      course({
        id: 4,
        nomeStruttura: "ALMA MATER STUDIORUM - Università di BOLOGNA",
        nomeCorso: "Finance",
        nomeCorsoEn: "Finance",
        classe: { codice: "L-33" },
      }),
    );
    const cmp = compare([bol(1), sameClassOther, other], [a]);
    expect(cmp.matched).toEqual([{ ours: a.slug, portalId: 1 }]);
    expect(cmp.possible).toEqual([]);
    expect(cmp.newProgrammes.map((c) => c.portalId)).toEqual([3, 4]);
  });
});

describe("loadItalyData with sparse files", () => {
  it("loads a programme without duration, languages or url as null / [] / null", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "uni-data-"));
    await mkdir(path.join(dir, "programs"));
    await mkdir(path.join(dir, "institutions"));
    await writeFile(
      path.join(dir, "programs", "it-a-b-sparse-l18.yaml"),
      "slug: it-a-b-sparse-l18\ninstitution: it-a-b\nname: Sparse\n",
    );
    const [one] = await loadItalyData(dir);
    expect(one).toEqual({
      slug: "it-a-b-sparse-l18",
      institutionSlug: "it-a-b",
      institutionName: "it-a-b",
      name: "Sparse",
      classCode: "L-18",
      officialUrl: null,
      durationYears: null,
      languages: [],
    });
  });
});

describe("compare: exact matches win over near matches, whatever the portal order", () => {
  const BOCCONI = "Università Commerciale Luigi Bocconi MILANO";
  const bocOurs = ours({
    slug: "it-milano-bocconi-economics-l33",
    institutionSlug: "it-milano-bocconi",
    institutionName: BOCCONI,
    name: "Economics",
    classCode: "L-33",
    officialUrl: null,
  });
  const exactCourse = classify(
    course({
      id: 30,
      nomeStruttura: BOCCONI,
      nomeCorso: "Economics",
      nomeCorsoEn: "Economics",
      classe: { codice: "L-33" },
    }),
  );
  // Lower id than the exact-name course: sorting by id alone must not make the test pass.
  const renamedCourse = classify(
    course({
      id: 29,
      nomeStruttura: BOCCONI,
      nomeCorso: "Economics and Finance",
      nomeCorsoEn: "Economics and Finance",
      classe: { codice: "L-33" },
    }),
  );

  it("matches the exact-name course even when a different-name course comes first", () => {
    const first = compare([renamedCourse, exactCourse], [bocOurs]);
    const reversed = compare([exactCourse, renamedCourse], [bocOurs]);
    expect(first).toEqual(reversed);
    expect(first.matched).toEqual([{ ours: bocOurs.slug, portalId: 30 }]);
    expect(first.possible).toEqual([]);
    expect(first.newProgrammes.map((c) => c.portalId)).toEqual([29]);
    expect(first.notListed).toEqual([]);
  });

  it("never changes the comparison when the candidate order changes", () => {
    const a = ours({
      slug: "it-bologna-a-economics-l33",
      institutionSlug: "it-bologna-a",
      institutionName: BOCCONI,
      name: "Economics",
      classCode: "L-33",
    });
    const b = ours({
      slug: "it-bologna-b-economics-l33",
      institutionSlug: "it-bologna-b",
      institutionName: BOCCONI,
      name: "Economics",
      classCode: "L-33",
    });
    const dup = classify(
      course({
        id: 32,
        nomeStruttura: BOCCONI,
        nomeCorso: "Economics",
        nomeCorsoEn: "Economics",
        classe: { codice: "L-33" },
      }),
    );
    const dup2 = classify(
      course({
        id: 33,
        nomeStruttura: BOCCONI,
        nomeCorso: "Economics",
        nomeCorsoEn: "Economics",
        classe: { codice: "L-33" },
      }),
    );
    const other = classify(
      course({
        id: 34,
        nomeStruttura: BOCCONI,
        nomeCorso: "Data Science",
        nomeCorsoEn: "Data Science",
        classe: { codice: "L-31" },
      }),
    );
    const trento = classify(
      course({
        id: 35,
        nomeStruttura: "Università di Trento",
        nomeCorsoEn: "Computer Science",
        classe: { codice: "L-31" },
      }),
    );
    const bari = classify(poliba());
    const all = [renamedCourse, exactCourse, dup, dup2, other, trento, bari];
    const programmes = [a, b, ours()];
    const base = compare(all, programmes);
    const permute = (indices: number[]) => indices.flatMap((i) => all.slice(i, i + 1));
    const orders = [
      [...all].reverse(),
      permute([3, 0, 5, 1, 6, 2, 4]),
      permute([6, 4, 2, 0, 1, 3, 5]),
      permute([2, 3, 1, 0, 4, 6, 5]),
    ];
    for (const order of orders) expect(compare(order, programmes)).toEqual(base);
    // Two-pass outcome: exact names first (30 -> a, 32 -> b), the third identical course is the
    // only duplicate, the renamed course (lowest id) is a new programme, not a near match of a.
    expect(base.matched.map((m) => m.portalId).sort((x, y) => x - y)).toEqual([10, 30, 32]);
    expect(base.possible.map((p) => [p.candidate.portalId, p.why])).toEqual([
      [33, `duplicate of ${a.slug} already matched (other campus?)`],
    ]);
    expect(base.newProgrammes.map((c) => c.portalId)).toEqual([29, 34]);
    expect(base.newUniversities.map((u) => u.university)).toEqual(["Università di Trento"]);
    // Every candidate ends in exactly one place.
    const placed =
      base.matched.length +
      base.possible.length +
      base.newProgrammes.length +
      base.newUniversities.reduce((n, u) => n + u.programmes.length, 0);
    expect(placed).toBe(base.candidates);
  });
});

describe("universityTokens: libera", () => {
  it("drops the generic word libera so Bolzano is not Luiss", () => {
    expect(universityTokens("Libera Università di Bolzano")).toEqual(["bolzano"]);
    const luiss = ours({
      slug: "it-roma-luiss-economics-l33",
      institutionSlug: "it-roma-luiss",
      institutionName:
        "Luiss - Libera Università Internazionale degli Studi Sociali Guido Carli di Roma",
      name: "Economics",
      classCode: "L-33",
    });
    const bolzano = classify(
      course({
        id: 40,
        nomeStruttura: "Libera Università di Bolzano",
        nomeCorsoEn: "Economics",
        classe: { codice: "L-33" },
      }),
    );
    const cmp = compare([bolzano], [luiss]);
    expect(cmp.newUniversities).toEqual([
      expect.objectContaining({ university: "Libera Università di Bolzano", possiblyOurs: [] }),
    ]);
  });
});
