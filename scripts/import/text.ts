// Letters that Unicode normalisation does not decompose: "Gießen" must become "giessen", not "gie-en".
const SPECIAL_LETTERS: Record<string, string> = {
  ß: "ss",
  æ: "ae",
  œ: "oe",
  ø: "o",
  đ: "d",
  ł: "l",
  þ: "th",
};

function foldSpecialLetters(input: string): string {
  return input.replace(/[ßæœøđłþ]/giu, (c) => SPECIAL_LETTERS[c.toLowerCase()] ?? c);
}

// Lower-case kebab slug, accents stripped, capped so slugs stay readable.
export function slugify(input: string, maxLength = 48): string {
  const slug = foldSpecialLetters(input)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, maxLength).replace(/-+$/g, "");
}

export function collapseSpaces(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

// "Paris  5e  Arrondissement" -> "Paris"; the arrondissement is not a separate city.
export function normalizeCityName(input: string): string {
  return collapseSpaces(input).replace(/\s+\d+(?:er|e|ème)?\s+arrondissement$/i, "");
}

// Accent- and punctuation-insensitive key for matching institution names across datasets.
export function nameKey(input: string): string {
  return foldSpecialLetters(input)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const SHORTENER_HOSTS = new Set([
  "bit.ly",
  "tinyurl.com",
  "goo.gl",
  "t.co",
  "ow.ly",
  "is.gd",
  "cutt.ly",
  "buff.ly",
  "rebrand.ly",
]);

export function hostKey(url: string): string | null {
  if (!URL.canParse(url)) return null;
  return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
}

// A website address that is a site's front door: no path beyond "/", no query, no fragment.
export function isOriginUrl(url: string): boolean {
  if (!URL.canParse(url)) return false;
  const parsed = new URL(url);
  return (
    (parsed.pathname === "/" || parsed.pathname === "") &&
    parsed.search === "" &&
    parsed.hash === ""
  );
}

export function isUrlShortener(url: string): boolean {
  const host = hostKey(url);
  return host !== null && SHORTENER_HOSTS.has(host);
}

export function stripQueryAndHash(url: string): string {
  if (!URL.canParse(url)) return url;
  const parsed = new URL(url);
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

// Registers write a town differently: "Garching b. München" / "Garching bei München",
// "Merseburg / Saale" / "Merseburg". The canonical display form drops a "/ ..." addition and spells
// "b." as "bei", so the same campus gets one name (and one slug) whichever source names it.
export function canonicalTown(town: string): string {
  return collapseSpaces(town.replace(/\s*\/\s*.+$/, "").replace(/\bb\.\s*/i, "bei "));
}

// "Halle (Saale)" -> "Halle", "Mainz am Rhein" -> "Mainz", "Bad Homburg vor der Höhe" -> "Bad Homburg":
// registers disagree on how much of a town's official name to write.
export function townKey(town: string): string {
  const base = collapseSpaces(canonicalTown(town).replace(/\([^)]*\)/g, " "));
  return nameKey(base.replace(/\s+(am|an der|an|im|bei|vor der|in der|ob der)\s+.+$/i, ""));
}

export function sameTown(a: string, b: string): boolean {
  return townKey(a) !== "" && townKey(a) === townKey(b);
}
