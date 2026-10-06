import { describe, expect, it } from "vitest";

import {
  type AuditRow,
  drawBatch,
  isAlwaysSampled,
  sampleSheet,
} from "../../../scripts/import/audit";

const url = "https://www.numbeo.com/cost-of-living/in/Paris?displayCurrency=EUR";
const row: AuditRow = {
  key: "cost-profiles/fr-paris-numbeo",
  batch: "b1-abc123",
  inSample: true,
  audited: "",
  outcome: "",
  notes: "",
};

const line = (min: number, max: number, currency: string, basis: string) => ({
  value: { min, max, currency, per: "month" },
  source: "numbeo",
  info_kind: "estimate",
  basis: { en: { text: basis, status: "draft" } },
});

const record = (currency: string, housing: [number, number], transport: [number, number]) => ({
  slug: "fr-paris-numbeo",
  country: "FR",
  city: "paris",
  lines: {
    housing: line(housing[0], housing[1], currency, "Monthly rent of a 1-bedroom apartment."),
    transport: line(transport[0], transport[1], currency, "Monthly public transport pass."),
  },
  sources: { numbeo: { url, last_verified_at: null } },
  _review: {
    kind: "cost-profiles",
    slug: "fr-paris-numbeo",
    name: "Numbeo cost profile fr-paris-numbeo",
    preparedBy: "assistant",
    evidence: [
      {
        fact: "lines.housing",
        url,
        quote:
          "1 Bedroom Apartment Outside of City Centre: average 1065.17, low 800.00, high 1300.00 (EUR)",
      },
      {
        fact: "lines.transport",
        url,
        quote:
          "Monthly Public Transport Pass (Regular Price): average 75.00, low 30.00, high 86.40 (EUR)",
      },
    ],
    notes: "Numbeo page last update 2026-10-03.",
  },
});

const sheetFor = (value: unknown) => sampleSheet([{ key: row.key, record: value, row }]);

describe("sampleSheet for a cost profile", () => {
  it("shows each line's name, its range in major units with the currency, and its estimate label", () => {
    const sheet = sheetFor(record("EUR", [80000, 130000], [3000, 8640]));
    expect(sheet).toContain(
      "- **housing**: `800.00 to 1,300.00 EUR per month` (estimate; source numbeo)",
    );
    expect(sheet).toContain(
      "- **transport**: `30.00 to 86.40 EUR per month` (estimate; source numbeo)",
    );
  });

  it("shows the Numbeo row behind each line and the page url", () => {
    const sheet = sheetFor(record("EUR", [80000, 130000], [3000, 8640]));
    expect(sheet).toContain(
      `  - "1 Bedroom Apartment Outside of City Centre: average 1065.17, low 800.00, high 1300.00 (EUR)" — ${url}`,
    );
    expect(sheet).toContain(
      `  - "Monthly Public Transport Pass (Regular Price): average 75.00, low 30.00, high 86.40 (EUR)" — ${url}`,
    );
    expect(sheet).toContain(`- **page**: ${url}`);
  });

  it("shows the formula sentence and asks the owner to confirm the city, currency and date", () => {
    const sheet = sheetFor(record("EUR", [80000, 130000], [3000, 8640]));
    expect(sheet).toContain("Monthly rent of a 1-bedroom apartment.");
    expect(sheet).toContain("Monthly public transport pass.");
    expect(sheet).toContain(
      "Confirm: this is the city's page (right city, right currency, right date)",
    );
  });

  it("lists one evidence line per Numbeo row of the food basket", () => {
    const profile = record("EUR", [80000, 130000], [3000, 8640]);
    const food = {
      ...profile,
      lines: { food: line(3600, 7200, "EUR", "Basket of groceries.") },
      _review: {
        ...profile._review,
        evidence: [
          {
            fact: "lines.food",
            url,
            quote:
              "Milk (Regular, 1 Liter) x 8: low 1.00, high 2.00; Fresh White Bread (500 g Loaf) x 8: low 1.00, high 2.00 (EUR)",
          },
        ],
      },
    };
    const sheet = sheetFor(food);
    expect(sheet).toContain(`  - "Milk (Regular, 1 Liter) x 8: low 1.00, high 2.00" — ${url}`);
    expect(sheet).toContain(
      `  - "Fresh White Bread (500 g Loaf) x 8: low 1.00, high 2.00 (EUR)" — ${url}`,
    );
  });

  it("follows the currency's own minor units: forints have none, as buildProfile stages them", () => {
    const sheet = sheetFor(record("HUF", [150000, 250000], [9000, 12000]));
    expect(sheet).toContain("`150,000 to 250,000 HUF per month`");
  });

  it("keeps the preparer's caveats", () => {
    expect(sheetFor(record("EUR", [80000, 130000], [3000, 8640]))).toContain(
      "> Preparer's caveats: Numbeo page last update 2026-10-03.",
    );
  });
});

