import { fetchText } from "../http";

// HRK Hochschulkompass: the German Rectors' Conference's list of all state and state-recognised
// German higher-education institutions (tab-separated, cp1252). Licence: free for personal use;
// any other use needs permission from the HRK foundation (to be requested before launch).
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
};

const COLUMNS = {
  hsNr: "Hs-Nr.",
  name: "Hochschulname",
  kind: "Hochschultyp",
  sponsor: "Trägerschaft",
  state: "Bundesland",
  city: "Ort (Hausanschrift)",
  homepage: "Home Page",
} as const;

// Relevant to Bachelor applicants in Release 1; art, music and civil-service colleges are left out.
export const HRK_KINDS = ["Universitäten", "Fachhochschulen / HAW", "Hochschulen eigenen Typs"];

export function parseHrkList(text: string): HrkInstitution[] {
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const header = (headerLine ?? "").split("\t").map((h) => h.trim());
  const at = Object.fromEntries(
    Object.entries(COLUMNS).map(([key, name]) => [key, header.indexOf(name)]),
  );
  if (Object.values(at).some((i) => i === -1)) {
    throw new Error("HRK list: expected columns are missing (the file format changed?)");
  }
  const out: HrkInstitution[] = [];
  for (const line of lines) {
    if (line.trim() === "") continue;
    const cells = line.split("\t").map((c) => c.trim());
    const get = (key: keyof typeof COLUMNS) => cells[at[key] ?? -1] ?? "";
    out.push({
      hsNr: get("hsNr"),
      name: get("name"),
      kind: get("kind"),
      sponsor: get("sponsor"),
      state: get("state"),
      city: get("city"),
      homepage: get("homepage"),
    });
  }
  return out;
}

export async function fetchHrkInstitutions(): Promise<HrkInstitution[]> {
  const text = await fetchText(HRK_LIST_URL, {
    encoding: "windows-1252",
    validate: (body) => {
      if (parseHrkList(body).length < 100) throw new Error("HRK list looks truncated");
    },
  });
  return parseHrkList(text).filter((i) => HRK_KINDS.includes(i.kind) && /^\d+$/.test(i.hsNr));
}

// "öffentlich-rechtlich" -> public; "privat, ..." and "kirchlich, ..." -> private (church-run
// institutions are flagged separately because the app has no third category).
export function sectorOfSponsor(sponsor: string): {
  type: "public" | "private" | null;
  church: boolean;
} {
  const key = sponsor.toLowerCase();
  if (key.startsWith("öffentlich")) return { type: "public", church: false };
  if (key.startsWith("kirchlich")) return { type: "private", church: true };
  if (key.startsWith("privat")) return { type: "private", church: false };
  return { type: null, church: false };
}

// "http://www.x.de", "https://x.de/" or a bare "www.x.de" -> { https: url or null, raw: as listed }
export function websiteCandidates(homepage: string): {
  asListed: string | null;
  needsProbe: boolean;
} {
  const value = homepage.trim();
  if (value === "") return { asListed: null, needsProbe: false };
  if (value.startsWith("https://")) return { asListed: value, needsProbe: false };
  return { asListed: value, needsProbe: true };
}
