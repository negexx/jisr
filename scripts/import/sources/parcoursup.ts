import { z } from "zod";

import { classifyField } from "../fields";
import { fetchJson } from "../http";
import type { ReviewRow, StagedRecord } from "../staging";
import { READ_SOURCE } from "../staging";
import { collapseSpaces, normalizeCityName, slugify } from "../text";
import type { EsrEstablishment } from "./esr";
import { ESR_REGISTER_URL, fetchEsrIndex, findParent } from "./esr";
import { fetchWebsitesByUai } from "./wikidata";

// Official open data of the French Ministry of Higher Education (Licence ouverte 2.0).
export const PARCOURSUP_DATASET_URL =
  "https://data.enseignementsup-recherche.gouv.fr/explore/dataset/fr-esr-parcoursup/";
const SESSION = "2025";

const RowSchema = z.object({
  contrat_etab: z.string(),
  cod_uai: z.string(),
  g_ea_lib_vx: z.string(),
  ville_etab: z.string(),
  lib_for_voe_ins: z.string(),
  fili: z.string(),
  fil_lib_voe_acc: z.string(),
  cod_aff_form: z.string(),
  lien_form_psup: z.string().nullable(),
});
type Row = z.infer<typeof RowSchema>;

function exportUrl(): string {
  const where = `session="${SESSION}" AND (fili="Licence" OR fili="BUT")`;
  const select =
    "contrat_etab,cod_uai,g_ea_lib_vx,ville_etab,lib_for_voe_ins,fili,fil_lib_voe_acc,cod_aff_form,lien_form_psup";
  const base = "https://data.enseignementsup-recherche.gouv.fr/api/explore/v2.1/catalog/datasets";
  return `${base}/fr-esr-parcoursup/exports/json?where=${encodeURIComponent(where)}&select=${select}`;
}

function institutionSlug(row: Row): string {
  return `fr-${slugify(row.g_ea_lib_vx, 40)}-${row.cod_uai.toLowerCase()}`;
}

function programSlug(row: Row, instSlug: string): string {
  const level = row.fili === "BUT" ? "but" : "licence";
  return `${instSlug}-${level}-${slugify(row.fil_lib_voe_acc, 28)}-${row.cod_aff_form}`;
}

const httpsOrNull = (url: string | null | undefined): string | null =>
  url?.startsWith("https://") === true ? url : null;

// A fact nobody has read yet: the placeholder info_kind makes `data:promote` refuse the record
// until a human has chosen the value (a real one, or an explicit null for "not published").
const unread = (source: string) => ({ value: null, source, info_kind: READ_SOURCE });

type Website = { url: string | null; confirmed: boolean; origin: string | null };

// Only an exact UAI match in the ministry's own register counts as confirmed; the other origins
// are candidates that a human must check (they keep the placeholder info_kind).
function resolveWebsite(
  row: Row,
  instName: string,
  esr: Awaited<ReturnType<typeof fetchEsrIndex>>,
  wikidata: ReadonlyMap<string, string[]>,
): Website {
  const exact = esr.byUai.get(row.cod_uai) ?? null;
  if (httpsOrNull(exact?.url) !== null) {
    return {
      url: httpsOrNull(exact?.url),
      confirmed: true,
      origin: "official ESR register (exact UAI match)",
    };
  }
  const fromWikidata =
    (wikidata.get(row.cod_uai) ?? []).map(httpsOrNull).find((u) => u !== null) ?? null;
  if (fromWikidata !== null) {
    return {
      url: fromWikidata,
      confirmed: false,
      origin: "Wikidata (UAI match), not an official register",
    };
  }
  const parent: EsrEstablishment | null = findParent(esr, instName);
  if (httpsOrNull(parent?.url) !== null) {
    return {
      url: httpsOrNull(parent?.url),
      confirmed: false,
      origin: `parent institution "${parent?.uo_lib}" in the ESR register, not this site's own page`,
    };
  }
  return { url: null, confirmed: false, origin: null };
}

