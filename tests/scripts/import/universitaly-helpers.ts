import type { PortalCourse } from "../../../scripts/import/sources/universitaly";

// A valid portal course (shape verified against the live endpoint on 2026-10-08).
export function course(over: Partial<PortalCourse> = {}): PortalCourse {
  return {
    id: 1,
    anno: { descrizione: "2026/2027" },
    codeUn: "02",
    nomeCorso: "Computer Science",
    nomeCorsoEn: "Computer Science",
    url: "https://www.uniba.test/it/corsi/computer-science",
    modalitaDidattica: { descrizione: "In presenza" },
    modalitaErogazione: { codice: "C" },
    durataAnni: 3,
    lingua: "EN",
    nomeStruttura: "Università degli Studi di BARI ALDO MORO",
    tipoLaurea: { descrizione: "Triennale" },
    classe: { codice: "L-31  " },
    classeInterclasse: null,
    interateneo: null,
    ...over,
  };
}

export function page(
  courses: PortalCourse[],
  totalResults = courses.length,
  totalPages = 1,
  currentPage = "1",
): unknown {
  return {
    universita: { totalResults, totalPages, currentPage, corsi: courses },
    afam: [],
    equipollenti: [],
  };
}
