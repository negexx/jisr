import { z } from "zod";

import { fetchJson } from "../http";
import { nameKey } from "../text";

// "Principaux établissements d'enseignement supérieur": official register of the French Ministry
// of Higher Education (Licence ouverte 2.0), with UAI code, website and public/private sector.
const URL =
  "https://data.enseignementsup-recherche.gouv.fr/api/explore/v2.1/catalog/datasets/fr-esr-principaux-etablissements-enseignement-superieur/exports/json?select=uo_lib,url,uai,anciens_codes_uai,secteur_d_etablissement";

const RowSchema = z.object({
  uo_lib: z.string(),
  url: z.string().nullable(),
  uai: z.string().nullable(),
  anciens_codes_uai: z.array(z.string()).nullable(),
  secteur_d_etablissement: z.string().nullable(),
});
export type EsrEstablishment = z.infer<typeof RowSchema>;

export type EsrIndex = {
  byUai: Map<string, EsrEstablishment>;
  byNameKey: Map<string, EsrEstablishment>;
};

export async function fetchEsrIndex(): Promise<EsrIndex> {
  const rows = z.array(RowSchema).parse(await fetchJson(URL));
  const byUai = new Map<string, EsrEstablishment>();
  const byNameKey = new Map<string, EsrEstablishment>();
  for (const row of rows) {
    for (const code of [row.uai, ...(row.anciens_codes_uai ?? [])]) {
      if (code !== null && code !== "") byUai.set(code, row);
    }
    byNameKey.set(nameKey(row.uo_lib), row);
  }
  return { byUai, byNameKey };
}

// Parcoursup labels sub-units "I.U.T de Metz - Université de Lorraine": try each " - " part.
export function findParent(index: EsrIndex, institutionName: string): EsrEstablishment | null {
  for (const part of institutionName.split(" - ")) {
    const hit = index.byNameKey.get(nameKey(part));
    if (hit !== undefined) return hit;
  }
  return null;
}

export const ESR_REGISTER_URL =
  "https://data.enseignementsup-recherche.gouv.fr/explore/dataset/fr-esr-principaux-etablissements-enseignement-superieur/";
