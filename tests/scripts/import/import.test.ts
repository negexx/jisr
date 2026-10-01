import { describe, expect, it } from "vitest";

import { classifyField } from "../../../scripts/import/fields";
import { decodeBytes } from "../../../scripts/import/http";
import { stampVerified } from "../../../scripts/import/promote";
import { parseDuoCsv, titleCase } from "../../../scripts/import/sources/duo";
import type { EsrIndex } from "../../../scripts/import/sources/esr";
import {
  HRK_KINDS,
  parseHrkList,
  sectorOfSponsor,
  websiteCandidates,
} from "../../../scripts/import/sources/hrk";
import type { OnisepIndex } from "../../../scripts/import/sources/onisep";
import { parentUais, sectorOf } from "../../../scripts/import/sources/onisep";
import { ownSitesByUai } from "../../../scripts/import/sources/onisep-actions";
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

describe("onisep actions", () => {
  it("picks the https site most offers list, alphabetically on ties, and ignores http", () => {
    const rows = [
      { ens_code_uai: "A", ens_site_web: "https://b.example" },
      { ens_code_uai: "A", ens_site_web: "https://a.example" },
      { ens_code_uai: "A", ens_site_web: "https://b.example" },
      { ens_code_uai: "B", ens_site_web: "http://insecure.example" },
      { ens_code_uai: "C", ens_site_web: "https://c.example" },
      { ens_code_uai: "C", ens_site_web: "https://d.example" },
      { ens_code_uai: "", ens_site_web: "https://nouai.example" },
    ];
    const sites = ownSitesByUai(rows);
    expect(sites.get("A")).toBe("https://b.example");
    expect(sites.get("C")).toBe("https://c.example");
    expect(sites.has("B")).toBe(false);
    expect(sites.size).toBe(2);
  });
  it("ranks the establishment's own site above Wikidata and the parent", () => {
    const own = new Map([["0000001A", "https://iut.example/"]]);
    const wikidata = new Map([["0000001A", ["https://wd.example/"]]]);
    const index: EsrIndex = { currentUai: new Map(), byUai: new Map(), byNameKey: new Map() };
    const site = resolveWebsite(
      { cod_uai: "0000001A" },
      "IUT",
      "public",
      index,
      wikidata,
      new Map(),
      own,
    );
    expect(site).toMatchObject({ url: "https://iut.example/", confirmed: false });
    expect(site.origin).toMatch(/own site/);
  });
});

describe("hrk list", () => {
  const header =
    "Hs-Nr.\tHochschulname\tHochschultyp\tTr\u00e4gerschaft\tBundesland\tOrt (Hausanschrift)\tHome Page";
  const row = (cells: string[]) => cells.join("\t");
  it("parses rows by column name and keeps only Bachelor-relevant kinds", () => {
    const text = [
      header,
      row([
        "1",
        "Rheinisch-Westf\u00e4lische Technische Hochschule Aachen",
        "Universit\u00e4ten",
        "\u00f6ffentlich-rechtlich",
        "Nordrhein-Westfalen",
        "Aachen",
        "https://www.rwth-aachen.de",
      ]),
      row([
        "2",
        "Hochschule f\u00fcr Musik",
        "K\u00fcnstlerische Hochschulen",
        "\u00f6ffentlich-rechtlich",
        "Bayern",
        "M\u00fcnchen",
        "www.hfm.de",
      ]),
    ].join("\r\n");
    const parsed = parseHrkList(text);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      hsNr: "1",
      city: "Aachen",
      homepage: "https://www.rwth-aachen.de",
    });
    expect(parsed.filter((i) => HRK_KINDS.includes(i.kind))).toHaveLength(1);
  });
  it("fails loudly when the column layout changes", () => {
    expect(() => parseHrkList("a\tb\n1\t2")).toThrow(/columns are missing/);
  });
  it("maps the sponsor and flags church-run institutions", () => {
    expect(sectorOfSponsor("\u00f6ffentlich-rechtlich")).toEqual({
      type: "public",
      church: false,
    });
    expect(sectorOfSponsor("privat, staatlich anerkannt")).toEqual({
      type: "private",
      church: false,
    });
    expect(sectorOfSponsor("kirchlich, staatlich anerkannt")).toEqual({
      type: null,
      church: true,
    });
    expect(sectorOfSponsor("?")).toEqual({ type: null, church: false });
  });
  it("only probes websites that are not already https", () => {
    expect(websiteCandidates("https://x.de")).toEqual({
      asListed: "https://x.de",
      needsProbe: false,
    });
    expect(websiteCandidates("http://x.de")).toEqual({ asListed: "http://x.de", needsProbe: true });
    expect(websiteCandidates("www.x.de")).toEqual({ asListed: "www.x.de", needsProbe: true });
    expect(websiteCandidates(" ")).toEqual({ asListed: null, needsProbe: false });
  });
});

describe("duo list", () => {
  const csv = [
    "SOORT HO;PROVINCIE;BEVOEGD GEZAG NUMMER;INSTELLINGSCODE;INSTELLINGSNAAM;PLAATSNAAM;INTERNETADRES;DENOMINATIE",
    "hbo;Friesland;30156;31FR;NHL Stenden Hogeschool;LEEUWARDEN;www.nhl.nl;Overige",
    "wo;Zuid-Holland;1;21PK;Universiteit Leiden;LEIDEN;https://www.universiteitleiden.nl;Rijks",
    "mbo;X;2;99XX;Not higher education;PLACE;x.nl;Rijks",
  ].join("\r\n");
  it("reads hbo and wo institutions and normalises the town name", () => {
    const parsed = parseDuoCsv(csv);
    expect(parsed.map((i) => i.code)).toEqual(["31FR", "21PK"]);
    expect(parsed[0]).toMatchObject({ kind: "hbo", city: "Leeuwarden", website: "www.nhl.nl" });
  });
  it("title-cases multi-word and hyphenated towns", () => {
    expect(titleCase("DEN HAAG")).toBe("Den Haag");
    expect(titleCase("BERGEN-OP-ZOOM")).toBe("Bergen-op-Zoom");
    expect(titleCase("BERGEN OP ZOOM")).toBe("Bergen op Zoom");
    expect(titleCase("IJMUIDEN")).toBe("IJmuiden");
    expect(titleCase("'S-GRAVENHAGE")).toBe("'S-Gravenhage");
  });
  it("fails loudly when the column layout changes", () => {
    expect(() => parseDuoCsv("a;b\n1;2")).toThrow(/columns are missing/);
  });
});

describe("decodeBytes", () => {
  it("decodes windows-1252 punctuation and accents", () => {
    expect(decodeBytes(Uint8Array.from([0x41, 0x96, 0x42, 0xfc, 0x80]), "windows-1252")).toBe(
      "A\u2013B\u00fc\u20ac",
    );
  });
  it("leaves utf-8 to the platform decoder", () => {
    expect(decodeBytes(new TextEncoder().encode("caf\u00e9"))).toBe("caf\u00e9");
  });
});
