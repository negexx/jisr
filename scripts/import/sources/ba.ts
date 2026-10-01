import { z } from "zod";

import { fetchJson } from "../http";
import { nameKey, slugify } from "../text";

// Federal Employment Agency "Studiensuche" API: one of the largest databases of study offers in
// Germany, documented by the bund.dev community (OpenAPI). The key below is the public client id
// from that documentation. The API returns the programme, provider, location and degree type; it
// has no programme page, teaching language or fees. Terms of use: to be confirmed before launch.
export const BA_STUDIENSUCHE_PAGE = "https://web.arbeitsagentur.de/studiensuche/";
const API = "https://rest.arbeitsagentur.de/infosysbub/studisu/pc/v1/studienangebote";
const API_KEY = "infosysbub-studisu";
const PAGE_SIZE = 20;

// Official study fields (dkzIds from the API documentation). The parent field groups return no
// results, so the individual fields are queried. Fields outside the three Release 1 areas are left out.
export const BA_GROUPS = [
  { sfe: "94030;93598", label: "2303 Automatisierungs-, Produktionstechnik", field: "engineering" },
  { sfe: "93819;93690", label: "2305 Bautechnik", field: "engineering" },
  { sfe: "93970;93853", label: "2307 Elektro- und Informationstechnik", field: "engineering" },
  { sfe: "94362;94319", label: "2309 Energietechnik, Energiemanagement", field: "engineering" },
  { sfe: "94324;94394", label: "2311 Fahrzeug-, Verkehrstechnik", field: "engineering" },
  { sfe: "93815;94121", label: "2313 Fertigungstechnologien", field: "engineering" },
  {
    sfe: "93751;94262",
    label: "2315 Gebäude-, Versorgungstechnik, Facility-Management",
    field: "engineering",
  },
  { sfe: "94114;93999", label: "2319 Maschinenbau, Mechanik", field: "engineering" },
  { sfe: "93896;94237", label: "2321 Mechatronik, Mikro- und Optotechnik", field: "engineering" },
  {
    sfe: "93584;94187",
    label: "2325 Medizintechnik, Technisches Gesundheitswesen",
    field: "engineering",
  },
  { sfe: "94269;93918", label: "2329 Physikalische Technik", field: "engineering" },
  { sfe: "93795;93574", label: "2331 Produktentwicklung, Konstruktion", field: "engineering" },
  {
    sfe: "94307;93592",
    label: "2339 Technik, Ingenieurwissenschaften (übergreifend)",
    field: "engineering",
  },
  { sfe: "94256;93861", label: "2341 Umwelttechnik, Umweltschutz", field: "engineering" },
  { sfe: "93724;94204", label: "2343 Verfahrens-, Chemietechnik", field: "engineering" },
  { sfe: "93850;94143", label: "2345 Werkstoff-, Materialwissenschaften", field: "engineering" },
  {
    sfe: "93814;93581",
    label: "2347 Wirtschaftsingenieurwesen, Technologiemanagement",
    field: "engineering",
  },
  { sfe: "94116;93995", label: "2509 Informatik", field: "computer-science" },
  { sfe: "130048;130047", label: "2928 Wirtschaftsinformatik", field: "computer-science" },
  { sfe: "94008;94158", label: "2905 Betriebswirtschaft", field: "business-economics" },
  {
    sfe: "93659;93818",
    label: "2907 Finanz- und Rechnungswesen, Controlling, Steuern",
    field: "business-economics",
  },
  {
    sfe: "93909;94020",
    label: "2909 Finanzdienstleistungen, Versicherungswirtschaft",
    field: "business-economics",
  },
  { sfe: "94375;94221", label: "2915 Internationale Wirtschaft", field: "business-economics" },
  { sfe: "94000;93719", label: "2919 Management", field: "business-economics" },
  { sfe: "93977;93736", label: "2921 Marketing, Vertrieb", field: "business-economics" },
  {
    sfe: "94033;94303",
    label: "2929 Wirtschaftswissenschaften, Volkswirtschaft",
    field: "business-economics",
  },
] as const;
export type BaField = (typeof BA_GROUPS)[number]["field"];

// Universities, Fachhochschulen/HAW and "Hochschulen eigenen Typs" (no dual or art colleges).
export const BA_HOCHSCHULARTEN = [106, 108, 114];

const ItemSchema = z.object({
  studienangebot: z.object({
    id: z.union([z.string(), z.number()]).transform(String),
    studiBezeichnung: z.string(),
    studienanbieter: z.object({ banId: z.number(), name: z.string() }),
    studienort: z.object({
      ort: z.string().nullable().optional(),
      bundesland: z.string().nullable().optional(),
    }),
    hochschulart: z.object({ id: z.number(), label: z.string() }),
    studienfaecher: z.array(z.string()).default([]),
  }),
});
const PageSchema = z.object({
  items: z.array(ItemSchema).default([]),
  maxErgebnisse: z.number().default(0),
});

export type BaProgramme = {
  id: string;
  name: string;
  providerId: number;
  provider: string;
  city: string;
  state: string;
  hochschulart: string;
  subjects: string[];
  group: (typeof BA_GROUPS)[number];
};

// "Feucht, Bayern" -> "Feucht": the API sometimes appends the state to the town.
export function cityOf(ort: string | null | undefined): string {
  return (ort ?? "").split(",")[0]?.trim() ?? "";
}