describe("always-sampled official cost profiles", () => {
  it("treats country and city official profiles like scholarships: always read, never waivable", () => {
    expect(isAlwaysSampled("cost-profiles/fr-official")).toBe(true);
    expect(isAlwaysSampled("cost-profiles/fr-paris-official")).toBe(true);
    expect(isAlwaysSampled("scholarships/some-award")).toBe(true);
  });

  it("leaves Numbeo profiles and other collections to the normal sample", () => {
    expect(isAlwaysSampled("cost-profiles/fr-paris-numbeo")).toBe(false);
    expect(isAlwaysSampled("cost-profiles/fr-numbeo")).toBe(false);
    expect(isAlwaysSampled("programs/official")).toBe(false);
    expect(isAlwaysSampled("cost-profiles/fr-official-numbeo")).toBe(false);
  });

  it("draws every official profile into the batch sample and only 10% of the rest", () => {
    const numbeo = Array.from(
      { length: 40 },
      (_, i) => `cost-profiles/xx-city${String(i).padStart(2, "0")}-numbeo`,
    );
    const rows = drawBatch({
      preparedKeys: [...numbeo, "cost-profiles/fr-official", "cost-profiles/fr-paris-official"],
      existing: [],
      seed: "s1",
      batchIndex: 1,
    });
    const sampled = rows.filter((r) => r.inSample).map((r) => r.key);
    expect(sampled).toContain("cost-profiles/fr-official");
    expect(sampled).toContain("cost-profiles/fr-paris-official");
    expect(sampled.filter((k) => k.endsWith("-numbeo")).length).toBeLessThan(numbeo.length / 2);
  });
});

describe("sampleSheet for an official cost profile", () => {
  const sourceUrl = "https://www.campusfrance.org/fr/cout-de-la-vie";
  const quoteUrl = "https://www.service-public.gouv.fr/particuliers/vosdroits/F2000";
  const officialQuote =
    "La CVEC est de 100 EUR; elle est due chaque annee par tous les etudiants inscrits.";
  const estimateQuote = "Compter environ 300 EUR par mois pour se nourrir.";
  const officialRow: AuditRow = { ...row, key: "cost-profiles/fr-official" };
  const official = {
    slug: "fr-official",
    country: "FR",
    city: null,
    lines: {
      oneOff: {
        value: { min: 10000, max: 10000, currency: "EUR", per: "year" },
        source: "service-public",
        info_kind: "official",
      },
      food: {
        value: { min: 30000, max: 30000, currency: "EUR", per: "month" },
        source: "campus-france",
        info_kind: "estimate",
        basis: {
          en: { text: "Campus France guidance, 2026: about 300 EUR a month.", status: "draft" },
        },
      },
    },
    sources: {
      "service-public": { url: quoteUrl, last_verified_at: null },
      "campus-france": { url: sourceUrl, last_verified_at: null },
    },
    _review: {
      kind: "cost-profiles",
      slug: "fr-official",
      name: "Official cost profile fr-official",
      preparedBy: "assistant",
      evidence: [
        { fact: "lines.oneOff", url: quoteUrl, quote: officialQuote },
        { fact: "lines.food", url: sourceUrl, quote: estimateQuote },
      ],
    },
  };
  const officialSheet = () =>
    sampleSheet([{ key: officialRow.key, record: official, row: officialRow }]);

  it("labels each line by its own info kind and source key", () => {
    const sheet = officialSheet();
    expect(sheet).toContain(
      "- **oneOff**: `100.00 to 100.00 EUR per year` (official; source service-public)",
    );
    expect(sheet).toContain(
      "- **food**: `300.00 to 300.00 EUR per month` (estimate; source campus-france)",
    );
  });

  it("prints each quote verbatim, with its page, next to the number", () => {
    const sheet = officialSheet();
    expect(sheet).toContain(`  - "${officialQuote}" — ${quoteUrl}`);
    expect(sheet).toContain(`  - "${estimateQuote}" — ${sourceUrl}`);
  });

  it("links the first source's page whatever its key is", () => {
    expect(officialSheet()).toContain(`- **page**: ${quoteUrl}`);
  });

  it("asks the owner to check the quote against the official page, not the Numbeo city", () => {
    const sheet = officialSheet();
    expect(sheet).toContain("Confirm: the quote is on the official page and the number matches");
    expect(sheet).not.toContain("this is the city's page");
  });

  it("keeps the Numbeo check line and no official one for a Numbeo profile", () => {
    const sheet = sheetFor(record("EUR", [80000, 130000], [3000, 8640]));
    expect(sheet).not.toContain("the quote is on the official page");
  });
});
