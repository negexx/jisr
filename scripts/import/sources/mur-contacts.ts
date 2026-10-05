import { decodeEntities } from "../evidence";
import { collapseSpaces } from "../text";

// The "Contatti istituzioni" table of the international students portal (CINECA, for the MUR,
// linked from universitaly.it): for each Italian higher education institution the phone, e-mail
// and website its own staff entered. Used only to find a website CANDIDATE for a university the
// MUR list gives no site for: the candidate is checked later against the university's own home
// page (data:inst-proposals) before anything is promoted.
export const CONTACTS_URL =
  "https://studenti-internazionali.cineca.it/index.php/it/pub/contatti_atenei";

export type Contact = {
  name: string;
  phone: string | null;
  email: string | null;
  site: string | null;
};

const cellText = (html: string): string =>
  collapseSpaces(decodeEntities(html.replace(/<[^>]*>/g, " ")));
const orNull = (text: string): string | null => (text === "" || text === "-" ? null : text);

export function parseContacts(html: string): Contact[] {
  const contacts: Contact[] = [];
  let headerSeen = false;
  for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...(row[1] ?? "").matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) =>
      cellText(m[1] ?? ""),
    );
    if (cells.length < 4) continue;
    if (cells[0] === "Istituzione" && cells[3] === "Sito") {
      headerSeen = true;
      continue;
    }
    contacts.push({
      name: cells[0] ?? "",
      phone: orNull(cells[1] ?? ""),
      email: orNull(cells[2] ?? ""),
      site: orNull(cells[3] ?? ""),
    });
  }
  if (!headerSeen)
    throw new Error("MUR contacts: the institutions table is missing: the page changed");
  return contacts;
}

// "https://en.unito.it/studying/apply", "www.unifi.it" or "http://a.it/home (IT) - https://b.it/
// (EN)" -> the origin of the first address that is a real host; a PDF or a sub-page only tells us
// the host. http stays http here: the caller probes whether https answers.
export function siteOrigin(site: string | null): string | null {
  if (site === null) return null;
  const found = /(https?:\/\/[^\s)]+|www\.[^\s)]+)/i.exec(site)?.[1];
  if (found === undefined) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(found) ? found : `https://${found}`);
    const labels = url.hostname.split(".");
    if (labels.length < 2 || labels.some((l) => l === "")) return null;
    return `${url.protocol}//${url.host}/`;
  } catch {
    return null;
  }
}

const FILLER = new Set([
  "universita",
  "degli",
  "studi",
  "di",
  "del",
  "della",
  "delle",
  "dei",
  "dello",
  "dell",
  "e",
  "d",
  "l",
  "la",
  "il",
]);

const words = (text: string): Set<string> =>
  new Set(
    text
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w !== "" && !FILLER.has(w)),
  );

// The one contact row whose distinctive words are the university's, allowing the headquarters
// town as the only extra word on either side ("... delle Marche - Ancona"). More than one row, or
// none, is null: a website is never guessed.
export function matchContact(
  ateneo: { fullName: string; city: string },
  contacts: readonly Contact[],
): Contact | null {
  const mine = words(ateneo.fullName);
  const town = words(ateneo.city);
  const matches = contacts.filter((c) => {
    const theirs = words(c.name);
    if (mine.size === 0 || theirs.size === 0) return false;
    const onlyMine = [...mine].filter((w) => !theirs.has(w));
    const onlyTheirs = [...theirs].filter((w) => !mine.has(w));
    const extrasAreTown = (extra: readonly string[]) => extra.every((w) => town.has(w));
    return (
      (onlyMine.length === 0 && onlyTheirs.length === 0) ||
      (onlyMine.length === 0 && extrasAreTown(onlyTheirs)) ||
      (onlyTheirs.length === 0 && extrasAreTown(onlyMine))
    );
  });
  return matches.length === 1 ? (matches[0] ?? null) : null;
}
