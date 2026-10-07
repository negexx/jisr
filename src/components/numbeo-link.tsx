// Shared, no "use client": needs the namespaces costBreakdown and externalLink. Loaded lazily by CostBreakdown so its city list stays out of the first-load JS of every page.
// Not a SourceBadge fact: no Numbeo figure is shown, the student is only pointed to a crowdsourced site.
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { AppLocale } from "@/i18n/routing";
import { numbeoLinkView } from "@/lib/numbeo-links";
import { ExternalLink } from "./external-link";

export type NumbeoPlace = { country: string; citySlug: string; cityName: string };

const bdi = (chunks: ReactNode) => <bdi>{chunks}</bdi>;

export function NumbeoLink({ place: { country, citySlug, cityName } }: { place: NumbeoPlace }) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("costBreakdown");
  const link = numbeoLinkView(country, citySlug, cityName, locale);
  if (link === null) return null;

  return (
    <div data-testid="numbeo-link" className="flex flex-col gap-0.5 pt-2">
      <ExternalLink href={link.href} className="min-h-11 w-fit py-1 text-base md:min-h-8">
        {link.kind === "city"
          ? t.rich("numbeoCity", { city: link.place, place: bdi })
          : t.rich("numbeoCountry", { country: link.place, place: bdi })}
      </ExternalLink>
      <p className="max-w-prose text-sm text-muted-foreground">{t("numbeoNote")}</p>
    </div>
  );
}
