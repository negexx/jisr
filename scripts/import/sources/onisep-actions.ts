import { z } from "zod";

import { fetchJson } from "../http";
import { isOriginUrl, isUrlShortener } from "../text";

// ONISEP "Idéo - Actions de formation initiale, enseignement supérieur" (ODbL). Each training
// offer names the establishment that delivers it, with that establishment's own website, which is
// often the IUT or faculty site rather than the parent university's.
export const ONISEP_ACTIONS_URL =
  "https://api.opendata.onisep.fr/downloads/605344579a7d7/605344579a7d7.json";

const RowSchema = z.object({
  ens_code_uai: z.string(),
  ens_site_web: z.string(),
});

// UAI -> an https website the establishment lists: front-door addresses first, then the one most
// offers list, then alphabetical. URL shorteners are ignored.
export function ownSitesByUai(rows: readonly z.infer<typeof RowSchema>[]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const { ens_code_uai: uai, ens_site_web: raw } of rows) {
    const site = raw.trim();
    if (uai === "" || !site.startsWith("https://") || isUrlShortener(site)) continue;
    const perUai = counts.get(uai) ?? new Map<string, number>();
    perUai.set(site, (perUai.get(site) ?? 0) + 1);
    counts.set(uai, perUai);
  }
  const out = new Map<string, string>();
  for (const [uai, perUai] of counts) {
    // A front-door address beats a deep link (a programme page), whatever the counts say.
    const rank = (site: string) => (isOriginUrl(site) ? 0 : 1);
    const best = [...perUai].sort(
      (a, b) => rank(a[0]) - rank(b[0]) || b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0];
    if (best !== undefined) out.set(uai, best[0]);
  }
  return out;
}

export async function fetchOnisepOwnSites(): Promise<Map<string, string>> {
  const rows = z.array(RowSchema).parse(await fetchJson(ONISEP_ACTIONS_URL));
  return ownSitesByUai(rows);
}
