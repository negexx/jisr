import "server-only";

// Server-only, programme page: the city list stays out of every client bundle (matches, profile). Needs the namespaces costBreakdown and externalLink.
// Not a SourceBadge fact: no Numbeo figure is shown, the student is only pointed to a crowdsourced site.
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { CostCategory, CostEstimate } from "@/domain/types";
import type { AppLocale } from "@/i18n/routing";
import { numbeoLinkView } from "@/lib/numbeo-links";
import { ExternalLink } from "./external-link";

export type NumbeoPlace = { country: string; citySlug: string; cityName: string };

const LIVING_CATEGORIES: readonly CostCategory[] = ["housing", "food", "transport"];
const bdi = (chunks: ReactNode) => <bdi>{chunks}</bdi>;

// Shown only when a living-cost line (housing, food, transport) has no figure.
export function NumbeoLink({ cost, place }: { cost: CostEstimate; place: NumbeoPlace }) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("costBreakdown");
  const livingLineMissing = cost.lines.some(
    (line) => line.status === "missing" && LIVING_CATEGORIES.includes(line.category),
  );
  const link = livingLineMissing
    ? numbeoLinkView(place.country, place.citySlug, place.cityName, locale)
    : null;
  if (link === null) return null;

  return (
    <div data-testid="numbeo-link" className="flex flex-col gap-0.5">
      <ExternalLink href={link.href} className="min-h-11 w-fit py-1 text-base md:min-h-8">
        {link.kind === "city"
          ? t.rich("numbeoCity", { city: link.place, place: bdi })
          : t.rich("numbeoCountry", { country: link.place, place: bdi })}
      </ExternalLink>
      <p className="max-w-prose text-sm text-muted-foreground">{t("numbeoNote")}</p>
    </div>
  );
}
