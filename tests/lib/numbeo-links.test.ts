import { describe, expect, it } from "vitest";

import { numbeoLinkFor, numbeoLinkView } from "@/lib/numbeo-links";

describe("numbeoLinkFor", () => {
  it.each([
    ["FR", "France"],
    ["DE", "Germany"],
    ["NL", "Netherlands"],
    ["IT", "Italy"],
    ["HU", "Hungary"],
    ["ES", "Spain"],
  ])("links the country page of %s when the city is not verified", (country, name) => {
    expect(numbeoLinkFor(country, "xx-unverified")).toEqual({
      url: `https://www.numbeo.com/cost-of-living/country_result.jsp?country=${name}`,
      kind: "country",
    });
  });

  it("falls back to the country page for an ES city with no verified page", () => {
    expect(numbeoLinkFor("ES", "any-unverified-city")).toEqual({
      url: "https://www.numbeo.com/cost-of-living/country_result.jsp?country=Spain",
      kind: "country",
    });
  });

  it.each([
    ["DE", "berlin", "https://www.numbeo.com/cost-of-living/in/Berlin"],
    ["DE", "aalen", "https://www.numbeo.com/cost-of-living/in/Aalen-Germany"],
    ["FR", "paris", "https://www.numbeo.com/cost-of-living/in/Paris"],
    ["FR", "agen", "https://www.numbeo.com/cost-of-living/in/Agen-France"],
    ["HU", "bekescsaba", "https://www.numbeo.com/cost-of-living/in/B%C3%A9k%C3%A9scsaba-Hungary"],
    ["IT", "bologna", "https://www.numbeo.com/cost-of-living/in/Bologna"],
    ["NL", "amsterdam", "https://www.numbeo.com/cost-of-living/in/Amsterdam"],
  ])("links the verified city page of %s/%s", (country, slug, url) => {
    expect(numbeoLinkFor(country, slug)).toEqual({ url, kind: "city" });
  });

  it("does not use a city verified in one country for another", () => {
    expect(numbeoLinkFor("FR", "berlin")?.kind).toBe("country");
  });

  it("returns null for a country it does not know", () => {
    expect(numbeoLinkFor("XX", "berlin")).toBeNull();
    expect(numbeoLinkFor("", "")).toBeNull();
  });

  it("never reads an inherited property of the tables as a country or a city", () => {
    expect(numbeoLinkFor("constructor", "berlin")).toBeNull();
    expect(numbeoLinkFor("toString", "x")).toBeNull();
    expect(numbeoLinkFor("__proto__", "x")).toBeNull();
    expect(numbeoLinkFor("DE", "x")?.kind).toBe("country");
    expect(numbeoLinkFor("DE", "constructor")?.kind).toBe("country");
  });

  it("only builds https urls on numbeo.com", () => {
    for (const [country, slug] of [
      ["DE", "duisburg"],
      ["HU", "budapest"],
      ["NL", "nowhere"],
    ] as const) {
      const link = numbeoLinkFor(country, slug);
      expect(link?.url).toMatch(/^https:\/\/www\.numbeo\.com\/cost-of-living\//);
    }
  });
});

describe("numbeoLinkView", () => {
  it("names the city for a city page", () => {
    expect(numbeoLinkView("DE", "aachen", "Aachen", "fr")).toEqual({
      href: "https://www.numbeo.com/cost-of-living/in/Aachen",
      kind: "city",
      place: "Aachen",
    });
  });

  it.each([
    ["fr", "Allemagne"],
    ["en", "Germany"],
    ["ar", "ألمانيا"],
  ] as const)("names the country in %s for a country page", (locale, name) => {
    const view = numbeoLinkView("DE", "xx-unverified", "Somewhere", locale);
    expect(view?.kind).toBe("country");
    expect(view?.place).toBe(name);
  });

  it("returns null for an unknown country", () => {
    expect(numbeoLinkView("XX", "x", "X", "en")).toBeNull();
  });
});
