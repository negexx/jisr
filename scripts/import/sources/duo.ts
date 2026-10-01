import { fetchText } from "../http";

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
};

export function parseDuoCsv(text: string): DuoInstitution[] {
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const header = (headerLine ?? "").split(";").map((h) => h.trim());
  const col = (name: string) => header.indexOf(name);
  const idx = {
    kind: col("SOORT HO"),
    code: col("INSTELLINGSCODE"),
    name: col("INSTELLINGSNAAM"),
    city: col("PLAATSNAAM"),
    website: col("INTERNETADRES"),
  };
  if (Object.values(idx).some((i) => i === -1)) {
    throw new Error("DUO list: expected columns are missing (the file format changed?)");
  }
  const out: DuoInstitution[] = [];
  for (const line of lines) {
    if (line.trim() === "") continue;
    const cells = line.split(";").map((c) => c.trim());
    const kind = cells[idx.kind]?.toLowerCase();
    if (kind !== "hbo" && kind !== "wo") continue;
    out.push({
      code: cells[idx.code] ?? "",
      name: cells[idx.name] ?? "",
      kind,
      city: titleCase(cells[idx.city] ?? ""),
      website: cells[idx.website] ?? "",
    });
  }
  return out.filter((i) => i.code !== "" && i.name !== "");
}

// DUO writes towns in capitals ("LEEUWARDEN"); keep hyphenated and multi-word names readable.
export function titleCase(input: string): string {
  return input
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, letter: string) => sep + letter.toUpperCase());
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
