import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  LISTING_LEVEL,
  listingInstitution,
  listingProgramme,
  promoteListing,
} from "../../../scripts/import/listing";
import { parseCsv, READ_SOURCE, toYaml } from "../../../scripts/import/staging";

const DATE = "2026-10-02";
const fr = (over: Record<string, unknown> = {}) => ({
  slug: "fr-uni-a",
  name: "Université A",
  country: "FR",
  city: { slug: "lille", name: "Lille" },
  type: "public",
  website: "https://www.univ-a.example/",
  source: "esr",
  info_kind: "official",
  sources: { esr: { url: "https://data.example/esr", last_verified_at: null } },
  _review: { sourceId: "uai:0000001A", todo: "" },
  ...over,
});
const frProgramme = (over: Record<string, unknown> = {}) => ({
  slug: "fr-uni-a-licence-info-1",
  institution: "fr-uni-a",
  country: "FR",
  city: "lille",
  field: "computer-science",
  level: "bachelor",
  name: "Licence Informatique",
  summary: { fr: { text: "Licence Informatique, Université A (Lille).", status: "draft" } },
  officialUrl: "https://dossierappel.example/fiche?1",
  durationYears: { value: null, source: "fiche", info_kind: READ_SOURCE },
  teachingLanguages: { value: null, source: "fiche", info_kind: READ_SOURCE },
  tuition: { value: null, source: "fiche", info_kind: READ_SOURCE },
  intakes: { value: null, source: "fiche", info_kind: READ_SOURCE },
  applicationChannel: { value: null, source: "fiche", info_kind: READ_SOURCE },
  documents: { value: null, source: "fiche", info_kind: READ_SOURCE },
  requirements: { coverage: "partial", source: "fiche", info_kind: READ_SOURCE, rules: [] },
  scholarships: [],
  sources: { fiche: { url: "https://dossierappel.example/fiche?1", last_verified_at: null } },
  _review: { sourceId: "parcoursup:1", confidence: "high", todo: "" },
  ...over,
});
const daadProgramme = (over: Record<string, unknown> = {}) =>
  frProgramme({
    slug: "de-uni-b-bsc-1",
    institution: "de-uni-b",
    country: "DE",
    city: "bonn",
    officialUrl: null,
    durationYears: { value: 3.5, source: "daad", info_kind: READ_SOURCE },
    teachingLanguages: { value: ["en"], source: "daad", info_kind: READ_SOURCE },
    intakes: {
      value: [{ startDate: null, applicationOpens: null, applicationDeadline: "2027-07-15" }],
      source: "daad",
      info_kind: READ_SOURCE,
    },
    sources: { daad: { url: "https://www2.daad.example/detail/1/", last_verified_at: null } },
    _review: { sourceId: "daad:1", confidence: "high", todo: "" },
    ...over,
  });
const de = (over: Record<string, unknown> = {}) => ({
  slug: "de-uni-b",
  name: "Universität B",
  country: "DE",
  city: { slug: "bonn", name: "Bonn" },
  type: "public",
  website: "https://www.uni-b.example/",
  source: "hrk",
  info_kind: READ_SOURCE,
  sources: { hrk: { url: "https://hrk.example/list", last_verified_at: null } },
  _review: { sourceId: "hrk:1", todo: 'listed as "http://www.uni-b.example"' },
  ...over,
});
const es = (over: Record<string, unknown> = {}) => ({
  slug: "es-uni-c",
  name: "Universidad C",
  country: "ES",
  city: { slug: "madrid", name: "Madrid" },
  type: "public",
  website: null,
  source: "ruct",
  info_kind: READ_SOURCE,
  sources: {
    ruct: {
      url: "https://www.educacion.gob.es/ruct/universidad.action?codigoUniversidad=1",
      last_verified_at: null,
    },
  },
  _review: { sourceId: "ruct:1", todo: "" },
  ...over,
});

const ES_SLUG = "es-uni-c-grado-informatica-2500001";
const ES_URL = "https://www.uni-c.example/grado-informatica";
const esProgramme = (over: Record<string, unknown> = {}) => ({
  slug: ES_SLUG,
  institution: "es-uni-c",
  country: "ES",
  city: "madrid",
  field: "computer-science",
  level: "bachelor",
  name: "Grado en Ingeniería Informática",
  summary: {
    fr: { text: "Grado en Ingeniería Informática, Universidad C (Madrid).", status: "draft" },
  },
  officialUrl: null,
  durationYears: { value: null, source: "ruct", info_kind: READ_SOURCE },
  teachingLanguages: { value: null, source: "ruct", info_kind: READ_SOURCE },
  tuition: { value: null, source: "ruct", info_kind: READ_SOURCE },
  intakes: { value: null, source: "ruct", info_kind: READ_SOURCE },
  applicationChannel: { value: null, source: "ruct", info_kind: READ_SOURCE },
  documents: { value: null, source: "ruct", info_kind: READ_SOURCE },
  requirements: { coverage: "partial", source: "ruct", info_kind: READ_SOURCE, rules: [] },
  scholarships: [],
  sources: {
    ruct: {
      url: "https://www.educacion.gob.es/ruct/estudio.action?CodigoEstudio=2500001",
      last_verified_at: null,
    },
  },
  _review: { sourceId: "ruct:1:2500001", confidence: "high", todo: "" },
  ...over,
});
const esList = (...entries: [string, string][]) => new Map(entries);

