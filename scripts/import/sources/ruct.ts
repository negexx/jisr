import { decodeEntities } from "../evidence";
import { collapseSpaces } from "../text";

// RUCT (Registro de Universidades, Centros y Títulos, educacion.gob.es/ruct, ISO-8859-15): the
// Spanish register of universities and the degrees they are authorised to teach. The university
// list is one HTML table (Código | Universidad | Centros | Títulos) and it mixes real universities
// with administrative categories ("Centros autorizados…", "Centros dependientes del Ministerio de
// Defensa", "Centros extranjeros autorizados…") that carry no programme of their own. The parser
// returns every row; the caller keeps the ones isUniversityName accepts.
export type RuctUniversity = { code: string; name: string };

const TABLE = /<table[^>]*\bid="universidad"[^>]*>([\s\S]*?)<\/table>/i;
const ROW = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
const CELL = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;

const cellText = (html: string): string =>
  collapseSpaces(decodeEntities(html.replace(/<[^>]*>/g, " ")));

// The code sits in its own cell ("099&nbsp;") and the name in the anchor text ("Ense&ntilde;anzas"):
// both carry entities and are decoded before trimming.
export function parseRuctUniversities(html: string): RuctUniversity[] {
  const table = TABLE.exec(html)?.[1];
  if (table === undefined)
    throw new Error("RUCT: the universities table is missing: the page changed");
  const universities: RuctUniversity[] = [];
  let headerSeen = false;
  for (const row of table.matchAll(ROW)) {
    const cells = [...(row[1] ?? "").matchAll(CELL)].map((m) => cellText(m[1] ?? ""));
    if (cells.length < 4) continue;
    if (cells[0] === "Código" && cells[1] === "Universidad") {
      headerSeen = true;
      continue;
    }
    universities.push({ code: cells[0] ?? "", name: cells[1] ?? "" });
  }
  if (!headerSeen)
    throw new Error("RUCT: the universities table header is missing: the page changed");
  return universities;
}

// The register lists administrative categories alongside universities: every "Centros …" row is a
// group of centres (art, defence, foreign centres authorised by a region), not a university.
export function isUniversityName(name: string): boolean {
  return !name.startsWith("Centros ");
}
