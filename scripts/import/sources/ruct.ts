import { decodeEntities } from "../evidence";
import type { FieldMatch, FieldSlug } from "../fields";
import { collapseSpaces } from "../text";
import { classifyDaad } from "./daad";

// RUCT (Registro de Universidades, Centros y Títulos, educacion.gob.es/ruct, ISO-8859-15): the
// Spanish register of universities and the degrees they are authorised to teach. The university
// list is one HTML table (Código | Universidad | Centros | Títulos) and it mixes real universities
// with administrative categories ("Centros autorizados…", "Centros dependientes del Ministerio de
// Defensa", "Centros extranjeros autorizados…") that carry no programme of their own. The parser
// returns every row; the caller keeps the ones isUniversityName accepts.
export type RuctUniversity = { code: string; name: string };

const TABLE = /<table[^>]*\bid="universidad"[^>]*>([\s\S]*?)<\/table>/i;
const TITLES_TABLE = /<table[^>]*\bid="estudio"[^>]*>([\s\S]*?)<\/table>/i;
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

// One university's title list (listaestudiosuniversidad.action): one HTML table
// (Código | Título | Nivel académico | Estado | empty) of the degrees the university is authorised to
// teach. The page is paginated (10 rows a page); the parser reads the page it is given and leaves
// pagination and the Grado filter to the caller.
export type RuctTitle = { code: string; name: string; level: string };

export function parseRuctTitles(html: string): RuctTitle[] {
  const table = TITLES_TABLE.exec(html)?.[1];
  if (table === undefined) throw new Error("RUCT: the titles table is missing: the page changed");
  const titles: RuctTitle[] = [];
  let headerSeen = false;
  for (const row of table.matchAll(ROW)) {
    const cells = [...(row[1] ?? "").matchAll(CELL)].map((m) => cellText(m[1] ?? ""));
    if (cells.length < 4) continue;
    if (cells[0] === "Código" && cells[1] === "Título") {
      headerSeen = true;
      continue;
    }
    titles.push({ code: cells[0] ?? "", name: cells[1] ?? "", level: cells[2] ?? "" });
  }
  if (!headerSeen) throw new Error("RUCT: the titles table header is missing: the page changed");
  return titles;
}

// The register lists administrative categories alongside universities: every "Centros …" row is a
// group of centres (art, defence, foreign centres authorised by a region), not a university.
export function isUniversityName(name: string): boolean {
  return !name.startsWith("Centros ");
}

// One degree's detail page (estudio.action). Older degrees (RD 1393/2007) carry no "Campo de
// estudio", so campo is null there rather than invented.
export type RuctDegree = {
  code: string;
  name: string;
  nivel: string | null;
  rama: string | null;
  campo: string | null;
  centres: string[];
};

const DEGREE_NAME = /<h2>\s*<strong>([\s\S]*?)<\/strong>\s*<\/h2>/i;
const CENTRES_TABLE = /<table[^>]*\bid="centro"[^>]*>([\s\S]*?)<\/table>/i;

const spanById = (html: string, id: string): string | null => {
  const match = new RegExp(`id="${id}"[^>]*>([\\s\\S]*?)</span>`, "i").exec(html);
  return match === null ? null : cellText(match[1] ?? "");
};

const blankToNull = (value: string | null): string | null =>
  value === null || value === "" ? null : value;

export function parseRuctDegree(html: string): RuctDegree {
  const name = DEGREE_NAME.exec(html)?.[1];
  const code = spanById(html, "estudio_codigoEstudio");
  if (name === undefined || code === null || code === "") {
    throw new Error("RUCT: the degree title or description is missing: the page changed");
  }
  return {
    code,
    name: cellText(name),
    nivel: blankToNull(spanById(html, "estudio_descripcionTipo")),
    rama: blankToNull(spanById(html, "estudio_descripcionRama")),
    campo: blankToNull(spanById(html, "estudio_descripcionAmbito")),
    centres: parseRuctCentres(html),
  };
}

// The name is the third cell; a page that lists no centre (no table) yields [] rather than a throw.
function parseRuctCentres(html: string): string[] {
  const table = CENTRES_TABLE.exec(html)?.[1];
  if (table === undefined) return [];
  const centres: string[] = [];
  for (const row of table.matchAll(ROW)) {
    const cells = [...(row[1] ?? "").matchAll(CELL)].map((m) => cellText(m[1] ?? ""));
    if (cells.length < 3) continue;
    if (cells[0] === "Universidad" && cells[1] === "Código de centro") continue;
    const centre = cells[2] ?? "";
    if (centre !== "") centres.push(centre);
  }
  return centres;
}

// --- field -------------------------------------------------------------------------------------
// RUCT's "Campo de estudio" is ISCED-F (32 ámbitos): an exact-label table on purpose, so a campo
// that is not one of the three Release-1 fields (health, arts, sciences, law, ...) is left to a
// human, never guessed. Keys are the decoded RUCT strings.
const CAMPO_FIELD: Readonly<Record<string, FieldSlug>> = {
  "Ingeniería informática y de sistemas": "computer-science",
  "Arquitectura, construcción, edificación y urbanismo, e ingeniería civil": "engineering",
  "Ingeniería eléctrica, ingeniería electrónica e ingeniería de la telecomunicación": "engineering",
  "Ingeniería industrial, ingeniería mecánica, ingeniería automática, ingeniería de la organización industrial e ingeniería de la navegación":
    "engineering",
  "Ingeniería química, ingeniería de los materiales e ingeniería del medio natural": "engineering",
  "Ciencias económicas, administración y dirección de empresas, márquetin, comercio, contabilidad y turismo":
    "business-economics",
};

// The campo decides the field; the title name is only a cross-check (the RUCT names are Spanish, so a
// name classifyDaad cannot read is not a disagreement). Confidence drops to `low` only when the name
// points to another field, so the reviewer looks before approving.
export function fieldOfCampo(campo: string | null, name: string): FieldMatch | null {
  if (campo === null) return null;
  const field = CAMPO_FIELD[campo.trim()];
  if (field === undefined) return null;
  const guessed = classifyDaad(name, null);
  const agrees = guessed === null || guessed.field === field;
  return { field, confidence: agrees ? "high" : "low" };
}