export async function importFrance(): Promise<StagedRecord[]> {
  const rows = z.array(RowSchema).parse(await fetchJson(exportUrl()));
  const wikidata = await fetchWebsitesByUai();
  const esr = await fetchEsrIndex();
  const records: StagedRecord[] = [];
  const institutions = new Map<string, StagedRecord>();

  for (const row of [...rows].sort((a, b) => a.cod_aff_form.localeCompare(b.cod_aff_form))) {
    const match = classifyField(row.fil_lib_voe_acc);
    if (match === null) continue;

    const instSlug = institutionSlug(row);
    const city = normalizeCityName(row.ville_etab);
    const instName = collapseSpaces(row.g_ea_lib_vx);

    if (!institutions.has(instSlug)) {
      const site = resolveWebsite(row, instName, esr, wikidata);
      const todo =
        site.origin === null
          ? "website missing: find the official https site, then set info_kind: official"
          : site.confirmed
            ? ""
            : `website candidate from ${site.origin}: confirm it, then set info_kind: official`;
      institutions.set(instSlug, {
        collection: "institutions",
        id: instSlug,
        data: {
          slug: instSlug,
          name: instName,
          country: "FR",
          city: { slug: slugify(city), name: city },
          type: row.contrat_etab === "Public" ? "public" : "private",
          website: site.url,
          source: site.confirmed ? "esr" : "parcoursup",
          info_kind: site.confirmed ? "official" : READ_SOURCE,
          sources: site.confirmed
            ? { esr: { url: ESR_REGISTER_URL, last_verified_at: null } }
            : { parcoursup: { url: PARCOURSUP_DATASET_URL, last_verified_at: null } },
        },
        review: {
          kind: "institutions",
          slug: instSlug,
          name: instName,
          institution: "",
          city,
          field: "",
          confidence: "",
          officialUrl: site.url ?? "",
          todo,
        },
      });
    }

    const slug = programSlug(row, instSlug);
    // The programme's own Parcoursup page is what a reviewer reads, so it is the source.
    const page = httpsOrNull(row.lien_form_psup) ?? PARCOURSUP_DATASET_URL;
    const todo = [
      "read the programme page: durationYears, teachingLanguages, tuition, intakes, documents, requirements and the application channel for applicants from Morocco (set each info_kind)",
      ...(match.confidence === "low"
        ? ["field is a judgement call: check the programme content"]
        : []),
      ...(/distanc/i.test(row.lib_for_voe_ins)
        ? ["distance-learning programme: check it suits a student abroad"]
        : []),
    ];
    const review: ReviewRow = {
      kind: "programs",
      slug,
      name: row.lib_for_voe_ins,
      institution: instName,
      city,
      field: match.field,
      confidence: match.confidence,
      officialUrl: page,
      todo: todo.join("; "),
    };
    records.push({
      collection: "programs",
      id: slug,
      data: {
        slug,
        institution: instSlug,
        country: "FR",
        city: slugify(city),
        field: match.field,
        level: "bachelor",
        name: row.lib_for_voe_ins,
        summary: {
          fr: {
            text: `${row.lib_for_voe_ins}, ${instName} (${city}). Fiche officielle Parcoursup.`.slice(
              0,
              400,
            ),
            status: "draft",
          },
        },
        officialUrl: page,
        durationYears: unread("fiche"),
        teachingLanguages: unread("fiche"),
        tuition: unread("fiche"),
        intakes: unread("fiche"),
        // Parcoursup lists the programme, but Moroccan Bac holders abroad usually apply through
        // Etudes en France first: the dataset cannot tell, so a human sets the channel.
        applicationChannel: unread("fiche"),
        documents: unread("fiche"),
        requirements: { coverage: "partial", source: "fiche", info_kind: READ_SOURCE, rules: [] },
        scholarships: [],
        sources: { fiche: { url: page, last_verified_at: null } },
      },
      review,
    });
  }

  records.push({
    collection: "application-channels",
    id: "fr-parcoursup",
    data: {
      slug: "fr-parcoursup",
      name: "Parcoursup",
      country: "FR",
      kind: "national_portal",
      url: "https://www.parcoursup.gouv.fr/",
      accountRequired: null,
      summary: {
        fr: {
          text: "Plateforme nationale de candidature en première année de Licence et de BUT.",
          status: "draft",
        },
      },
      source: "main",
      info_kind: READ_SOURCE,
      sources: { main: { url: "https://www.parcoursup.gouv.fr/", last_verified_at: null } },
    },
    review: {
      kind: "application-channels",
      slug: "fr-parcoursup",
      name: "Parcoursup",
      institution: "",
      city: "",
      field: "",
      confidence: "",
      officialUrl: "https://www.parcoursup.gouv.fr/",
      todo: "confirm how applicants from Morocco apply (Etudes en France / Campus France before Parcoursup) and whether an account is required",
    },
  });

  return [...institutions.values(), ...records];
}
