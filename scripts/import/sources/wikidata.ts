import { z } from "zod";

import { fetchJson } from "../http";

const ENDPOINT = "https://query.wikidata.org/sparql";

const BindingsSchema = z.object({
  results: z.object({
    bindings: z.array(z.record(z.string(), z.object({ value: z.string() }))),
  }),
});

async function sparql(query: string): Promise<Record<string, string>[]> {
  const url = `${ENDPOINT}?format=json&query=${encodeURIComponent(query)}`;
  const parsed = BindingsSchema.parse(await fetchJson(url, { validate: validateBindings }));
  return parsed.results.bindings.map((b) =>
    Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])),
  );
}

function validateBindings(body: string): void {
  BindingsSchema.parse(JSON.parse(body));
}

// https first, then alphabetical, so re-runs never flip between an item's several values.
function pickStable(values: readonly string[]): string | null {
  const sorted = [...new Set(values)].sort();
  return sorted.find((v) => v.startsWith("https://")) ?? sorted[0] ?? null;
}

// French establishments: UAI code (P3202) -> official website (P856), as recorded on Wikidata.
export async function fetchWebsitesByUai(): Promise<Map<string, string[]>> {
  const rows = await sparql("SELECT ?uai ?site WHERE { ?i wdt:P3202 ?uai; wdt:P856 ?site. }");
  const map = new Map<string, string[]>();
  for (const { uai, site } of rows) {
    if (uai === undefined || site === undefined) continue;
    map.set(uai, [...(map.get(uai) ?? []), site].sort());
  }
  return map;
}

export type WikidataInstitution = {
  qid: string;
  name: string;
  city: string | null;
  website: string | null;
  ror: string | null;
};

// Direct instance-of only (the transitive subclass form times out on the public endpoint):
// university, public/private university, research university, university of applied sciences,
// hogeschool, Fachhochschule.
const KINDS = [
  "Q3918",
  "Q875538",
  "Q902104",
  "Q15936437",
  "Q1365560",
  "Q19152599",
  "Q16641394",
  "Q17028020",
];

// Active institutions in one country. Labels prefer the country's own language so official names
// are not translated; the city is the headquarters location (P159), not an administrative region.
export async function fetchInstitutions(
  countryQid: string,
  languages: string,
): Promise<WikidataInstitution[]> {
  const rows = await sparql(`
    SELECT ?u ?uLabel ?cityLabel ?site ?ror WHERE {
      VALUES ?kind { ${KINDS.map((k) => `wd:${k}`).join(" ")} }
      ?u wdt:P31 ?kind; wdt:P17 wd:${countryQid}.
      FILTER NOT EXISTS { ?u wdt:P576 ?ended }
      OPTIONAL { ?u wdt:P856 ?site }
      OPTIONAL { ?u wdt:P6782 ?ror }
      OPTIONAL { ?u wdt:P159 ?city }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "${languages}". }
    }`);
  const grouped = new Map<string, Record<string, string[]>>();
  for (const row of rows) {
    const qid = row.u?.split("/").pop();
    if (qid === undefined) continue;
    const entry = grouped.get(qid) ?? {};
    for (const key of ["uLabel", "cityLabel", "site", "ror"] as const) {
      const value = row[key];
      if (value !== undefined) entry[key] = [...(entry[key] ?? []), value];
    }
    grouped.set(qid, entry);
  }
  const isLabel = (v: string | null): v is string => v !== null && !/^Q\d+$/.test(v);
  const out: WikidataInstitution[] = [];
  for (const [qid, entry] of grouped) {
    const name = pickStable(entry.uLabel ?? []);
    if (!isLabel(name)) continue;
    const city = pickStable(entry.cityLabel ?? []);
    out.push({
      qid,
      name,
      city: isLabel(city) ? city : null,
      website: pickStable(entry.site ?? []),
      ror: pickStable(entry.ror ?? []),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name) || a.qid.localeCompare(b.qid));
}
