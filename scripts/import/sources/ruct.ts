import { decodeEntities } from "../evidence";
import type { FieldMatch, FieldSlug } from "../fields";
import { fetchText, HttpStatusError } from "../http";
import type { ReviewRow, StagedRecord } from "../staging";
import { READ_SOURCE } from "../staging";
import { programmeSummary } from "../summaries";
import { collapseSpaces, slugify } from "../text";
import { classifyDaad } from "./daad";
import { stagedInstitution } from "./institutions";

// RUCT (Registro de Universidades, Centros y Títulos, educacion.gob.es/ruct, ISO-8859-15): the
// Spanish register of universities and the degrees they are authorised to teach. The university
// list is one HTML table (Código | Universidad | Centros | Títulos) and it mixes real universities
// with administrative categories ("Centros autorizados…", "Centros dependientes del Ministerio de
// Defensa", "Centros extranjeros autorizados…") that carry no programme of their own. The parser
// returns every row; the caller keeps the ones isUniversityName accepts.
export const RUCT_ORIGIN = "https://www.educacion.gob.es/ruct";
export const RUCT_UNIVERSITIES_URL = `${RUCT_ORIGIN}/listauniversidades.action?actual=universidades&textoCodigoUniversidad=&consulta=1`;
export const ructUniversityUrl = (code: string): string =>
  `${RUCT_ORIGIN}/universidad.action?actual=universidades&codigoUniversidad=${encodeURIComponent(code)}`;
export const ructTitlesUrl = (code: string): string =>
  `${RUCT_ORIGIN}/listaestudiosuniversidad.action?codigoUniversidad=${encodeURIComponent(code)}&actual=universidades&codigoTipo=G`;
export const ructDegreeUrl = (code: string): string =>
  `${RUCT_ORIGIN}/estudio.action?codigoCiclo=SC&codigoTipo=G&CodigoEstudio=${encodeURIComponent(code)}&actual=estudios`;

export type RuctUniversity = {
  code: string;
  name: string;
  // The list does not state public/private or a town: only the university's own register page does,
  // so `importSpain` fills these in from that page. Absent/undefined means "not stated".
  type?: "public" | "private" | null;
  city?: string | null;
};

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

// One university's own register page (universidad.action): "Tipo :" states Pública or Privada and
// "Localidad :" / "Municipio :" the town. Either can be absent on a page whose shape differs from
// the rest, so both are null rather than guessed.
const labelValue = (html: string, forAttr: string): string | null => {
  const block = new RegExp(`<label[^>]*for="${forAttr}"[^>]*>([\\s\\S]*?)</label>`, "i").exec(
    html,
  )?.[1];
  if (block === undefined) return null;
  const spans = [...block.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi)].map((m) =>
    cellText(m[1] ?? ""),
  );
  const value = spans[1] ?? "";
  return value === "" ? null : value;
};

