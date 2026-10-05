import { describe, expect, it } from "vitest";

import { checkLanguages } from "../../../scripts/import/evidence";
import { buildLanguageProposals, murLanguageQuote } from "../../../scripts/import/it-language";
import { parseAtenei, parseMurOffer } from "../../../scripts/import/sources/mur";

const HEADER =
  "ANNO;Ateneo;Area;GruppoDisciplinare;TipoCorso;Classe;NomeClasse;Corso;SedeCorso_Provincia;SedeCorso_Comune;ACCESSO;DIDATTICA;LINGUA";
const row = (over: Partial<Record<string, string>> = {}): string =>
  [
    over.year ?? "2025",
    over.ateneo ?? "Bologna",
    "Economica",
    "Economia",
    over.type ?? "Laurea",
    over.cls ?? "L-18",
    "Scienze dell'economia e della gestione aziendale",
    over.name ?? "Business and Economics",
    over.province ?? "Bologna",
    over.city ?? "BOLOGNA",
    over.access ?? "locale",
    over.mode ?? "Convenzionale",
    over.language ?? "Inglese",
  ].join(";");
const courses = (...rows: string[]) => parseMurOffer([HEADER, ...rows].join("\r\n"));
const atenei = parseAtenei(
  [
    "﻿COD_Ateneo;NomeEsteso;NomeOperativo;Status;Descrizione;StataleLibera;Indirizzo;CITTA;PROVINCIA;REGIONE;NOME_REGIONE_MACRO",
    "03701;Alma Mater Studiorum - Università di Bologna;Bologna;A;Università;S;Via Zamboni, 33;BOLOGNA;BOLOGNA;EMILIA-ROMAGNA;NORD-EST",
  ].join("\r\n"),
);

describe("murLanguageQuote", () => {
  it("is the contiguous stretch of the MUR row from the course name to the language", () => {
    const [c] = courses(row());
    expect(c && murLanguageQuote(c)).toBe(
      "Business and Economics;Bologna;BOLOGNA;locale;Convenzionale;Inglese",
    );
  });

  it("is null for a language other than English only, and for non-ASCII text", () => {
    const [italian] = courses(row({ language: "Italiano" }));
    const [mixed] = courses(row({ language: "Italiano - Inglese" }));
    const [accented] = courses(row({ name: "Economia e gestione dell'impresa Forlì" }));
    expect(italian && murLanguageQuote(italian)).toBeNull();
    expect(mixed && murLanguageQuote(mixed)).toBeNull();
    expect(accented && murLanguageQuote(accented)).toBeNull();
  });
});

describe("the evidence check for the MUR language column", () => {
  const quote = "Business and Economics;Bologna;BOLOGNA;locale;Convenzionale;Inglese";

  it("reads ';Inglese' in the MUR row as English, and nothing looser", () => {
    expect(checkLanguages(["en"], quote).ok).toBe(true);
    expect(
      checkLanguages(["en"], "Business and Economics;Bologna;BOLOGNA;locale;Convenzionale;Italiano")
        .ok,
    ).toBe(false);
    expect(
      checkLanguages(["en"], "È richiesta la lingua inglese livello B2 per l'ammissione").ok,
    ).toBe(false);
    expect(checkLanguages(["it"], quote).ok).toBe(false);
  });
});

describe("buildLanguageProposals", () => {
  const programme = (over: Record<string, unknown> = {}) => ({
    slug: "it-bologna-bologna-business-and-economics-l18",
    institution: "it-bologna-bologna",
    name: "Business and Economics",
    officialUrl: "https://www.unibo.it/en/study/programme/8965",
    hasLanguage: false,
    ...over,
  });
  const build = (programmes: ReturnType<typeof programme>[], ...rows: string[]) =>
    buildLanguageProposals({
      programmes,
      courses: courses(...rows),
      atenei,
      offerUrl: "https://dati-ustat.mur.gov.it/example/offer.csv",
    });

  it("proposes English with the MUR row as the quote and the programme page as the page", () => {
    const { proposals, skipped } = build([programme()], row());
    expect(skipped).toEqual([]);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      slug: "it-bologna-bologna-business-and-economics-l18",
      programmePage: "https://www.unibo.it/en/study/programme/8965",
      facts: {
        teachingLanguages: {
          value: ["en"],
          evidence: [
            {
              url: "https://dati-ustat.mur.gov.it/example/offer.csv",
              quote: "Business and Economics;Bologna;BOLOGNA;locale;Convenzionale;Inglese",
            },
          ],
        },
      },
    });
  });

  it("matches the course name ignoring case (the importer title-cases all-capital names)", () => {
    const { proposals } = build(
      [programme({ name: "Digital Economics and Business", slug: "x" })],
      row({ name: "DIGITAL ECONOMICS AND BUSINESS" }),
    );
    expect(proposals).toHaveLength(1);
  });

  it("leaves a programme that already has a language, and one the MUR does not list as English", () => {
    const has = build([programme({ hasLanguage: true })], row());
    expect(has.proposals).toEqual([]);
    expect(has.skipped).toEqual([]);
    const italian = build([programme()], row({ language: "Italiano" }));
    expect(italian.proposals).toEqual([]);
    expect(italian.skipped[0]?.reason).toMatch(/not listed|no MUR row/i);
  });

  it("skips and says why when the quote would not be plain ASCII or the programme has no page", () => {
    const accented = build([programme({ name: "Forlì" })], row({ name: "Forlì" }));
    expect(accented.proposals).toEqual([]);
    expect(accented.skipped[0]?.reason).toMatch(/ascii/i);
    const noPage = build([programme({ officialUrl: null })], row());
    expect(noPage.proposals).toEqual([]);
    expect(noPage.skipped[0]?.reason).toMatch(/page/i);
  });
});
