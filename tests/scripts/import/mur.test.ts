import { describe, expect, it } from "vitest";

import {
  buildItalyRecords,
  fieldOfClass,
  parseAtenei,
  parseMurOffer,
} from "../../../scripts/import/sources/mur";

const OFFER_HEADER =
  "ANNO;Ateneo;Area;GruppoDisciplinare;TipoCorso;Classe;NomeClasse;Corso;SedeCorso_Provincia;SedeCorso_Comune;ACCESSO;DIDATTICA;LINGUA";

type Row = {
  year?: number;
  ateneo?: string;
  type?: string;
  cls?: string;
  className?: string;
  name?: string;
  city?: string;
  access?: string;
  mode?: string;
  language?: string;
};

const row = (r: Row = {}): string =>
  [
    r.year ?? 2025,
    r.ateneo ?? "Bologna",
    "Economica",
    "Economia",
    r.type ?? "Laurea",
    r.cls ?? "L-18",
    r.className ?? "Scienze dell'economia e della gestione aziendale",
    r.name ?? "Business and Economics",
    "Bologna",
    r.city ?? "BOLOGNA",
    r.access ?? "locale",
    r.mode ?? "Convenzionale",
    r.language ?? "Inglese",
  ].join(";");

const offer = (...rows: string[]): string => [OFFER_HEADER, ...rows].join("\r\n");

const ATENEI_HEADER =
  "﻿COD_Ateneo;NomeEsteso;NomeOperativo;Status;Descrizione;StataleLibera;Indirizzo;CITTA;PROVINCIA;REGIONE;NOME_REGIONE_MACRO";
const ATENEI = [
  ATENEI_HEADER,
  "03701;Alma Mater Studiorum - Università di Bologna;Bologna;A;Università;S;Via Zamboni, 33;BOLOGNA;BOLOGNA;EMILIA-ROMAGNA;NORD-EST",
  '04201;"Università commerciale ""Luigi Bocconi"" di Milano";Milano Bocconi;A;Università;L;Via Sarfatti, 25;MILANO;MILANO;LOMBARDIA;NORD-OVEST',
  "05801;Politecnico di Torino;Torino Politecnico;A;Politecnico;S;Corso Duca degli Abruzzi, 24;TORINO;TORINO;PIEMONTE;NORD-OVEST",
  "05601;Università degli studi di Perugia;Perugia;A;Università;S;Piazza Università, 1;PERUGIA;PERUGIA;UMBRIA;CENTRO",
].join("\r\n");

const atenei = parseAtenei(ATENEI);

describe("parseMurOffer", () => {
  it("reads the semicolon file by column name", () => {
    const [first] = parseMurOffer(offer(row({ name: "Forlì, Economics", city: "FORLÌ" })));
    expect(first).toMatchObject({
      year: 2025,
      ateneo: "Bologna",
      type: "Laurea",
      classCode: "L-18",
      name: "Forlì, Economics",
      city: "FORLÌ",
      access: "locale",
      mode: "Convenzionale",
      language: "Inglese",
    });
  });

  it("throws on a missing column: the file changed shape", () => {
    expect(() => parseMurOffer("ANNO;Ateneo\r\n2025;Bologna")).toThrow(/LINGUA|Classe|Corso/);
  });
});

describe("parseAtenei", () => {
  it("strips the BOM and reads state or free, town and region", () => {
    expect(atenei).toHaveLength(4);
    expect(atenei[0]).toEqual({
      code: "03701",
      fullName: "Alma Mater Studiorum - Università di Bologna",
      shortName: "Bologna",
      statale: true,
      city: "BOLOGNA",
      region: "EMILIA-ROMAGNA",
    });
    expect(atenei[1]).toMatchObject({
      fullName: 'Università commerciale "Luigi Bocconi" di Milano',
      statale: false,
    });
  });
});

