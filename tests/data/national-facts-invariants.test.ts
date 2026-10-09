import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { programmeKind } from "../../scripts/import/fr-calendar";

// Facts that a national page states once for hundreds of programmes (data/README.md, "National
// facts") are only valid for the programmes they were selected for. These invariants pin the
// selectors' outcome in the promoted data, so a selector that leaks (a private school, another
// channel, another country) fails here instead of reaching students.
const CAMPUS_FRANCE_STEP_2 =
  "https://www.maroc.campusfrance.org/2la-saisie-des-informations-personnelles";
const UNI_ASSIST_COUNTRY_PAGES = "https://www.uni-assist.de/en/tools/info-country-by-country/";
const ITALIAN_CIRCULAR_HOST = "universitaly-private.cineca.it";
const UNI_ASSIST_CHANNELS: readonly string[] = ["de-uni-assist", "de-uni-assist-vpd"];

type Rec = Record<string, unknown>;

const asRec = (value: unknown): Rec =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Rec) : {};

function readDir(dir: string): Rec[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".yaml"))
    .sort()
    .map((name) => asRec(parse(readFileSync(path.join(dir, name), "utf8"))));
}

function invariantViolations(
  programmes: readonly Rec[],
  institutionTypes: ReadonlyMap<string, string>,
): string[] {
  const violations: string[] = [];
  for (const record of programmes) {
    const slug = String(record.slug);
    const documents = asRec(record.documents);
    const sourceKey = typeof documents.source === "string" ? documents.source : "";
    const url = asRec(asRec(record.sources)[sourceKey]).url;
    const documentsUrl = typeof url === "string" ? url : "";
    const channel = asRec(record.applicationChannel).value;
    const fail = (why: string) => violations.push(`${slug}: ${why}`);

    if (documentsUrl === CAMPUS_FRANCE_STEP_2) {
      if (!slug.startsWith("fr-"))
        fail("Campus France documents on a programme that is not French");
      if (institutionTypes.get(String(record.institution)) !== "public")
        fail("Campus France documents on a programme of a non-public institution");
      if (channel !== "fr-campus-france")
        fail(`Campus France documents but the channel is ${String(channel)}`);
      if (!["licence", "but"].includes(programmeKind(record)))
        fail("Campus France documents on a programme that is neither a Licence nor a BUT");
    }
    if (documentsUrl.startsWith(UNI_ASSIST_COUNTRY_PAGES)) {
      if (documents.info_kind !== "guidance") fail("uni-assist documents are not guidance");
      if (typeof channel !== "string" || !UNI_ASSIST_CHANNELS.includes(channel))
        fail(`uni-assist documents but the channel is ${String(channel)}`);
    }
    if (URL.canParse(documentsUrl) && new URL(documentsUrl).host === ITALIAN_CIRCULAR_HOST) {
      if (!slug.startsWith("it-"))
        fail("Italian circular documents on a programme that is not Italian");
      if (documents.info_kind !== "guidance") fail("Italian circular documents are not guidance");
    }
    const items = Array.isArray(documents.value) ? documents.value.map(asRec) : [];
    for (const item of items)
      if (item.translationRequired === false)
        fail(`document ${String(item.slug)} claims translationRequired: false`);
  }
  return violations;
}

const DATA = path.join(process.cwd(), "data");
const programmes = readDir(path.join(DATA, "programs"));
const institutionTypes = new Map(
  readDir(path.join(DATA, "institutions")).map((i) => [String(i.slug), String(i.type)]),
);

describe("national-facts data invariants", () => {
  it("holds in the promoted data", () => {
    expect(invariantViolations(programmes, institutionTypes)).toEqual([]);
  });

  it("covers the national documents it is meant to guard", () => {
    const withUrl = (match: (url: string) => boolean) =>
      programmes.filter((p) => {
        const url = asRec(asRec(p.sources)[String(asRec(p.documents).source)]).url;
        return typeof url === "string" && match(url);
      }).length;
    expect(withUrl((u) => u === CAMPUS_FRANCE_STEP_2)).toBeGreaterThan(0);
    expect(withUrl((u) => u.startsWith(UNI_ASSIST_COUNTRY_PAGES))).toBeGreaterThan(0);
    expect(
      withUrl((u) => URL.canParse(u) && new URL(u).host === ITALIAN_CIRCULAR_HOST),
    ).toBeGreaterThan(0);
  });

  describe("detects a broken invariant (injected in-memory records, data untouched)", () => {
    const frenchRecord = (patch: Rec = {}): Rec => ({
      slug: "fr-x-licence-informatique-1",
      name: "Licence - Informatique",
      institution: "fr-x",
      applicationChannel: { value: "fr-campus-france" },
      documents: { value: [], source: "page-1", info_kind: "official" },
      sources: { "page-1": { url: CAMPUS_FRANCE_STEP_2 } },
      ...patch,
    });
    const types = new Map([
      ["fr-x", "public"],
      ["fr-private", "private"],
    ]);

    it("accepts a well-formed French record", () => {
      expect(invariantViolations([frenchRecord()], types)).toEqual([]);
    });

    it("flags a private institution", () => {
      const broken = frenchRecord({ institution: "fr-private" });
      expect(invariantViolations([broken], types)).toEqual([
        "fr-x-licence-informatique-1: Campus France documents on a programme of a non-public institution",
      ]);
    });

    it("flags another channel and a Master", () => {
      const broken = frenchRecord({
        name: "Master - Informatique",
        applicationChannel: { value: "fr-parcoursup" },
      });
      expect(invariantViolations([broken], types)).toHaveLength(2);
    });

    it("flags uni-assist documents that are official or on another channel", () => {
      const broken = {
        slug: "de-x-1",
        institution: "de-x",
        applicationChannel: { value: "de-university-direct" },
        documents: { value: [], source: "page-1", info_kind: "official" },
        sources: { "page-1": { url: `${UNI_ASSIST_COUNTRY_PAGES}details-country/country/ma/` } },
      };
      expect(invariantViolations([broken], types)).toHaveLength(2);
    });

    it("flags Italian circular documents on a non-Italian or official record", () => {
      const broken = {
        slug: "de-x-1",
        institution: "de-x",
        documents: { value: [], source: "page-1", info_kind: "official" },
        sources: { "page-1": { url: `https://${ITALIAN_CIRCULAR_HOST}/uploads/circolare.pdf` } },
      };
      expect(invariantViolations([broken], types)).toHaveLength(2);
    });

    it("flags translationRequired: false on any record", () => {
      const broken = {
        slug: "nl-x-1",
        institution: "nl-x",
        documents: {
          value: [{ slug: "passport", translationRequired: false }],
          source: "programme",
          info_kind: "official",
        },
        sources: { programme: { url: "https://example.org/" } },
      };
      expect(invariantViolations([broken], types)).toEqual([
        "nl-x-1: document passport claims translationRequired: false",
      ]);
    });
  });
});
