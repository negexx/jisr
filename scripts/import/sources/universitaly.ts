import { z } from "zod";

import { collapseSpaces } from "../text";
import { fieldOfClass } from "./mur";

// Universitaly (universitaly.it, Ministero dell'Universita e della Ricerca / CINECA): the public
// search of the university offer. The response shape was checked on 2026-10-08; anything else
// makes the importer stop (see universitaly-fetch.ts).
const Named = z.object({ descrizione: z.string() });
const ClassRef = z.object({ codice: z.string() });

export const PortalCourseSchema = z.object({
  id: z.number().int(),
  anno: Named,
  codeUn: z.string(),
  nomeCorso: z.string(),
  nomeCorsoEn: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  modalitaDidattica: Named,
  modalitaErogazione: z.object({ codice: z.string() }),
  durataAnni: z.number().nullable().optional(),
  lingua: z.string(),
  nomeStruttura: z.string(),
  tipoLaurea: Named,
  classe: ClassRef.nullable().optional(),
  classeInterclasse: ClassRef.nullable().optional(),
  interateneo: z.unknown().optional(),
});
export type PortalCourse = z.infer<typeof PortalCourseSchema>;

export const PortalPageSchema = z.object({
  universita: z.object({
    totalResults: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
    currentPage: z.union([z.string(), z.number()]),
    corsi: z.array(PortalCourseSchema),
  }),
});
export type PortalPage = z.infer<typeof PortalPageSchema>;

export type ExclusionReason =
  | "not-bachelor"
  | "not-english"
  | "class-out-of-scope"
  | "mixed-language"
  | "not-in-person";
export type Status = "candidate" | ExclusionReason;

export type Classified = {
  course: PortalCourse;
  status: Status;
  classCodes: string[];
  classCode: string | null;
  field: string | null;
  confidence: "high" | "low" | null;
};

export type Candidate = {
  portalId: number;
  university: string;
  name: string;
  classCode: string;
  classCodes: string[];
  field: string;
  confidence: "high" | "low";
  durationYears: number | null;
  url: string | null;
  academicYear: string;
};

// The portal pads class codes ("L-34  "); the interclass is a second class of the same course.
export function classCodesOf(course: PortalCourse): string[] {
  return [course.classe, course.classeInterclasse]
    .map((ref) => (ref === null || ref === undefined ? "" : collapseSpaces(ref.codice)))
    .filter((code) => code !== "");
}

export function courseName(course: PortalCourse): string {
  return collapseSpaces(course.nomeCorsoEn ?? course.nomeCorso);
}

// One course, one status. The order makes the counts meaningful: mixed-language and not-in-person
// are only counted for courses that are otherwise in scope (a Bachelor course of one of the classes).
export function classify(course: PortalCourse): Classified {
  const classCodes = classCodesOf(course);
  const base = { course, classCodes, classCode: null, field: null, confidence: null } as const;
  if (course.tipoLaurea.descrizione !== "Triennale") return { ...base, status: "not-bachelor" };
  if (course.lingua !== "EN" && course.lingua !== "mu") return { ...base, status: "not-english" };
  const name = courseName(course);
  const code = classCodes.find((c) => fieldOfClass(c, name) !== null);
  const match = code === undefined ? null : fieldOfClass(code, name);
  if (code === undefined || match === null) return { ...base, status: "class-out-of-scope" };
  const scoped = {
    course,
    classCodes,
    classCode: code,
    field: match.field,
    confidence: match.confidence,
  };
  if (course.lingua === "mu") return { ...scoped, status: "mixed-language" };
  const inPerson =
    course.modalitaDidattica.descrizione === "In presenza" &&
    course.modalitaErogazione.codice === "C";
  return { ...scoped, status: inPerson ? "candidate" : "not-in-person" };
}

export function toCandidate(classified: Classified): Candidate {
  const { course, classCode, field, confidence } = classified;
  if (
    classified.status !== "candidate" ||
    classCode === null ||
    field === null ||
    confidence === null
  ) {
    throw new Error(`course ${course.id} is not a candidate (${classified.status})`);
  }
  return {
    portalId: course.id,
    university: collapseSpaces(course.nomeStruttura),
    name: courseName(course),
    classCode,
    classCodes: classified.classCodes,
    field,
    confidence,
    durationYears: course.durataAnni ?? null,
    url:
      course.url === undefined || course.url === null || course.url.trim() === ""
        ? null
        : course.url.trim(),
    academicYear: course.anno.descrizione,
  };
}