describe("fieldOfClass", () => {
  it("decides the field from the degree class", () => {
    expect(fieldOfClass("L-31", "Applied Computer Science")).toEqual({
      field: "computer-science",
      confidence: "high",
    });
    for (const cls of ["L-8", "L-9", "L-7", "L-23"])
      expect(fieldOfClass(cls, "Civil Engineering")).toEqual({
        field: "engineering",
        confidence: "high",
      });
    for (const cls of ["L-18", "L-33"])
      expect(fieldOfClass(cls, "Economics and Finance")).toEqual({
        field: "business-economics",
        confidence: "high",
      });
  });

  it("is low when the name points to another field, and for statistics", () => {
    expect(fieldOfClass("L-8", "Computer Science and Engineering")?.confidence).toBe("low");
    expect(fieldOfClass("L-33", "Economics, Management and Computer Science")?.confidence).toBe(
      "low",
    );
    expect(fieldOfClass("L-41", "Data Analytics")).toEqual({
      field: "business-economics",
      confidence: "low",
    });
  });

  it("is null for a class outside the three fields", () => {
    expect(fieldOfClass("L-2", "Biotechnology")).toBeNull();
    expect(fieldOfClass("L-1", "Cultural Heritage")).toBeNull();
    expect(fieldOfClass("L-P03", "Professioni tecniche")).toBeNull();
  });
});

