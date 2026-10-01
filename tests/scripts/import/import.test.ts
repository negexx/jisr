import { describe, expect, it } from "vitest";

import { classifyField } from "../../../scripts/import/fields";
import { stampVerified } from "../../../scripts/import/promote";
import type { EsrIndex } from "../../../scripts/import/sources/esr";
import type { OnisepIndex } from "../../../scripts/import/sources/onisep";
import { parentUais, sectorOf } from "../../../scripts/import/sources/onisep";
import { resolveWebsite } from "../../../scripts/import/sources/parcoursup";
import { mergeReviewSheet, parseCsv, reviewCsv } from "../../../scripts/import/staging";
import { collapseSpaces, nameKey, normalizeCityName, slugify } from "../../../scripts/import/text";

describe("slugify", () => {
  it("strips accents and apostrophes and caps the length", () => {
    expect(slugify("Université d'Évry Val d'Essonne")).toBe("universite-devry-val-dessonne");
    expect(slugify("A".repeat(80), 10)).toBe("aaaaaaaaaa");
  });
  it("never leaves a trailing dash after truncation", () => {
    expect(slugify("abc def", 4)).toBe("abc");
  });
});

describe("text helpers", () => {
  it("folds arrondissements into the city", () => {
    expect(normalizeCityName("Paris  5e  Arrondissement")).toBe("Paris");
    expect(normalizeCityName("Lyon 3ème arrondissement")).toBe("Lyon");
    expect(normalizeCityName("Champs-sur-Marne")).toBe("Champs-sur-Marne");
  });
  it("builds comparable name keys", () => {
    expect(nameKey("Université  de LORRAINE")).toBe(nameKey("universite de lorraine"));
    expect(collapseSpaces(" a   b ")).toBe("a b");
  });
});

describe("classifyField", () => {
  it("maps national branches to Release 1 fields", () => {
    expect(classifyField("Informatique")).toEqual({
      field: "computer-science",
      confidence: "high",
    });
    expect(classifyField("Génie civil - Construction durable")?.field).toBe("engineering");
    expect(classifyField("Gestion")?.field).toBe("business-economics");
  });
  it("flags judgement calls as low confidence", () => {
    expect(classifyField("Sciences et technologies")?.confidence).toBe("low");
  });
  it("leaves everything else out", () => {
    expect(classifyField("Droit")).toBeNull();
    expect(classifyField("Langues étrangères appliquées")).toBeNull();
  });
});

describe("stampVerified", () => {
  it("fills only null last_verified_at values, at any depth", () => {
    const stamped = stampVerified(
      {
        sources: {
          a: { url: "https://x.example", last_verified_at: null },
          b: { last_verified_at: "2026-01-01" },
        },
        list: [{ last_verified_at: null }],
        other: null,
      },
      "2026-10-01",
    );
    expect(stamped).toEqual({
      sources: {
        a: { url: "https://x.example", last_verified_at: "2026-10-01" },
        b: { last_verified_at: "2026-01-01" },
      },
      list: [{ last_verified_at: "2026-10-01" }],
      other: null,
    });
  });
});

describe("review csv", () => {
  const row = {
    kind: "programs",
    slug: "p-1",
    name: 'Licence "Info", parcours A',
    institution: "Univ",
    city: "Lille",
    field: "computer-science",
    confidence: "high",
    officialUrl: "https://x.example/a?b=1",
    todo: "check",
  };
  it("round-trips quoting and carries the approval column", () => {
    const parsed = parseCsv(reviewCsv([row], new Set(["programs/p-1"])));
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ approved: "y", slug: "p-1", name: row.name });
  });
  it("leaves unapproved rows blank", () => {
    expect(parseCsv(reviewCsv([row], new Set()))[0]?.approved).toBe("");
  });
});

describe("onisep helpers", () => {
  const structure = (link: string) => ({
    code_uai: "0000000A",
    nom: "IUT",
    type_detablissement: "institut universitaire de technologie",
    statut: "public",
    universite_de_rattachement_libelle_et_uai: link,
  });
  it("reads parent UAI codes from the link text", () => {
    expect(parentUais(structure("Université de Brest (0292473F)"))).toEqual(["0292473F"]);
    expect(parentUais(structure("A (0597132G) | B (0623957P)"))).toEqual(["0597132G", "0623957P"]);
    expect(parentUais(structure(""))).toEqual([]);
    expect(parentUais(undefined)).toEqual([]);
  });
  it("normalises the public/private label", () => {
    expect(sectorOf("public")).toBe("public");
    expect(sectorOf("privé")).toBe("private");
    expect(sectorOf("privé sous contrat")).toBe("private");
    expect(sectorOf("")).toBeNull();
  });
});

