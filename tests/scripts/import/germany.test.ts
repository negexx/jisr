import { describe, expect, it } from "vitest";

import type { BaProgramme } from "../../../scripts/import/sources/ba";
import { BA_GROUPS, cityOf, classifyGerman, matchHrk } from "../../../scripts/import/sources/ba";
import { buildGermanRecords } from "../../../scripts/import/sources/germany";
import { READ_SOURCE } from "../../../scripts/import/staging";

const group = (field: string) => {
  const g = BA_GROUPS.find((x) => x.field === field);
  if (g === undefined) throw new Error(`no group ${field}`);
  return g;
};

const hrkInst = (hsNr: string, name: string, city: string, over: Record<string, string> = {}) => ({
  alias: "",
  hsNr,
  name,
  kind: "Universitäten",
  sponsor: "öffentlich-rechtlich",
  state: "Hessen",
  city,
  homepage: "https://www.example.de/",
  ...over,
});

const programme = (over: Partial<BaProgramme> = {}): BaProgramme => ({
  id: "1001",
  name: "Informatik Bachelor of Science",
  providerId: 26324,
  provider: "Universität Marburg",
  city: "Marburg",
  state: "Hessen",
  hochschulart: "Universität",
  subjects: ["Informatik (grundständig)"],
  group: group("computer-science"),
  ...over,
});

describe("cityOf", () => {
  it("drops the state the API sometimes appends", () => {
    expect(cityOf("Feucht, Bayern")).toBe("Feucht");
    expect(cityOf("Marburg")).toBe("Marburg");
    expect(cityOf(null)).toBe("");
  });
});

describe("classifyGerman", () => {
  it("uses the study-field group and lets computer-science names win", () => {
    expect(classifyGerman(group("engineering"), "Maschinenbau Bachelor", [])).toEqual({
      field: "engineering",
      confidence: "high",
    });
    expect(classifyGerman(group("engineering"), "Technische Informatik", [])?.field).toBe(
      "computer-science",
    );
    expect(classifyGerman(group("business-economics"), "Wirtschaftsinformatik", [])?.field).toBe(
      "computer-science",
    );
  });
  it("flags business programmes that are not core economics as low confidence", () => {
    expect(
      classifyGerman(group("business-economics"), "Betriebswirtschaftslehre", [])?.confidence,
    ).toBe("high");
    expect(classifyGerman(group("business-economics"), "Tourismusmanagement", [])?.confidence).toBe(
      "low",
    );
  });
  it("excludes teacher-training degrees", () => {
    expect(
      classifyGerman(group("computer-science"), "Informatik Bachelor (Lehramt an Gymnasien)", []),
    ).toBeNull();
  });
});

describe("matchHrk", () => {
  const list = [
    {
      slug: "de-philipps-universitat-marburg-hrk1",
      name: "Philipps-Universität Marburg",
      city: "Marburg",
    },
    {
      slug: "de-hochschule-aalen-hrk3",
      name: "Hochschule Aalen - Technik, Wirtschaft und Gesundheit",
      city: "Aalen",
    },
    { slug: "de-tu-munchen-hrk4", name: "Technische Universität München", city: "München" },
    { slug: "de-th-munchen-hrk5", name: "Technische Hochschule München", city: "München" },
  ];
  it("matches a shortened provider name in the same town", () => {
    expect(matchHrk("Universität Marburg", "Marburg", list)?.slug).toBe(
      "de-philipps-universitat-marburg-hrk1",
    );
    expect(matchHrk("Hochschule Aalen", "Aalen", list)?.slug).toBe("de-hochschule-aalen-hrk3");
  });
  it("matches an everyday short name through the HRK alias", () => {
    const withAlias = [
      ...list,
      {
        slug: "de-rwth-hrk1",
        name: "Rheinisch-Westfälische Technische Hochschule Aachen",
        city: "Aachen",
        alias: "RWTH Aachen",
      },
      {
        slug: "de-th-reutlingen-hrk8",
        name: "Hochschule Reutlingen, Hochschule für Technik",
        city: "Reutlingen",
        alias: "Hochschule Reutlingen",
      },
      {
        slug: "de-theol-reutlingen-hrk9",
        name: "Theologische Hochschule Reutlingen",
        city: "Reutlingen",
        alias: "Theologische Hochschule Reutlingen",
      },
    ];
    expect(matchHrk("RWTH Aachen", "Aachen", withAlias)?.slug).toBe("de-rwth-hrk1");
    expect(matchHrk("Hochschule Reutlingen", "Reutlingen", withAlias)?.slug).toBe(
      "de-th-reutlingen-hrk8",
    );
  });
  it("does not confuse a Universität with a Hochschule of the same town", () => {
    expect(matchHrk("Technische Universität München", "München", list)?.slug).toBe(
      "de-tu-munchen-hrk4",
    );
    expect(matchHrk("Technische Hochschule München", "München", list)?.slug).toBe(
      "de-th-munchen-hrk5",
    );
  });
  it("matches a campus in another town when the provider's name carries the institution's town", () => {
    expect(matchHrk("Universität Marburg", "Gießen", list)?.slug).toBe(
      "de-philipps-universitat-marburg-hrk1",
    );
  });
  it("never guesses: another town without the town in the name, or an ambiguous name, gives no match", () => {
    expect(matchHrk("Universität Hessen", "Gießen", list)).toBeNull();
    expect(matchHrk("Hochschule", "Aalen", list)).toBeNull();
  });
});

