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
