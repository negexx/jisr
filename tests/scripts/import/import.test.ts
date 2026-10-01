import { describe, expect, it } from "vitest";

import { classifyField } from "../../../scripts/import/fields";
import { stampVerified } from "../../../scripts/import/promote";
import { parseCsv, reviewCsv } from "../../../scripts/import/staging";
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
