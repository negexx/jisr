import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  isUniversityName,
  parseRuctTitles,
  parseRuctUniversities,
} from "../../../scripts/import/sources/ruct";

const FIXTURES = new URL("./fixtures/ruct/", import.meta.url);

// RUCT answers ISO-8859-15: the captured bytes must be decoded before parsing, or every accented
// name ("Enseñanzas") arrives broken.
const fixture = (name: string): string =>
  new TextDecoder("iso-8859-15").decode(readFileSync(new URL(name, FIXTURES)));

const universities = parseRuctUniversities(fixture("universities.html"));

describe("parseRuctUniversities", () => {
  it("reads every row of the register table, administrative categories included", () => {
    expect(universities).toHaveLength(10);
  });

  it("trims the code cell and decodes the accented name", () => {
    expect(universities.slice(0, 3)).toEqual([
      {
        code: "099",
        name: "Centros autorizados para impartir Enseñanzas Artísticas Superiores",
      },
      { code: "086", name: "Centros dependientes del Ministerio de Defensa" },
      {
        code: "105",
        name: "Centros extranjeros autorizados por la Comunidad Autónoma de Aragón",
      },
    ]);
  });

  it("returns the real university rows too", () => {
    expect(universities).toContainEqual({ code: "089", name: "CUNEF Universidad" });
    expect(universities.at(-1)).toEqual({ code: "089", name: "CUNEF Universidad" });
  });

  it("decodes &amp;, &nbsp; and named accents in a row", () => {
    const html = [
      '<table id="universidad"><tr><th>Código</th><th>Universidad</th><th>Centros</th><th>Títulos</th></tr>',
      '<tr><td>001&nbsp;</td><td><a href="/ruct/universidad.action?codigoUniversidad=001&amp;actual=universidades">Universidad de A&amp;B&nbsp;ñ</a></td><td>x</td><td>y</td></tr>',
      "</table>",
    ].join("");
    expect(parseRuctUniversities(html)).toEqual([{ code: "001", name: "Universidad de A&B ñ" }]);
  });

  it("throws when the register table is missing: the page changed shape", () => {
    expect(() => parseRuctUniversities("<html><body>no table here</body></html>")).toThrow(/RUCT/);
  });
});

const titles = parseRuctTitles(fixture("titles-089.html"));

describe("parseRuctTitles", () => {
  it("reads every row of the university's title table", () => {
    expect(titles).toHaveLength(10);
  });

  it("trims the code cell and decodes the accented title and level", () => {
    expect(titles.slice(0, 3)).toEqual([
      {
        code: "2504059",
        name: "Graduado o Graduada en Administración y Dirección de Empresas por la CUNEF Universidad",
        level: "Grado - RD 822/2021 (2)",
      },
      {
        code: "2504639",
        name: "Graduado o Graduada en Ciencia de Datos / Bachelor in Data Science por la CUNEF Universidad",
        level: "Grado - RD 822/2021 (2)",
      },
      {
        code: "2504126",
        name: "Graduado o Graduada en Derecho por la CUNEF Universidad",
        level: "Grado - RD 822/2021 (2)",
      },
    ]);
  });

  it("returns the last title row and its Grado level", () => {
    expect(titles.at(-1)).toEqual({
      code: "2504640",
      name: "Graduado o Graduada en Inteligencia Artificial / Bachelor in Artificial Intelligence por la CUNEF Universidad",
      level: "Grado - RD 822/2021 (2)",
    });
  });

  it("gives a Grado row a level that starts with Grado", () => {
    expect(titles[0]?.level.startsWith("Grado")).toBe(true);
  });

  it("returns a non-Grado row as-is, leaving filtering to the caller", () => {
    const html = [
      '<table id="estudio"><tr><th>Código</th><th>Título</th><th>Nivel académico</th><th>Estado</th><th></th></tr>',
      '<tr><td>2509999&nbsp;</td><td><a href="/ruct/estudiouniversidad.action?codigoEstudio=2509999">M&aacute;ster en Ingenier&iacute;a Inform&aacute;tica</a>&nbsp;</td><td>M&aacute;ster - RD 822/2021&nbsp;</td><td>Publicado en B.O.E.</td><td></td></tr>',
      "</table>",
    ].join("");
    expect(parseRuctTitles(html)).toEqual([
      { code: "2509999", name: "Máster en Ingeniería Informática", level: "Máster - RD 822/2021" },
    ]);
  });

  it("throws when the title table is missing: the page changed shape", () => {
    expect(() => parseRuctTitles("<html><body>no table here</body></html>")).toThrow(/RUCT/);
  });
});

describe("isUniversityName", () => {
  it("rejects the administrative categories", () => {
    for (const name of [
      "Centros autorizados para impartir Enseñanzas Artísticas Superiores",
      "Centros dependientes del Ministerio de Defensa",
      "Centros extranjeros autorizados por la Comunidad de Madrid",
    ]) {
      expect(isUniversityName(name)).toBe(false);
    }
  });

  it("accepts a real university name", () => {
    expect(isUniversityName("CUNEF Universidad")).toBe(true);
    expect(isUniversityName("Universidad de Zaragoza")).toBe(true);
  });
});
