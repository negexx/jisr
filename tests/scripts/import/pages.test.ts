import { describe, expect, it } from "vitest";

import { daadRegisterUrl, mergePages } from "../../../scripts/import/pages";

describe("daadRegisterUrl", () => {
  it("builds the DAAD programme page from the id at the end of the slug", () => {
    expect(
      daadRegisterUrl(
        "de-hochschule-bonn-rhein-sieg-university-of-hrk294-international-business-b-daad5225",
      ),
    ).toBe(
      "https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/5225/",
    );
  });

  it("is null for a programme that does not come from DAAD", () => {
    expect(daadRegisterUrl("nl-avans-hogeschool-07gr-bouwkunde-1001o3048")).toBeNull();
    expect(daadRegisterUrl("fr-aix-marseille-universite-0134316w-licence-39236")).toBeNull();
  });
});

describe("mergePages", () => {
  it("lists the register page first, then the programme, fee and admission pages, once each", () => {
    expect(
      mergePages({
        register: "https://r.example/1",
        programme: "https://u.example/p",
        fees: ["https://u.example/fees", "https://u.example/p"],
        admission: ["https://u.example/apply"],
      }),
    ).toEqual([
      "https://r.example/1",
      "https://u.example/p",
      "https://u.example/fees",
      "https://u.example/apply",
    ]);
  });

  it("leaves out what was not found", () => {
    expect(mergePages({ register: null, programme: null, fees: [], admission: [] })).toEqual([]);
  });
});
