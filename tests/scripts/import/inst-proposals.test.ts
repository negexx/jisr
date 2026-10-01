import { describe, expect, it } from "vitest";

import { quoteFor, websiteFrom } from "../../../scripts/import/inst-proposals";

describe("websiteFrom", () => {
  it("takes the home page of the domain most of the institution's own pages are on", () => {
    expect(
      websiteFrom([
        "https://www.fontys.nl/Opleidingen/ICT.htm",
        "https://www.fontys.nl/Studeren/Collegegeld.htm",
        "https://www2.daad.de/deutschland/studienangebote/x/detail/1/",
        "https://other.example/x",
      ]),
    ).toBe("https://www.fontys.nl/");
  });

  it("ignores register and national pages, which belong to no institution", () => {
    expect(
      websiteFrom([
        "https://www2.daad.de/a",
        "https://dossierappel.parcoursup.fr/b",
        "https://www.maroc.campusfrance.org/c",
      ]),
    ).toBeNull();
  });

  it("is null without any page", () => {
    expect(websiteFrom([])).toBeNull();
  });
});

describe("quoteFor", () => {
  const page =
    "Home | Welkom bij Fontys Hogeschool ICT in Tilburg. Studeer bij ons en ontdek meer over onze opleidingen.";

  it("returns a verbatim stretch of the page around the institution's distinctive word", () => {
    const quote = quoteFor("Fontys Hogeschool Tilburg", page);
    expect(quote).not.toBeNull();
    expect(page).toContain(quote ?? "");
    expect(quote).toMatch(/Fontys/);
    expect((quote ?? "").length).toBeGreaterThanOrEqual(15);
  });

  it("is null when the page does not name the institution at all", () => {
    expect(
      quoteFor("Windesheim", "A page about something else entirely, with no relevant name."),
    ).toBeNull();
  });

  it("skips generic words so a page that only says 'Hogeschool' does not count", () => {
    expect(
      quoteFor(
        "Hogeschool Utrecht",
        "Een hogeschool is een instelling voor hoger onderwijs in Nederland.",
      ),
    ).toBeNull();
  });
});
