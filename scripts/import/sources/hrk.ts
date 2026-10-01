import { fetchText } from "../http";
import { parseCsv } from "../staging";
import { collapseSpaces } from "../text";

// HRK Hochschulkompass: the German Rectors' Conference's list of all state and state-recognised
// German higher-education institutions (tab-separated with CSV-style quoting, cp1252).
// Licence (downloads page): "free of charge for personal use only. All other uses, in particular
// commercial use (including individual parts), require the approval of the Foundation for the
// Promotion of the HRK". Permission was obtained by the project owner (2026-10-01); see data/README.md.
export const HRK_LIST_URL = "https://hs-kompass.de/kompass/xml/download/hs_liste.txt";
export const HRK_DOWNLOADS_PAGE =
  "https://www.hochschulkompass.de/en/higher-education-institutions/downloads.html";

export type HrkInstitution = {
  hsNr: string;
  name: string;
  kind: string;
  sponsor: string;
  state: string;
  city: string;
  homepage: string;
  // "Adressname der Hochschule": the everyday short name ("RWTH Aachen"), used for matching.
  alias: string;
};

// Relevant to Bachelor applicants in Release 1; art, music and civil-service colleges are left out.
export const HRK_KINDS = ["Universitäten", "Fachhochschulen / HAW", "Hochschulen eigenen Typs"];

const REQUIRED = [
  "Hs-Nr.",
  "Hochschulname",
  "Hochschultyp",
  "Trägerschaft",
  "Bundesland",
  "Ort (Hausanschrift)",
  "Home Page",
];

export function parseHrkList(text: string): HrkInstitution[] {
  const rows = parseCsv(text, "\t");
  const first = rows[0];
  if (first === undefined || REQUIRED.some((c) => !(c in first))) {
    throw new Error("HRK list: expected columns are missing (the file format changed?)");
  }
  return rows.map((r) => ({
    hsNr: (r["Hs-Nr."] ?? "").trim(),
    name: collapseSpaces(r.Hochschulname ?? ""),
    kind: (r.Hochschultyp ?? "").trim(),
    sponsor: (r["Trägerschaft"] ?? "").trim(),
    state: (r.Bundesland ?? "").trim(),
    city: collapseSpaces(r["Ort (Hausanschrift)"] ?? ""),
    homepage: (r["Home Page"] ?? "").trim(),
    alias: collapseSpaces(r["Adressname der Hochschule"] ?? ""),
  }));
}

export async function fetchHrkInstitutions(): Promise<HrkInstitution[]> {
  const text = await fetchText(HRK_LIST_URL, {
    encoding: "windows-1252",
    validate: (body) => {
      if (parseHrkList(body).length < 100) throw new Error("HRK list looks truncated");
    },
  });
  const relevant = parseHrkList(text).filter((i) => HRK_KINDS.includes(i.kind));
  const broken = relevant.filter((i) => !/^\d+$/.test(i.hsNr));
  if (broken.length > 0) {
    throw new Error(
      `HRK list: ${broken.length} row(s) of a relevant kind have no numeric Hs-Nr (parse problem?)`,
    );
  }
  return relevant;
}

// "öffentlich-rechtlich" -> public; "privat, ..." -> private. Church-run institutions are neither
// clearly public nor private for this app, so their type stays null for a human.
export function sectorOfSponsor(sponsor: string): {
  type: "public" | "private" | null;
  church: boolean;
} {
  const key = sponsor.toLowerCase();
  if (key.startsWith("öffentlich")) return { type: "public", church: false };
  if (key.startsWith("kirchlich")) return { type: null, church: true };
  if (key.startsWith("privat")) return { type: "private", church: false };
  return { type: null, church: false };
}

// "http://www.x.de", "https://x.de/" or a bare "www.x.de".
export function websiteCandidates(homepage: string): {
  asListed: string | null;
  needsProbe: boolean;
} {
  const value = homepage.trim();
  if (value === "") return { asListed: null, needsProbe: false };
  if (value.startsWith("https://")) return { asListed: value, needsProbe: false };
  return { asListed: value, needsProbe: true };
}
