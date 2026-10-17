import { useTranslations } from "next-intl";
import { type ReactNode, useId } from "react";

import { languageName, lookupName } from "@/components/profile/display-names";
import { Button } from "@/components/ui/button";
import type { MatchFilters } from "@/data-schema/match-filters";
import type { CoreShard } from "@/data-schema/snapshot";
import type { AppLocale } from "@/i18n/routing";
import { formatMoney } from "@/lib/format";
import { isEmptyFilters } from "@/lib/matches/filters";
import type { TextLookup } from "@/lib/snapshot/text";

// Phone: one wrapping strip of chips (labels stay for screen readers) and a Clear button. From lg:
// the labelled column in the sticky second column, like the profile strip it replaces.
function Chip({ children }: { children: ReactNode }) {
  return (
    <li className="rounded-full border border-border bg-background px-3 py-1 text-sm text-foreground">
      {children}
    </li>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 lg:flex-col lg:items-start">
      <dt className="sr-only text-sm font-medium text-muted-foreground lg:not-sr-only">{label}</dt>
      <dd>
        <ul className="flex flex-wrap gap-1.5">{children}</ul>
      </dd>
    </div>
  );
}

export function FilterSummary({
  filters,
  onClear,
  core,
  text,
  locale,
}: {
  filters: MatchFilters;
  onClear: () => void;
  core: CoreShard;
  text: TextLookup;
  locale: AppLocale;
}) {
  const t = useTranslations("matches.filters");
  const headingId = useId();
  if (isEmptyFilters(filters)) return null;

  return (
    <aside
      aria-labelledby={headingId}
      className="flex flex-wrap items-center gap-2 rounded-xl bg-secondary p-3 lg:grid lg:grid-cols-1 lg:gap-y-3 lg:p-4"
    >
      <h2 id={headingId} className="sr-only text-base font-semibold lg:not-sr-only">
        {t("title")}
      </h2>
      <dl className="flex flex-wrap gap-1.5 lg:flex-col lg:gap-3">
        {filters.fields.length === 0 ? null : (
          <Row label={t("field.legend")}>
            {filters.fields.map((slug) => (
              <Chip key={slug}>
                <bdi>{lookupName(core, text, "field", slug).label}</bdi>
              </Chip>
            ))}
          </Row>
        )}
        {filters.studyLanguages.length === 0 ? null : (
          <Row label={t("studyLanguage.legend")}>
            {filters.studyLanguages.map((code) => (
              <Chip key={code}>
                <bdi>{languageName(code, locale)}</bdi>
              </Chip>
            ))}
          </Row>
        )}
        {filters.destinations.length === 0 ? null : (
          <Row label={t("destination.legend")}>
            {filters.destinations.map((code) => (
              <Chip key={code}>
                <bdi>{lookupName(core, text, "country", code).label}</bdi>
              </Chip>
            ))}
          </Row>
        )}
        {filters.institutionType === "any" ? null : (
          <Row label={t("institution.legend")}>
            <Chip>
              <bdi>{t(`institution.${filters.institutionType}`)}</bdi>
            </Chip>
          </Row>
        )}
        {filters.budget === null ? null : (
          <Row label={t("budget.amount.label")}>
            <Chip>
              {t.rich(`budget.per.${filters.budget.period}`, {
                amount: formatMoney(filters.budget.amountMinor, filters.budget.currency, locale),
                // The amount keeps its own direction inside Arabic text.
                money: (chunks) => <bdi dir="ltr">{chunks}</bdi>,
              })}
            </Chip>
          </Row>
        )}
      </dl>
      <div className="lg:pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onClear}>
          {t("clear")}
        </Button>
      </div>
    </aside>
  );
}
