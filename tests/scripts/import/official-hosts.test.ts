import { describe, expect, it } from "vitest";

import { currencyNextTo, isOfficialHost } from "../../../scripts/import/scholarships";

describe("isOfficialHost: immigration, health and tax pages of the destination countries", () => {
  it.each([
    "https://ind.nl/en/residence-permits/study",
    "https://www.ind.nl/en/fees",
    "https://www.studyinnl.org/finances/cost-of-living",
    "https://www.ameli.fr/assure/droits-demarches/europe-etranger/etudiant",
    "https://assure.ameli.fr/x",
    "https://www.belastingdienst.nl/wps/wcm/connect/en/zorgtoeslag",
    "https://www.poliziadistato.it/articolo/permesso-di-soggiorno",
    "https://www.esteri.it/en/servizi-consolari-e-visti/visti",
    "https://www.universitaly.it/index.php/public/cost",
    "https://www.xn--bafg-7qa.de/bafoeg/de/home",
    "https://www.bafög.de/de/index.html",
    "https://www.etudiant.gouv.fr/fr/la-cvec",
    "https://www.governo.gov.it/it/x",
    "https://www.gov.it/x",
    "https://www.kormany.gov.hu/x",
    "https://gov.hu/x",
  ])("accepts %s", (url) => {
    expect(isOfficialHost(url)).toBe(true);
  });

  it.each([
    "https://evilgouv.fr/x",
    "https://gouv.fr.evil.com/x",
    "https://notind.nl/x",
    "https://ind.nl.evil.com/x",
    "https://user@ind.nl@evil.com/",
    "https://evil.com/ind.nl",
    "https://evil.com/?u=ameli.fr",
    "https://notameli.fr/x",
    "https://studyinnl.org.evil.com/x",
    "https://fakebelastingdienst.nl/x",
    "https://poliziadistato.it.evil.com/x",
    "https://evilesteri.it/x",
    "https://myuniversitaly.it/x",
    "https://evil-xn--bafg-7qa.de/x",
    "https://evilgov.it/x",
    "https://gov.it.evil.com/x",
    "https://evilgov.hu/x",
    "https://gov.hu.evil.com/x",
    "not a url",
  ])("refuses %s", (url) => {
    expect(isOfficialHost(url)).toBe(false);
  });
});

describe("currencyNextTo: forint", () => {
  const find = (quote: string, number: string): [number, number] => {
    const start = quote.indexOf(number);
    return [start, start + number.length];
  };

  it("recognises Ft after the number", () => {
    const quote = "A havi díj 12 000 Ft.";
    expect(currencyNextTo("HUF", quote, ...find(quote, "12 000"))).toBe(true);
  });

  it("recognises Ft before the number", () => {
    const quote = "Ft 12000 per month";
    expect(currencyNextTo("HUF", quote, ...find(quote, "12000"))).toBe(true);
  });

  it("is case-insensitive and still accepts the code", () => {
    const code = "12000 HUF";
    expect(currencyNextTo("HUF", "12000 ft", ...find("12000 ft", "12000"))).toBe(true);
    expect(currencyNextTo("HUF", code, ...find(code, "12000"))).toBe(true);
  });

  it("does not take a longer word that starts with Ft, or another currency, for forints", () => {
    const longer = "12000 Ftx";
    const euro = "12000 EUR";
    expect(currencyNextTo("HUF", longer, ...find(longer, "12000"))).toBe(false);
    expect(currencyNextTo("HUF", euro, ...find(euro, "12000"))).toBe(false);
  });

  it("leaves other currencies as they were", () => {
    const quote = "12000 Ft";
    expect(currencyNextTo("EUR", quote, ...find(quote, "12000"))).toBe(false);
    expect(currencyNextTo("EUR", "€ 12000", ...find("€ 12000", "12000"))).toBe(true);
    expect(currencyNextTo("MAD", "12000 dh", ...find("12000 dh", "12000"))).toBe(true);
  });
});