async function fetchPage(sfe: string, page: number) {
  const params = new URLSearchParams({ sfe, abg: "2", st: "0", sfo: "1", pg: String(page) });
  const json = await fetchJson(`${API}?${params}`, {
    headers: { "X-API-Key": API_KEY },
    validate: (body) => void PageSchema.parse(JSON.parse(body)),
  });
  return PageSchema.parse(json);
}

// Bachelor, undergraduate, full-time offers of each study-field group, deduplicated by offer id
// (a programme can sit in two groups: the first group wins). Pages are cached on disk.
export async function fetchBaProgrammes(): Promise<BaProgramme[]> {
  const byId = new Map<string, BaProgramme>();
  for (const group of BA_GROUPS) {
    const first = await fetchPage(group.sfe, 1);
    console.log(`${group.label}: ${first.maxErgebnisse} offers`);
    const pages = Math.max(1, Math.ceil(first.maxErgebnisse / PAGE_SIZE));
    for (let page = 1; page <= pages; page++) {
      const { items } = page === 1 ? first : await fetchPage(group.sfe, page);
      await new Promise((resolve) => setTimeout(resolve, 300));
      for (const { studienangebot: o } of items) {
        if (!BA_HOCHSCHULARTEN.includes(o.hochschulart.id) || byId.has(o.id)) continue;
        byId.set(o.id, {
          id: o.id,
          name: o.studiBezeichnung.trim(),
          providerId: o.studienanbieter.banId,
          provider: o.studienanbieter.name.trim(),
          city: cityOf(o.studienort.ort),
          state: o.studienort.bundesland ?? "",
          hochschulart: o.hochschulart.label,
          subjects: o.studienfaecher,
          group,
        });
      }
    }
  }
  return [...byId.values()].sort((a, b) => Number(a.id) - Number(b.id));
}

const CS =
  /informatik|computer science|data science|k(ü|u)nstliche intelligenz|software|it-sicherheit|cyber|artificial intelligence/i;
const NOT_BUSINESS_CORE =
  /tourismus|sport|event|medien|immobilien|automobil|gesundheit|hotel|kultur|bau/i;
const BUSINESS_CORE =
  /betriebswirtschaft|volkswirtschaft|wirtschaftswissenschaft|international business|management|finanz|finance|accounting|\bbwl\b|\bvwl\b|wirtschaft/i;
const EXCLUDED = /lehramt/i;

// The API's own study-field group decides the field; names refine it. `low` is a judgement call.
export function classifyGerman(
  group: (typeof BA_GROUPS)[number],
  name: string,
  subjects: readonly string[],
): { field: BaField; confidence: "high" | "low" } | null {
  const text = `${name} ${subjects.join(" ")}`;
  if (EXCLUDED.test(text)) return null;
  if (CS.test(text)) return { field: "computer-science", confidence: "high" };
  if (group.field === "business-economics") {
    return {
      field: group.field,
      confidence: BUSINESS_CORE.test(text) && !NOT_BUSINESS_CORE.test(text) ? "high" : "low",
    };
  }
  return { field: group.field, confidence: "high" };
}

const STOP = new Set([
  "und",
  "fur",
  "der",
  "die",
  "das",
  "des",
  "im",
  "am",
  "in",
  "an",
  "zu",
  "staatlich",
  "anerkannt",
  "gmbh",
  "ggmbh",
  "e",
  "v",
  "of",
  "the",
  "for",
]);

export function tokens(name: string): Set<string> {
  return new Set(
    nameKey(name)
      .split(" ")
      .filter((t) => t !== "" && !STOP.has(t)),
  );
}

export type HrkLite = { slug: string; name: string; city: string; alias?: string };

// Links a provider to an HRK institution: equal names, or one name's words contained in the
// other's with the same town. Ambiguity means no match, so a wrong institution is never guessed.
export function matchHrk(
  provider: string,
  city: string,
  institutions: readonly HrkLite[],
): HrkLite | null {
  const wanted = tokens(provider);
  if (wanted.size === 0) return null;
  // The official name and the everyday short name ("RWTH Aachen") are both valid ways to be named.
  const names = (i: HrkLite) => [tokens(i.name), ...(i.alias ? [tokens(i.alias)] : [])];
  // The same town, or the institution's town named in the provider's own name (a campus elsewhere).
  const sameCity = (i: HrkLite) => city !== "" && nameKey(i.city) === nameKey(city);
  const cityInName = (i: HrkLite) => {
    const cityTokens = tokens(i.city);
    return cityTokens.size > 0 && [...cityTokens].every((x) => wanted.has(x));
  };
  const equal = institutions.filter((i) =>
    names(i).some((t) => t.size === wanted.size && [...t].every((x) => wanted.has(x))),
  );
  if (equal.length === 1) return equal[0] ?? null;
  const contained = institutions.filter(
    (i) =>
      (sameCity(i) || cityInName(i)) &&
      names(i).some((t) => {
        const [small, big] = t.size <= wanted.size ? [t, wanted] : [wanted, t];
        return small.size >= 2 && [...small].every((x) => big.has(x));
      }),
  );
  return contained.length === 1 ? (contained[0] ?? null) : null;
}

export function baUnitSlug(p: Pick<BaProgramme, "provider" | "providerId" | "city">): string {
  return `de-${slugify(p.provider, 40)}-ba${p.providerId}-${slugify(p.city)}`;
}