describe("buildItalyRecords", () => {
  const build = (...rows: string[]) => buildItalyRecords(parseMurOffer(offer(...rows)), atenei);
  const programmes = (records: ReturnType<typeof build>["records"]) =>
    records.filter((r) => r.collection === "programs");
  const institutions = (records: ReturnType<typeof build>["records"]) =>
    records.filter((r) => r.collection === "institutions");

  it("stages an English-taught Bachelor programme and its institution unit", () => {
    const { records } = build(row());
    const [inst] = institutions(records);
    const [prog] = programmes(records);
    expect(inst?.id).toBe("it-bologna-bologna");
    expect(inst?.data).toMatchObject({
      slug: "it-bologna-bologna",
      name: "Alma Mater Studiorum - Università di Bologna",
      country: "IT",
      type: "public",
      website: null,
    });
    expect(inst?.sourceId).toBe("mur-institution:03701@bologna");
    expect(prog?.id).toBe("it-bologna-bologna-business-and-economics-l18");
    expect(prog?.sourceId).toBe("mur:03701:l18:business-and-economics@bologna");
    expect(prog?.data).toMatchObject({
      institution: "it-bologna-bologna",
      country: "IT",
      city: "bologna",
      field: "business-economics",
      level: "bachelor",
      name: "Business and Economics",
      officialUrl: null,
    });
    expect(prog?.data.sources).toEqual({
      mur: {
        url: "https://dati-ustat.mur.gov.it/dataset/bed0c71e-9f86-4a0f-a266-963b6f7bbbd2",
        last_verified_at: null,
      },
    });
  });

  it("leaves every fact the file does not state to be read, with the placeholder", () => {
    const [prog] = programmes(build(row()).records);
    for (const key of ["tuition", "intakes", "applicationChannel", "documents", "durationYears"]) {
      expect(prog?.data[key]).toMatchObject({ value: null, info_kind: "TODO_read_source" });
    }
    expect(prog?.data.teachingLanguages).toMatchObject({
      value: ["en"],
      info_kind: "TODO_read_source",
    });
  });

  it("takes the institution type from state or free, and the town from the course", () => {
    const { records } = build(
      row({ ateneo: "Milano Bocconi", name: "Economics", city: "MILANO", cls: "L-33" }),
      row({ name: "Economics of Tourism and Cities", city: "RIMINI", cls: "L-33" }),
    );
    const slugs = institutions(records).map((r) => r.id);
    expect(slugs).toEqual(["it-milano-bocconi-milano", "it-bologna-rimini"]);
    const rimini = institutions(records).find((r) => r.id === "it-bologna-rimini");
    expect(rimini?.data.city).toEqual({ slug: "rimini", name: "Rimini" });
    expect(institutions(records)[0]?.data.type).toBe("private");
  });

  it("merges an interclass programme (two classes, one course) into one record", () => {
    const { records } = build(
      row({ ateneo: "Perugia", name: "Engineering management", cls: "L-8", city: "PERUGIA" }),
      row({ ateneo: "Perugia", name: "Engineering management", cls: "L-9", city: "PERUGIA" }),
    );
    const progs = programmes(records);
    expect(progs).toHaveLength(1);
    expect(progs[0]?.id).toMatch(/-l8$/);
    expect(progs[0]?.review.todo).toMatch(/L-9/);
  });

  it("keeps the latest year, Laurea only, English only, three fields only", () => {
    const { records, report } = build(
      row(),
      row({ year: 2024, name: "Old year" }),
      row({ type: "Laurea Magistrale", name: "Master" }),
      row({ language: "Italiano", name: "Italian taught" }),
      row({ cls: "L-2", className: "Biotecnologie", name: "Biotech" }),
    );
    expect(programmes(records)).toHaveLength(1);
    expect(report).toMatchObject({
      latestYear: 2025,
      notLaurea: 1,
      notEnglish: 1,
      notInScope: 1,
    });
  });

  it("leaves out distance learning and counts it", () => {
    const { records, report } = build(
      row({ name: "Online degree", mode: "Teledidattica" }),
      row({ name: "Mostly online", mode: "Prevalentemente a distanza" }),
      row({ name: "Mixed mode", mode: "Blended/Modalità Mista" }),
    );
    expect(programmes(records).map((r) => r.data.name)).toEqual(["Mixed mode"]);
    expect(report.distance).toBe(2);
  });

  it("does not stage a mixed Italian-English programme but reports it by name", () => {
    const { records, report } = build(
      row({ language: "Italiano - Inglese", name: "Informatica", cls: "L-31" }),
    );
    expect(programmes(records)).toHaveLength(0);
    expect(report.mixed).toEqual(["Bologna: Informatica (L-31)"]);
  });

  it("skips and counts a university the list does not know, never guessing", () => {
    const { records, report } = build(row({ ateneo: "Atlantis" }));
    expect(records).toHaveLength(0);
    expect(report.noAteneo).toEqual(["Atlantis"]);
  });

  it("notes limited places and the academic year in the review row", () => {
    const [prog] = programmes(build(row({ access: "locale" })).records);
    expect(prog?.review.todo).toMatch(/limited places/i);
    expect(prog?.review.todo).toMatch(/2025\/26/);
    expect(prog?.review.officialUrl).toBe("");
    const [free] = programmes(build(row({ access: "accesso libero" })).records);
    expect(free?.review.todo).not.toMatch(/limited places/i);
  });

  it("makes an all-capitals course name readable", () => {
    const [prog] = programmes(build(row({ name: "DIGITAL ECONOMICS AND BUSINESS" })).records);
    expect(prog?.data.name).toBe("Digital Economics and Business");
  });

  it("is low confidence when the name points to another field", () => {
    const [prog] = programmes(
      build(
        row({ cls: "L-8", className: "Ingegneria dell'informazione", name: "Computer Science" }),
      ).records,
    );
    expect(prog?.data.field).toBe("engineering");
    expect(prog?.review.confidence).toBe("low");
  });

  it("throws when two different universities would get the same unit slug", () => {
    const twin = parseAtenei(
      [
        ATENEI_HEADER,
        "1;Università A;Roma Uno;A;Università;S;;ROMA;ROMA;LAZIO;CENTRO",
        "2;Università B;Roma-Uno;A;Università;S;;ROMA;ROMA;LAZIO;CENTRO",
      ].join("\r\n"),
    );
    expect(() =>
      buildItalyRecords(
        parseMurOffer(
          offer(
            row({ ateneo: "Roma Uno", city: "ROMA" }),
            row({ ateneo: "Roma-Uno", city: "ROMA" }),
          ),
        ),
        twin,
      ),
    ).toThrow(/same slug/);
  });
});
