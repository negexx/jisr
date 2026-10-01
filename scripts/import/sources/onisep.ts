import { z } from "zod";

import { fetchJson } from "../http";

// ONISEP "Idéo - Structures d'enseignement supérieur" (official, ODbL: attribute ONISEP and share
// alike if a derived database is published). A directory of establishments with the parent
// university of each sub-unit (IUT campus, UFR), identified by UAI code, not by name.
export const ONISEP_STRUCTURES_URL =
  "https://api.opendata.onisep.fr/downloads/5fa586da5c4b6/5fa586da5c4b6.json";

const RowSchema = z.object({
  code_uai: z.string(),
  nom: z.string(),
  type_detablissement: z.string(),
  statut: z.string(),
  universite_de_rattachement_libelle_et_uai: z.string(),
});
export type OnisepStructure = z.infer<typeof RowSchema>;

export type OnisepIndex = Map<string, OnisepStructure>;

export async function fetchOnisepIndex(): Promise<OnisepIndex> {
  const rows = z.array(RowSchema).parse(await fetchJson(ONISEP_STRUCTURES_URL));
  const index: OnisepIndex = new Map();
  for (const row of rows) if (row.code_uai !== "") index.set(row.code_uai, row);
  return index;
}

// "Université de Brest (0292473F)" -> ["0292473F"]; several parents are tolerated.
export function parentUais(structure: OnisepStructure | undefined): string[] {
  const text = structure?.universite_de_rattachement_libelle_et_uai ?? "";
  return [...text.matchAll(/\(([0-9]{7}[A-Z])\)/g)].flatMap((m) =>
    m[1] === undefined ? [] : [m[1]],
  );
}

// ONISEP says "public", "privé" or "privé sous contrat"; Parcoursup says "Public" or "Privé ...".
export function sectorOf(label: string): "public" | "private" | null {
  const key = label.trim().toLowerCase();
  if (key === "public") return "public";
  if (key.startsWith("priv")) return "private";
  return null;
}