export function parseRuctUniversityDetail(html: string): {
  type: "public" | "private" | null;
  city: string | null;
} {
  const tipo = labelValue(html, "tipo_univ");
  const type =
    tipo === null
      ? null
      : /^p[úu]blica\b/i.test(tipo)
        ? "public"
        : /^privada\b/i.test(tipo)
          ? "private"
          : null;
  return { type, city: labelValue(html, "dloc") ?? labelValue(html, "dmunic") };
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

// The name is the third cell. A page that lists no centre (no table) yields []; a table that exists
// with an unrecognised header is a changed shape and throws, so the header row can never leak.
function parseRuctCentres(html: string): string[] {
  const table = CENTRES_TABLE.exec(html)?.[1];
  if (table === undefined) return [];
  const centres: string[] = [];
  let headerSeen = false;
  for (const row of table.matchAll(ROW)) {
    const cells = [...(row[1] ?? "").matchAll(CELL)].map((m) => cellText(m[1] ?? ""));
    if (cells.length < 3) continue;
    if (cells[0] === "Universidad" && cells[1] === "Código de centro") {
      headerSeen = true;
      continue;
    }
    const centre = cells[2] ?? "";
    if (centre !== "") centres.push(centre);
  }
  if (!headerSeen) throw new Error("RUCT: the centres table header is missing: the page changed");
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

// --- records -----------------------------------------------------------------------------------
function institutionTodo(type: "public" | "private" | null): string {
  const status =
    type === null
      ? "the RUCT register does not state whether this university is public or private"
      : `the RUCT register states this university is ${type}`;
  return `${status}: confirm the details on the university's own site, add that page as the source, then set info_kind: official`;
}

function programmeTodo(degree: RuctDegree, match: FieldMatch): string {
  const details = [
    `RUCT lists the degree (${degree.nivel ?? "level not stated"})`,
    ...(degree.rama === null ? [] : [`rama ${degree.rama}`]),
    ...(degree.campo === null ? [] : [`campo ${degree.campo}`]),
  ].join(", ");
  return [
    details,
    "the RUCT register has no programme page: find the programme's own page on the university's site (officialUrl is required), then read duration, teaching languages, tuition for a non-EU student living abroad, intakes, documents, requirements and the application channel (regional preinscripción / UNEDasiss)",
    ...(match.confidence === "low"
      ? ["the campo and the title name point to different fields: check the content"]
      : []),
  ].join("; ");
}

export function buildSpainRecords(input: {
  university: RuctUniversity;
  titles: readonly RuctTitle[];
  degrees: ReadonlyMap<string, RuctDegree>;
}): StagedRecord[] {
  const { university } = input;
  const city = university.city ?? "";
  const type = university.type ?? null;
  const instSlug = `es-${slugify(university.name, 40)}`;

  const institution = stagedInstitution({
    slug: instSlug,
    name: university.name,
    country: "ES",
    city,
    type,
    website: null,
    source: "ruct",
    sourceUrl: ructUniversityUrl(university.code),
    sourceId: `ruct:${university.code}`,
    todo: institutionTodo(type),
  });

  const programmes = new Map<string, StagedRecord>();
  for (const title of input.titles) {
    if (!title.level.startsWith("Grado")) continue;
    const degree = input.degrees.get(title.code);
    if (degree === undefined) continue;
    const match = fieldOfCampo(degree.campo, degree.name);
    if (match === null) continue;

    const name = degree.name;
    const slug = `${instSlug}-${slugify(name, 40)}-${degree.code}`;
    if (programmes.has(slug)) throw new Error(`RUCT: two degrees would get the same slug ${slug}`);
    const review: ReviewRow = {
      kind: "programs",
      slug,
      name,
      institution: university.name,
      city,
      field: match.field,
      confidence: match.confidence,
      officialUrl: "",
      todo: programmeTodo(degree, match),
    };
    programmes.set(slug, {
      collection: "programs",
      id: slug,
      sourceId: `ruct:${university.code}:${degree.code}`,
      data: {
        slug,
        institution: instSlug,
        country: "ES",
        city: slugify(city),
        field: match.field,
        level: "bachelor",
        name,
        summary: programmeSummary(name, university.name, city, "ruct"),
        officialUrl: null,
        durationYears: { value: null, source: "ruct", info_kind: READ_SOURCE },
        teachingLanguages: { value: null, source: "ruct", info_kind: READ_SOURCE },
        tuition: { value: null, source: "ruct", info_kind: READ_SOURCE },
        intakes: { value: null, source: "ruct", info_kind: READ_SOURCE },
        applicationChannel: { value: null, source: "ruct", info_kind: READ_SOURCE },
        documents: { value: null, source: "ruct", info_kind: READ_SOURCE },
        requirements: { coverage: "partial", source: "ruct", info_kind: READ_SOURCE, rules: [] },
        scholarships: [],
        sources: { ruct: { url: ructDegreeUrl(degree.code), last_verified_at: null } },
      },
      review,
    });
  }

  const sortedProgrammes = [...programmes.values()].sort((a, b) => a.id.localeCompare(b.id));
  return [institution, ...sortedProgrammes];
}

// --- fetching ----------------------------------------------------------------------------------
// RUCT paginates every table ten rows a page (DisplayTag): the "Siguiente" link carries the next
// page as `d-<tableId>-p=<n>`. Reading it from the page (rather than counting) follows the server's
// own paging and stops when the link disappears. A page whose rows repeat is the same page served
// again (a session that did not advance): the signature stops the loop instead of paging forever.
const SIGUIENTE = /<a[^>]*href="([^"]*d-\d+-p=\d+[^"]*)"[^>]*>\s*Siguiente\s*<\/a>/i;

export function nextRuctPageUrl(html: string, current: string): string | null {
  const href = SIGUIENTE.exec(html)?.[1];
  return href === undefined ? null : new URL(decodeEntities(href), current).toString();
}

async function fetchRuctPages(
  url: string,
  validate: (body: string) => void,
  signature: (html: string) => string,
): Promise<string[]> {
  const pages: string[] = [];
  const seen = new Set<string>();
  let next: string | null = url;
  for (let guard = 0; next !== null; guard++) {
    if (guard > 500) throw new Error("RUCT: the pagination does not end: the page shape changed");
    const html = await fetchText(next, { accept: "text/html", encoding: "iso-8859-15", validate });
    const sig = signature(html);
    if (seen.has(sig)) break;
    seen.add(sig);
    pages.push(html);
    next = nextRuctPageUrl(html, next);
  }
  return pages;
}

const RUMP = (body: string, marker: string, what: string): void => {
  if (!body.includes(marker)) throw new Error(`RUCT: ${what} looks wrong: the page changed`);
};

// A university with no Grado of its own serves the title page without the "estudio" table at all
// (parseRuctTitles still throws on a table whose header changed, so a real shape change stops).
const titlesOf = (html: string): RuctTitle[] =>
  html.includes('id="estudio"') ? parseRuctTitles(html) : [];

export async function importSpain(): Promise<StagedRecord[]> {
  const listPages = await fetchRuctPages(
    RUCT_UNIVERSITIES_URL,
    (body) => RUMP(body, 'id="universidad"', "the university list"),
    (html) =>
      parseRuctUniversities(html)
        .map((u) => u.code)
        .join(","),
  );
  const universities = listPages
    .flatMap((html) => parseRuctUniversities(html))
    .filter((u) => isUniversityName(u.name));
  if (universities.length < 40) {
    throw new Error(
      `RUCT: only ${universities.length} universities found (expected about 90): the list looks incomplete`,
    );
  }

  const records: StagedRecord[] = [];
  let degreePages = 0;
  let unreadable = 0;
  for (const u of universities) {
    const detail = parseRuctUniversityDetail(
      await fetchText(ructUniversityUrl(u.code), {
        accept: "text/html",
        encoding: "iso-8859-15",
        validate: (body) => RUMP(body, 'id="universidad"', "a university page"),
      }),
    );
    if (detail.type === "private") continue;

    const titlePages = await fetchRuctPages(
      ructTitlesUrl(u.code),
      (body) => RUMP(body, 'id="listaestudiosuniversidad"', "a title list"),
      (html) =>
        titlesOf(html)
          .map((t) => t.code)
          .join(","),
    );
    const titles = titlePages.flatMap((html) => titlesOf(html));
    const degrees = new Map<string, RuctDegree>();
    for (const title of titles) {
      if (!title.level.startsWith("Grado")) continue;
      degreePages++;
      // The register lists some titles whose detail page is missing or of another shape: skip that
      // one programme with a clear message (never stage a wrong record), but a real block (403/429)
      // still stops the run.
      try {
        degrees.set(
          title.code,
          parseRuctDegree(
            await fetchText(ructDegreeUrl(title.code), {
              accept: "text/html",
              encoding: "iso-8859-15",
              validate: (body) => RUMP(body, "estudio_codigoEstudio", "a degree page"),
            }),
          ),
        );
      } catch (error) {
        if (error instanceof HttpStatusError) throw error;
        unreadable++;
        console.warn(
          `RUCT ${u.code}: skipping degree ${title.code} ${title.name}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    const staged = buildSpainRecords({
      university: { ...u, type: detail.type, city: detail.city },
      titles,
      degrees,
    });
    const programmes = staged.filter((r) => r.collection === "programs").length;
    console.log(`RUCT ${u.code} ${u.name}: ${programmes} Grado programme(s) staged`);
    records.push(...staged);
  }

  if (unreadable > 20 && unreadable > degreePages * 0.2) {
    throw new Error(
      `RUCT: ${unreadable} of ${degreePages} degree pages could not be read: the register shape changed`,
    );
  }
  const programmes = records.filter((r) => r.collection === "programs").length;
  console.log(
    `RUCT: ${programmes} Grado programme(s) staged from ${universities.length} universities (${unreadable} degree page(s) skipped)`,
  );
  return records;
}
