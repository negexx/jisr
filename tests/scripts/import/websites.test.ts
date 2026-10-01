import { describe, expect, it } from "vitest";

import { passes, withoutWebsite, withWebsite } from "../../../scripts/import/websites";

describe("passes", () => {
  const own = { site: "https://iut.example.fr/", fromParent: false };
  it("accepts a candidate whose page title names the institution", () => {
    expect(passes(own, "IUT de Vannes", "IUT de Vannes - Accueil | Université Bretagne Sud")).toBe(
      true,
    );
  });
  it("refuses a third-party page that only mentions the institution further down", () => {
    const text = `${"Polyaéro Hautes-Alpes - Formations aéronautiques en alternance à Gap Tallard. ".repeat(3)} accueille les formations de l'IUT d'Aix-Marseille Université`;
    expect(passes(own, "IUT Aix-Marseille - Site d'Aix-en-Provence", text)).toBe(false);
  });
  it("lets a parent university from the ministry's register through once its page has loaded", () => {
    expect(
      passes(
        { site: "https://www.uca.fr/", fromParent: true },
        "I.U.T Clermont Auvergne - site du Puy",
        "Université Clermont Auvergne",
      ),
    ).toBe(true);
  });
});

describe("withWebsite / withoutWebsite", () => {
  const record = {
    slug: "fr-x",
    website: null,
    info_kind: "official",
    sources: { esr: { url: "https://data.example/esr", last_verified_at: null } },
  };
  it("marks a found website as guidance, not official, and dates the sources", () => {
    expect(withWebsite(record, "https://x.example/", "2026-10-02")).toMatchObject({
      website: "https://x.example/",
      info_kind: "guidance",
      sources: { esr: { last_verified_at: "2026-10-02" } },
    });
  });
  it("takes a website back out", () => {
    const listed = withWebsite(record, "https://x.example/", "2026-10-02");
    expect(withoutWebsite(listed)).toMatchObject({ website: null, info_kind: "official" });
  });
});
