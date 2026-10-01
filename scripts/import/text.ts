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
