import { fetchText } from "../http";
import { parseCsv } from "../staging";
import { collapseSpaces } from "../text";

// DUO (Dutch education executive agency) open data: "Hogescholen en universiteiten", official
// institution list with address and website (latin1, semicolon separated).
export const DUO_INSTITUTIONS_URL =
  "https://duo.nl/open_onderwijsdata/images/01.-instellingen-hbo-en-wo.csv";
export const DUO_INSTITUTIONS_PAGE =
  "https://duo.nl/open_onderwijsdata/hoger-onderwijs/adressen/hogescholen-en-universiteiten.jsp";

export type DuoInstitution = {
  code: string;
  name: string;
  kind: "hbo" | "wo";
  city: string;
  website: string;
  denomination: string;
};

const REQUIRED = [
  "SOORT HO",
  "INSTELLINGSCODE",
  "INSTELLINGSNAAM",
  "PLAATSNAAM",
  "INTERNETADRES",
  "DENOMINATIE",
];

const LOWER_PARTICLES = new Set(["op", "aan", "de", "den", "der", "van", "ten", "ter", "in", "en"]);

// DUO writes towns in capitals ("LEEUWARDEN", "BERGEN OP ZOOM"); restore Dutch capitalisation:
// particles stay lower-case after the first word and a leading "ij" is the digraph "IJ".
export function titleCase(input: string): string {
  let first = true;
  return input.toLowerCase().replace(/[\p{L}']+/gu, (word) => {
    const lead = first;
    first = false;
    if (!lead && LOWER_PARTICLES.has(word)) return word;
    if (word.startsWith("ij")) return `IJ${word.slice(2)}`;
    if (word.startsWith("'") && word.length > 1)
      return `'${word.charAt(1).toUpperCase()}${word.slice(2)}`;
    return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
  });
}

export function parseDuoCsv(text: string): DuoInstitution[] {
  const rows = parseCsv(text, ";");
  const head = rows[0];
  if (head === undefined || REQUIRED.some((c) => !(c in head))) {
    throw new Error("DUO list: expected columns are missing (the file format changed?)");
  }
  const out: DuoInstitution[] = [];
  for (const r of rows) {
    const kind = (r["SOORT HO"] ?? "").trim().toLowerCase();
    if (kind !== "hbo" && kind !== "wo") continue;
    out.push({
      code: (r.INSTELLINGSCODE ?? "").trim(),
      name: collapseSpaces(r.INSTELLINGSNAAM ?? ""),
      kind,
      city: titleCase(collapseSpaces(r.PLAATSNAAM ?? "")),
      website: (r.INTERNETADRES ?? "").trim(),
      denomination: (r.DENOMINATIE ?? "").trim(),
    });
  }
  return out.filter((i) => i.code !== "" && i.name !== "");
}

export async function fetchDuoInstitutions(): Promise<DuoInstitution[]> {
  const text = await fetchText(DUO_INSTITUTIONS_URL, {
    encoding: "windows-1252",
    validate: (body) => {
      if (parseDuoCsv(body).length < 20) throw new Error("DUO list looks truncated");
    },
  });
  return parseDuoCsv(text);
}
