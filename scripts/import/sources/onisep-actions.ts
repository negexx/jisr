import { z } from "zod";

import { fetchJson } from "../http";

// ONISEP "Idéo - Actions de formation initiale, enseignement supérieur" (ODbL). Each training
// offer names the establishment that delivers it, with that establishment's own website, which is
// often the IUT or faculty site rather than the parent university's.
export const ONISEP_ACTIONS_URL =
  "https://api.opendata.onisep.fr/downloads/605344579a7d7/605344579a7d7.json";

const RowSchema = z.object({
  ens_code_uai: z.string(),
  ens_site_web: z.string(),
});

// UAI -> the https website most offers of that establishment list (ties broken alphabetically).
export function ownSitesByUai(rows: readonly z.infer<typeof RowSchema>[]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const { ens_code_uai: uai, ens_site_web: raw } of rows) {
    const site = raw.trim();
    if (uai === "" || !site.startsWith("https://")) continue;
    const perUai = counts.get(uai) ?? new Map<string, number>();
    perUai.set(site, (perUai.get(site) ?? 0) + 1);
    counts.set(uai, perUai);
  }
  const out = new Map<string, string>();
  for (const [uai, perUai] of counts) {
    const best = [...perUai].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    if (best !== undefined) out.set(uai, best[0]);
  }
  return out;
}

export async function fetchOnisepOwnSites(): Promise<Map<string, string>> {
  const rows = z.array(RowSchema).parse(await fetchJson(ONISEP_ACTIONS_URL));
  return ownSitesByUai(rows);
}
