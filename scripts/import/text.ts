// Lower-case kebab slug, accents stripped, capped so slugs stay readable.
export function slugify(input: string, maxLength = 48): string {
  const slug = input
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
  return input
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