describe("listingInstitution", () => {
  it("lists a register institution, with the website only when the ministry's register confirmed it", () => {
    expect(listingInstitution(fr(), DATE)).toMatchObject({
      type: "public",
      website: "https://www.univ-a.example/",
      info_kind: "official",
      sources: { esr: { last_verified_at: DATE } },
    });
    expect(listingInstitution(fr({ info_kind: READ_SOURCE }), DATE)).toMatchObject({
      website: null,
    });
  });

  it("keeps an unknown type unknown and drops a homepage that redirects to another domain", () => {
    expect(listingInstitution(de({ type: null }), DATE)).toMatchObject({ type: null });
    const moved = de({
      _review: { sourceId: "hrk:2", todo: "https redirects to a different domain (x.example)" },
    });
    expect(listingInstitution(moved, DATE)).toMatchObject({ website: null });
  });

  it("never lists an institution that is not from an official register entry", () => {
    expect(listingInstitution(de({ _review: { sourceId: "daad:9", todo: "" } }), DATE)).toBeNull();
    expect(listingInstitution(fr({ _review: { sourceId: "rio:1", todo: "" } }), DATE)).toBeNull();
  });

  it("lists a RUCT institution as official, with no website (the register states none)", () => {
    expect(listingInstitution(es(), DATE)).toMatchObject({
      type: "public",
      website: null,
      info_kind: "official",
      sources: { ruct: { last_verified_at: DATE } },
    });
    expect(listingInstitution(es({ country: "FR" }), DATE)).toBeNull();
  });
});

describe("listingProgramme", () => {
  it("lists a Parcoursup programme with every unread fact left as to be checked", () => {
    const p = listingProgramme(frProgramme(), DATE);
    expect(p).toMatchObject({
      officialUrl: "https://dossierappel.example/fiche?1",
      durationYears: { value: null, info_kind: "official" },
      tuition: { value: null },
      requirements: { coverage: "partial", rules: [] },
      sources: { fiche: { last_verified_at: DATE } },
    });
    expect(JSON.stringify(p)).not.toContain("_review");
    expect(JSON.stringify(p)).not.toContain(READ_SOURCE);
  });

  it("takes only duration and languages from DAAD, as guidance, and never its deadline", () => {
    const p = listingProgramme(daadProgramme(), DATE);
    expect(p).toMatchObject({
      officialUrl: "https://www2.daad.example/detail/1/",
      durationYears: { value: 3.5, info_kind: "guidance" },
      teachingLanguages: { value: ["en"], info_kind: "guidance" },
      intakes: { value: null },
    });
  });

  it("skips low-confidence fields, other sources and records an assistant already prepared", () => {
    expect(
      listingProgramme(
        frProgramme({ _review: { sourceId: "parcoursup:2", confidence: "low" } }),
        DATE,
      ),
    ).toBeNull();
    expect(
      listingProgramme(frProgramme({ _review: { sourceId: "rio:1", confidence: "high" } }), DATE),
    ).toBeNull();
    expect(
      listingProgramme(
        frProgramme({
          _review: { sourceId: "parcoursup:3", confidence: "high", preparedBy: "assistant" },
        }),
        DATE,
      ),
    ).toBeNull();
  });
});

describe("listingProgramme (Spain)", () => {
  it("lists a RUCT programme whose slug is in the registry, with the curated page and every fact to be checked", () => {
    const p = listingProgramme(esProgramme(), DATE, esList([ES_SLUG, ES_URL]));
    expect(p).toMatchObject({
      country: "ES",
      officialUrl: ES_URL,
      durationYears: { value: null, info_kind: "official" },
      teachingLanguages: { value: null, info_kind: "official" },
      tuition: { value: null, info_kind: "official" },
      intakes: { value: null, info_kind: "official" },
      applicationChannel: { value: null, info_kind: "official" },
      documents: { value: null, info_kind: "official" },
      requirements: { coverage: "partial", info_kind: "official", rules: [] },
      sources: { ruct: { last_verified_at: DATE } },
    });
    expect(JSON.stringify(p)).not.toContain("_review");
    expect(JSON.stringify(p)).not.toContain(READ_SOURCE);
  });

  it("never lists an ES programme whose slug is not in the registry, and never guesses one", () => {
    expect(listingProgramme(esProgramme(), DATE, esList(["es-other", ES_URL]))).toBeNull();
    expect(listingProgramme(esProgramme(), DATE)).toBeNull();
  });

  it("skips an ES programme whose field confidence is not high", () => {
    const low = esProgramme({ _review: { sourceId: "ruct:1:2500001", confidence: "low" } });
    expect(listingProgramme(low, DATE, esList([ES_SLUG, ES_URL]))).toBeNull();
  });

  it("rejects a registry URL that is not https or is not a URL, and a non-kebab slug", async () => {
    const { EsListingRegistrySchema } = await import("../../../scripts/import/listing");
    const ok = (officialUrl: string, slug = "es-x") =>
      EsListingRegistrySchema.safeParse({ entries: [{ slug, officialUrl }] }).success;
    expect(ok("http://www.uni-c.example/x")).toBe(false);
    expect(ok("/grado/informatica")).toBe(false);
    expect(ok("not a url")).toBe(false);
    expect(ok("https://www.uni-c.example/x", "ES X")).toBe(false);
    expect(ok("https://www.uni-c.example/x")).toBe(true);
  });
});