describe("buildGermanRecords", () => {
  const hrk = [hrkInst("1", "Philipps-Universität Marburg", "Marburg")];
  const probed = new Map<string, string | null>();

  it("attaches a matched programme to the HRK institution and keeps every fact blocked", () => {
    const records = buildGermanRecords({ programmes: [programme()], hrk, probed });
    const prog = records.find((r) => r.collection === "programs");
    expect(prog?.data).toMatchObject({
      institution: "de-philipps-universitat-marburg-hrk1",
      country: "DE",
      city: "marburg",
      field: "computer-science",
      officialUrl: null,
    });
    const data = prog?.data as Record<string, { info_kind: string }>;
    for (const key of [
      "durationYears",
      "teachingLanguages",
      "tuition",
      "intakes",
      "applicationChannel",
      "documents",
    ]) {
      expect(data[key]?.info_kind).toBe(READ_SOURCE);
    }
    expect(records.filter((r) => r.collection === "institutions")).toHaveLength(0);
  });

  it("creates a campus institution when the study town differs, with the same city as the programme", () => {
    const records = buildGermanRecords({
      programmes: [programme({ city: "Gießen" })],
      hrk,
      probed,
    });
    const inst = records.find((r) => r.collection === "institutions");
    const prog = records.find((r) => r.collection === "programs");
    expect(inst?.id).toBe("de-philipps-universitat-marburg-hrk1-giessen");
    expect((inst?.data.city as { slug: string }).slug).toBe("giessen");
    expect(prog?.data.institution).toBe(inst?.id);
    expect(prog?.data.city).toBe("giessen");
  });

  it("stages an unmatched provider as its own candidate institution, never as official", () => {
    const records = buildGermanRecords({
      programmes: [programme({ provider: "Fremde Hochschule GmbH", city: "Köln", providerId: 77 })],
      hrk,
      probed,
    });
    const inst = records.find((r) => r.collection === "institutions");
    expect(inst?.id).toBe("de-fremde-hochschule-gmbh-ba77-koln");
    expect(inst?.data.info_kind).toBe(READ_SOURCE);
    expect(inst?.data.type).toBeNull();
    expect(records.find((r) => r.collection === "programs")?.review.todo).toMatch(
      /not in the HRK list/,
    );
  });

  it("skips excluded programmes and ones with no town", () => {
    const records = buildGermanRecords({
      programmes: [
        programme({ id: "2", name: "Informatik (Lehramt an Gymnasien)" }),
        programme({ id: "3", city: "", provider: "Fremde Hochschule" }),
      ],
      hrk,
      probed,
    });
    expect(records.filter((r) => r.collection === "programs")).toHaveLength(0);
  });
});
