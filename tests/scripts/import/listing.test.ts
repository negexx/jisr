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
});