describe("promoteListing", () => {
  let root: string;
  let stagingDir: string;
  let dataDir: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "jisr-listing-"));
    stagingDir = path.join(root, "staging");
    dataDir = path.join(root, "data");
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const put = async (collection: string, slug: string, record: unknown) => {
    const file = path.join(stagingDir, collection, `${slug}.yaml`);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, toYaml(record as Record<string, unknown>));
  };

  it("promotes programmes with their institution, records the tier, and is idempotent", async () => {
    await put("institutions", "fr-uni-a", fr());
    await put("programs", "fr-uni-a-licence-info-1", frProgramme());
    await put(
      "programs",
      "fr-low",
      frProgramme({ slug: "fr-low", _review: { sourceId: "parcoursup:9", confidence: "low" } }),
    );
    const result = await promoteListing({ date: DATE, stagingDir, dataDir });
    expect(result).toMatchObject({ programmes: 1, institutions: 1 });
    expect(existsSync(path.join(dataDir, "programs", "fr-uni-a-licence-info-1.yaml"))).toBe(true);
    expect(existsSync(path.join(stagingDir, "programs", "fr-uni-a-licence-info-1.yaml"))).toBe(
      false,
    );
    expect(existsSync(path.join(stagingDir, "programs", "fr-low.yaml"))).toBe(true);
    const ledger = parseCsv(readFileSync(path.join(stagingDir, "PROMOTED.csv"), "utf8"));
    expect(ledger.map((r) => [r.collection, r.level])).toEqual([
      ["institutions", LISTING_LEVEL],
      ["programs", LISTING_LEVEL],
    ]);
    const again = await promoteListing({ date: DATE, stagingDir, dataDir });
    expect(again.programmes).toBe(0);
  });

  it("does not touch the data dir on a dry run", async () => {
    await put("institutions", "fr-uni-a", fr());
    await put("programs", "fr-uni-a-licence-info-1", frProgramme());
    const result = await promoteListing({ date: DATE, stagingDir, dataDir, dryRun: true });
    expect(result.programmes).toBe(1);
    expect(existsSync(dataDir)).toBe(false);
    expect(existsSync(path.join(stagingDir, "programs", "fr-uni-a-licence-info-1.yaml"))).toBe(
      true,
    );
  });

  it("skips a programme whose institution is not from an official register", async () => {
    await put("programs", "de-uni-b-bsc-1", daadProgramme());
    await put("institutions", "de-uni-b", de({ _review: { sourceId: "daad:7", todo: "" } }));
    const result = await promoteListing({ date: DATE, stagingDir, dataDir });
    expect(result.programmes).toBe(0);
    expect(result.skipped["institution not from an official register"]).toBe(1);
  });

  it("promotes an ES listing from an inline registry and records the register-listing tier", async () => {
    await put("institutions", "es-uni-c", es());
    await put("programs", ES_SLUG, esProgramme());
    const esListingPath = path.join(root, "es-listing.json");
    await writeFile(
      esListingPath,
      JSON.stringify({ entries: [{ slug: ES_SLUG, officialUrl: ES_URL }] }),
    );
    const result = await promoteListing({ date: DATE, stagingDir, dataDir, esListingPath });
    expect(result).toMatchObject({ programmes: 1, institutions: 1 });
    expect(readFileSync(path.join(dataDir, "programs", `${ES_SLUG}.yaml`), "utf8")).toContain(
      ES_URL,
    );
    const ledger = parseCsv(readFileSync(path.join(stagingDir, "PROMOTED.csv"), "utf8"));
    expect(ledger.map((r) => [r.collection, r.level])).toEqual([
      ["institutions", LISTING_LEVEL],
      ["programs", LISTING_LEVEL],
    ]);
  });

  it("keeps an ES programme staged when no registry entry names its slug", async () => {
    await put("institutions", "es-uni-c", es());
    await put("programs", ES_SLUG, esProgramme());
    const esListingPath = path.join(root, "es-listing.json");
    await writeFile(
      esListingPath,
      JSON.stringify({ entries: [{ slug: "es-somewhere-else", officialUrl: ES_URL }] }),
    );
    const result = await promoteListing({ date: DATE, stagingDir, dataDir, esListingPath });
    expect(result.programmes).toBe(0);
    expect(existsSync(path.join(stagingDir, "programs", `${ES_SLUG}.yaml`))).toBe(true);
  });
});
