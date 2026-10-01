import type { StagedRecord } from "../staging";
import { READ_SOURCE } from "../staging";
import { slugify } from "../text";
import { fetchInstitutions } from "./wikidata";

// Labels in the country's own language first, so official names are not translated.
const COUNTRIES = [
  { code: "DE", qid: "Q183", languages: "de,en" },
  { code: "NL", qid: "Q55", languages: "nl,en" },
] as const;

// Institution registry for Germany and the Netherlands from Wikidata (CC0). Wikidata is not an
// official source, so every record keeps the placeholder info_kind: a human confirms the name,
// city, type and website on an official page and replaces the source. Programmes are not in
// Wikidata and are not staged for these countries.
export async function importInstitutions(): Promise<StagedRecord[]> {
  const records: StagedRecord[] = [];
  for (const { code, qid, languages } of COUNTRIES) {
    for (const inst of await fetchInstitutions(qid, languages)) {
      // Wikidata lists many historical or obscure items; a website or ROR id marks a living one.
      if (inst.website === null && inst.ror === null) continue;
      // The Wikidata id keeps slugs unique and stable when two items share a name.
      const slug = `${code.toLowerCase()}-${slugify(inst.name, 40)}-${inst.qid.toLowerCase()}`;
      const website = inst.website?.startsWith("https://") === true ? inst.website : null;
      const todo = [
        "confirm name, city, type (public/private) and website on an official page, replace the Wikidata source with it, set info_kind: official",
        ...(inst.city === null ? ["city missing"] : []),
        ...(website === null && inst.website !== null
          ? [`Wikidata website is not https: ${inst.website}`]
          : []),
      ];
      records.push({
        collection: "institutions",
        id: slug,
        data: {
          slug,
          name: inst.name,
          country: code,
          city: inst.city === null ? null : { slug: slugify(inst.city), name: inst.city },
          type: null,
          website,
          source: "wikidata",
          info_kind: READ_SOURCE,
          sources: {
            wikidata: { url: `https://www.wikidata.org/wiki/${inst.qid}`, last_verified_at: null },
          },
        },
        review: {
          kind: "institutions",
          slug,
          name: inst.name,
          institution: "",
          city: inst.city ?? "",
          field: "",
          confidence: "",
          officialUrl: website ?? "",
          todo: todo.join("; "),
        },
      });
    }
  }
  return records;
}