describe("resolveWebsite", () => {
  const esrRow = (uo_lib: string, url: string | null, sector: string, uai: string) => ({
    uo_lib,
    url,
    uai,
    anciens_codes_uai: null,
    secteur_d_etablissement: sector,
  });
  const esr = (
    current: ReturnType<typeof esrRow>[],
    former: [string, ReturnType<typeof esrRow>][] = [],
  ): EsrIndex => ({
    currentUai: new Map(current.map((r) => [r.uai, r])),
    byUai: new Map([
      ...current.map((r): [string, ReturnType<typeof esrRow>] => [r.uai, r]),
      ...former,
    ]),
    byNameKey: new Map(current.map((r) => [nameKey(r.uo_lib), r])),
  });
  const onisep = (link: string): OnisepIndex =>
    new Map([
      [
        "0000001A",
        {
          code_uai: "0000001A",
          nom: "IUT",
          type_detablissement: "iut",
          statut: "public",
          universite_de_rattachement_libelle_et_uai: link,
        },
      ],
    ]);
  const parent = esrRow("Université Mère", "https://mere.example/", "public", "0000009Z");
  const none = new Map<string, string[]>();

  it("confirms an exact current-UAI match with the same sector", () => {
    const own = esrRow("Université X", "https://x.example/", "public", "0000001A");
    const site = resolveWebsite(
      { cod_uai: "0000001A" },
      "Université X",
      "public",
      esr([own]),
      none,
      new Map(),
    );
    expect(site).toMatchObject({ url: "https://x.example/", confirmed: true, notes: [] });
  });
  it("does not confirm a match whose sector disagrees with Parcoursup", () => {
    const own = esrRow("Université X", "https://x.example/", "privé", "0000001A");
    const site = resolveWebsite(
      { cod_uai: "0000001A" },
      "Université X",
      "public",
      esr([own]),
      none,
      new Map(),
    );
    expect(site.confirmed).toBe(false);
    expect(site.notes[0]).toMatch(/public\/private conflict/);
  });
  it("notes when the register names the establishment differently", () => {
    const own = esrRow(
      "Université de Bretagne Occidentale",
      "https://x.example/",
      "public",
      "0000001A",
    );
    const site = resolveWebsite(
      { cod_uai: "0000001A" },
      "Université de Brest",
      "public",
      esr([own]),
      none,
      new Map(),
    );
    expect(site.confirmed).toBe(true);
    expect(site.notes[0]).toMatch(/Bretagne Occidentale/);
  });
  it("treats a former UAI code as a candidate, never as confirmed", () => {
    const successor = esrRow(
      "Université Fusionnée",
      "https://fusion.example/",
      "public",
      "0000002B",
    );
    const index = esr([successor], [["0000001A", successor]]);
    const site = resolveWebsite(
      { cod_uai: "0000001A" },
      "Ancienne université",
      "public",
      index,
      none,
      new Map(),
    );
    expect(site).toMatchObject({ url: "https://fusion.example/", confirmed: false });
    expect(site.origin).toMatch(/former UAI code/);
  });
  it("prefers Wikidata over the ONISEP parent, and the ONISEP parent over a name match", () => {
    const index = esr([parent]);
    const wikidata = new Map([["0000001A", ["https://iut.example/"]]]);
    const link = onisep("Université Mère (0000009Z)");
    const viaWikidata = resolveWebsite(
      { cod_uai: "0000001A" },
      "IUT",
      "public",
      index,
      wikidata,
      link,
    );
    expect(viaWikidata).toMatchObject({ url: "https://iut.example/", confirmed: false });
    const viaOnisep = resolveWebsite(
      { cod_uai: "0000001A" },
      "IUT - Autre",
      "public",
      index,
      none,
      link,
    );
    expect(viaOnisep).toMatchObject({ url: "https://mere.example/", confirmed: false });
    expect(viaOnisep.origin).toMatch(/ONISEP/);
  });
  it("falls back to a name match, then to no website", () => {
    const index = esr([parent]);
    const byName = resolveWebsite(
      { cod_uai: "0000001A" },
      "IUT - Université Mère",
      "public",
      index,
      none,
      new Map(),
    );
    expect(byName).toMatchObject({ url: "https://mere.example/", confirmed: false });
    const missing = resolveWebsite(
      { cod_uai: "0000001A" },
      "Inconnu",
      "public",
      index,
      none,
      new Map(),
    );
    expect(missing).toMatchObject({ url: null, confirmed: false, origin: null });
  });
  it("lists several parent universities", () => {
    const other = esrRow("Université Sœur", "https://soeur.example/", "public", "0000008Y");
    const site = resolveWebsite(
      { cod_uai: "0000001A" },
      "IUT",
      "public",
      esr([parent, other]),
      none,
      onisep("Université Mère (0000009Z) | Université Sœur (0000008Y)"),
    );
    expect(site.notes[0]).toMatch(/several parent universities/);
  });
});

describe("mergeReviewSheet", () => {
  const review = (slug: string) => ({
    kind: "institutions",
    slug,
    name: slug,
    institution: "",
    city: "",
    field: "",
    confidence: "",
    officialUrl: "",
    todo: "",
  });
  const record = (slug: string) => ({
    collection: "institutions",
    id: slug,
    data: {},
    review: review(slug),
  });

  it("drops the approval of a rewritten record and keeps the others", () => {
    const { approved, rows } = mergeReviewSheet({
      existingRows: [review("a"), review("b")],
      approved: new Set(["institutions/a", "institutions/b"]),
      records: [record("a")],
      rewritten: new Set(["institutions/a"]),
      fileExists: () => true,
    });
    expect([...approved]).toEqual(["institutions/b"]);
    expect(rows.map((r) => r.slug)).toEqual(["a", "b"]);
  });
  it("removes rows whose staged file is gone", () => {
    const { rows } = mergeReviewSheet({
      existingRows: [review("gone"), review("kept")],
      approved: new Set(),
      records: [],
      rewritten: new Set(),
      fileExists: (_kind, slug) => slug === "kept",
    });
    expect(rows.map((r) => r.slug)).toEqual(["kept"]);
  });
});
