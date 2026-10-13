import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import type { RuctDegree, RuctTitle, RuctUniversity } from "../../../scripts/import/sources/ruct";
import {
  buildSpainRecords,
  fieldOfCampo,
  isUniversityName,
  nextRuctPageUrl,
  parseRuctDegree,
  parseRuctTitles,
  parseRuctUniversities,
  parseRuctUniversityDetail,
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

const ade = parseRuctDegree(fixture("degree-2504059.html"));

describe("parseRuctDegree", () => {
  it("reads the title name, level, rama, campo and centres of a Grado", () => {
    expect(ade).toEqual({
      code: "2504059",
      name: "Graduado o Graduada en Administración y Dirección de Empresas por la CUNEF Universidad",
      nivel: "Grado - RD 822/2021 (2)",
      rama: "Ciencias Sociales y Jurídicas",
      campo:
        "Ciencias económicas, administración y dirección de empresas, márquetin, comercio, contabilidad y turismo",
      centres: ["Facultad de Empresa, Economía y Derecho"],
    });
  });

  it("leaves campo null when the page omits it (an RD 1393/2007 degree)", () => {
    const degree = parseRuctDegree(fixture("degree-2504068.html"));
    expect(degree).toEqual({
      code: "2504068",
      name: "Graduado o Graduada en Ingeniería Informática por la CUNEF Universidad",
      nivel: "Grado - RD 1393/2007 (1)",
      rama: "Ingeniería y Arquitectura",
      campo: null,
      centres: ["Escuela Politécnica Superior"],
    });
  });

  it("returns null for a field the page omits and [] when it lists no centre", () => {
    const html = [
      "<h2><strong>Graduado o Graduada en Ejemplo</strong></h2>",
      '<span id="estudio_codigoEstudio">2500000</span>',
      '<span id="estudio_descripcionTipo">Grado - RD 822/2021 (2)</span>',
    ].join("");
    expect(parseRuctDegree(html)).toEqual({
      code: "2500000",
      name: "Graduado o Graduada en Ejemplo",
      nivel: "Grado - RD 822/2021 (2)",
      rama: null,
      campo: null,
      centres: [],
    });
  });

  it("throws when the degree title and description are missing: the page changed shape", () => {
    expect(() => parseRuctDegree("<html><body>no degree here</body></html>")).toThrow(/RUCT/);
  });

  it("throws when the centres table exists but its header is unrecognised: the page changed shape", () => {
    const html = [
      "<h2><strong>Graduado o Graduada en Ejemplo</strong></h2>",
      '<span id="estudio_codigoEstudio">2500000</span>',
      '<span id="estudio_descripcionTipo">Grado - RD 822/2021 (2)</span>',
      '<table id="centro"><thead><tr><th>University</th><th>Centre code</th><th>Centre</th></tr></thead>',
      "<tbody><tr><td>CUNEF Universidad</td><td>28054956</td><td>Escuela Politécnica Superior</td></tr></tbody></table>",
    ].join("");
    expect(() => parseRuctDegree(html)).toThrow(/RUCT/);
  });
});

describe("fieldOfCampo", () => {
  it("maps each Release-1 campo to its field at high confidence", () => {
    const cases: [string, string, { field: string; confidence: string }][] = [
      [
        "Ingeniería informática y de sistemas",
        "Graduado o Graduada en Inteligencia Artificial / Bachelor in Artificial Intelligence por la CUNEF Universidad",
        { field: "computer-science", confidence: "high" },
      ],
      [
        "Ingeniería industrial, ingeniería mecánica, ingeniería automática, ingeniería de la organización industrial e ingeniería de la navegación",
        "Graduado o Graduada en Ingeniería Mecánica por la Universidad de Zaragoza",
        { field: "engineering", confidence: "high" },
      ],
      [
        "Ciencias económicas, administración y dirección de empresas, márquetin, comercio, contabilidad y turismo",
        "Graduado o Graduada en Administración y Dirección de Empresas por la CUNEF Universidad",
        { field: "business-economics", confidence: "high" },
      ],
    ];
    for (const [campo, name, expected] of cases) {
      expect(fieldOfCampo(campo, name)).toEqual(expected);
    }
  });

  it("returns null for a campo outside the three Release-1 fields", () => {
    for (const campo of [
      "Ciencias de la Salud",
      "Historia del arte y de la expresión artística, y bellas artes",
      "Matemáticas y estadística",
      "Derecho y especialidades jurídicas",
      "Ciencias sociales, trabajo social, relaciones laborales y recursos humanos, sociología, ciencia política y relaciones internacionales",
      null,
    ]) {
      expect(fieldOfCampo(campo, "Graduado o Graduada en Derecho")).toBeNull();
    }
  });

  it("drops confidence to low when the title name points to another field", () => {
    expect(
      fieldOfCampo(
        "Ciencias económicas, administración y dirección de empresas, márquetin, comercio, contabilidad y turismo",
        "Bachelor in Computer Science",
      ),
    ).toEqual({ field: "business-economics", confidence: "low" });
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

describe("nextRuctPageUrl", () => {
  it("resolves the Siguiente link against the current page and decodes &amp;", () => {
    const html =
      '<a href="/ruct/listauniversidades;jsessionid=ABC?actual=universidades&amp;d-8320336-p=2">Siguiente</a>';
    expect(
      nextRuctPageUrl(
        html,
        "https://www.educacion.gob.es/ruct/listauniversidades.action?actual=universidades",
      ),
    ).toBe(
      "https://www.educacion.gob.es/ruct/listauniversidades;jsessionid=ABC?actual=universidades&d-8320336-p=2",
    );
  });

  it("returns null when the page has no Siguiente link (the last page)", () => {
    expect(nextRuctPageUrl("<html></html>", "https://x/a")).toBeNull();
  });
});

describe("parseRuctUniversityDetail", () => {
  it("reads the public/private indicator and the town from the register page", () => {
    const html = [
      '<label for="tipo_univ"><span class="label">Tipo :</span><span>P&uacute;blica</span></label>',
      '<label for="dloc"><span class="label">Localidad :</span><span>San Vicente del Raspeig/Sant Vicent del Raspeig</span></label>',
    ].join("");
    expect(parseRuctUniversityDetail(html)).toEqual({
      type: "public",
      city: "San Vicente del Raspeig/Sant Vicent del Raspeig",
    });
  });

  it("reads a private university and falls back to the municipio for the town", () => {
    const html = [
      '<label for="tipo_univ"><span class="label">Tipo :</span><span>Privada</span></label>',
      '<label for="dmunic"><span class="label">Municipio :</span><span>Madrid</span></label>',
    ].join("");
    expect(parseRuctUniversityDetail(html)).toEqual({ type: "private", city: "Madrid" });
  });

  it("reads a private university whose status carries a parenthetical", () => {
    const html =
      '<label for="tipo_univ"><span class="label">Tipo :</span><span>Privada (de la Iglesia Cat&oacute;lica)</span></label>';
    expect(parseRuctUniversityDetail(html)).toEqual({ type: "private", city: null });
  });

  it("returns nulls when the register states neither status nor town", () => {
    expect(parseRuctUniversityDetail("<html><body>no labels here</body></html>")).toEqual({
      type: null,
      city: null,
    });
  });
});

describe("buildSpainRecords", () => {
  const university: RuctUniversity = {
    code: "001",
    name: "Universidad de Alicante",
    type: "public",
    city: "San Vicente del Raspeig",
  };
  const grado = (code: string, campo: string | null): RuctDegree => ({
    code,
    name: `Graduado o Graduada en Ejemplo ${code} por la Universidad de Alicante`,
    nivel: "Grado - RD 822/2021 (2)",
    rama: "Ingeniería y Arquitectura",
    campo,
    centres: ["Escuela Politécnica Superior"],
  });
  const titles: RuctTitle[] = [
    {
      code: "2500001",
      name: "Graduado o Graduada en Ingeniería Informática por la Universidad de Alicante",
      level: "Grado - RD 822/2021 (2)",
    },
    {
      code: "2500002",
      name: "Máster en Ingeniería Informática por la Universidad de Alicante",
      level: "Máster - RD 822/2021",
    },
    {
      code: "2500003",
      name: "Graduado o Graduada en Derecho por la Universidad de Alicante",
      level: "Grado - RD 822/2021 (2)",
    },
  ];
  const degrees = new Map<string, RuctDegree>([
    ["2500001", grado("2500001", "Ingeniería informática y de sistemas")],
    ["2500002", grado("2500002", "Ingeniería informática y de sistemas")],
    ["2500003", grado("2500003", "Derecho y especialidades jurídicas")],
  ]);

  const records = buildSpainRecords({ university, titles, degrees });
  const institutions = records.filter((r) => r.collection === "institutions");
  const programmes = records.filter((r) => r.collection === "programs");

  it("stages the university under es-<slug(name)> with a stable source id", () => {
    expect(institutions).toHaveLength(1);
    expect(institutions[0]?.id).toBe("es-universidad-de-alicante");
    expect(institutions[0]?.sourceId).toBe("ruct:001");
    expect(institutions[0]?.data).toMatchObject({
      slug: "es-universidad-de-alicante",
      name: "Universidad de Alicante",
      country: "ES",
      type: "public",
      info_kind: "TODO_read_source",
    });
  });

  it("keeps only Grado titles whose campo maps to a Release-1 field", () => {
    expect(programmes).toHaveLength(1);
    const [programme] = programmes;
    expect(programme?.data.field).toBe("computer-science");
    expect(programme?.sourceId).toBe("ruct:001:2500001");
    expect(programme?.data.institution).toBe("es-universidad-de-alicante");
    expect(programme?.data.country).toBe("ES");
    expect(programme?.data.level).toBe("bachelor");
  });

  it("leaves every unread fact to be read, with the placeholder and no official URL", () => {
    const [programme] = programmes;
    for (const key of [
      "durationYears",
      "teachingLanguages",
      "tuition",
      "intakes",
      "applicationChannel",
      "documents",
    ]) {
      expect(programme?.data[key]).toMatchObject({ value: null, info_kind: "TODO_read_source" });
    }
    expect(programme?.data.officialUrl).toBeNull();
    expect(programme?.data.requirements).toMatchObject({
      coverage: "partial",
      source: "ruct",
      info_kind: "TODO_read_source",
      rules: [],
    });
  });

  it("leaves type null with a review todo when the register states no public/private status", () => {
    const unknown: RuctUniversity = { code: "777", name: "Universidad Sin Estado", city: "Madrid" };
    const staged = buildSpainRecords({
      university: unknown,
      titles: [],
      degrees: new Map(),
    });
    const [institution] = staged.filter((r) => r.collection === "institutions");
    expect(institution?.data.type).toBeNull();
    expect(institution?.review.todo).toMatch(/does not state/i);
  });
});
