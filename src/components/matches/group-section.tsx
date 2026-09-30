import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";

import { DISCLOSURE_SUMMARY_CLASS, DisclosureChevron } from "@/components/disclosure-chevron";
import { MatchCard } from "@/components/match-card";
import type { AppLocale } from "@/i18n/routing";
import type { MatchCardModel, MatchGroup } from "@/lib/journey/matches-view";
import { formatNumber } from "@/lib/journey/reasons";
import { cn } from "@/lib/utils";

const HEADING_CLASS = "text-xl font-semibold text-balance";

function Cards({
  cards,
  budgetProvided,
  locale,
}: {
  cards: readonly MatchCardModel[];
  budgetProvided: boolean;
  locale: AppLocale;
}) {
  return (
    <ul className="flex flex-col gap-4">
      {cards.map((card) => (
        <li key={card.slug}>
          <MatchCard
            model={card}
            budgetProvided={budgetProvided}
            monthsLabel={formatNumber(card.cost.academicYearMonths, locale) ?? "?"}
          />
        </li>
      ))}
    </ul>
  );
}

// A full border in the check tokens, icon and text: never a side stripe.
function FoundationExplanation() {
  const t = useTranslations("matches.groups.foundation");
  const tRoute = useTranslations("domain.route");
  return (
    <div className="flex items-start gap-3 rounded-lg border border-status-check-border bg-status-check-bg p-4 text-status-check-fg">
      <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-status-check" />
      <div className="flex max-w-prose flex-col gap-1.5">
        <p className="text-base font-semibold">{t("boxTitle")}</p>
        <p className="text-base">{tRoute("foundation")}</p>
      </div>
    </div>
  );
}

export function GroupSection({
  group,
  cards,
  budgetProvided,
  locale,
}: {
  group: MatchGroup;
  cards: readonly MatchCardModel[];
  budgetProvided: boolean;
  locale: AppLocale;
}) {
  const tStatus = useTranslations("domain.status");
  const tFoundation = useTranslations("matches.groups.foundation");
  const tFailed = useTranslations("matches.groups.failed");
  const headingId = useId();
  const title = {
    ok: () => tStatus("satisfied"),
    check: () => tStatus("check"),
    foundation: () => tFoundation("title"),
    failed: () => tStatus("not_satisfied"),
  }[group]();
  // The count sits in its own isolated span so a Latin number never reorders Arabic words.
  const count = (
    <span className="ms-1 font-normal text-muted-foreground">
      <bdi>({formatNumber(cards.length, locale) ?? cards.length})</bdi>
    </span>
  );

  if (group === "failed") {
    return (
      <section aria-labelledby={headingId} data-group={group}>
        <details className="group flex flex-col">
          <summary className={cn(DISCLOSURE_SUMMARY_CLASS, "w-full text-foreground")}>
            <DisclosureChevron />
            <h2 id={headingId} className={HEADING_CLASS}>
              {title} {count}
            </h2>
          </summary>
          <div className="flex flex-col gap-4 pt-3">
            <p className="max-w-prose text-base text-muted-foreground">{tFailed("note")}</p>
            <Cards cards={cards} budgetProvided={budgetProvided} locale={locale} />
          </div>
        </details>
      </section>
    );
  }

  return (
    <section aria-labelledby={headingId} data-group={group} className="flex flex-col gap-4">
      <h2 id={headingId} className={HEADING_CLASS}>
        {title} {count}
      </h2>
      {group === "foundation" ? <FoundationExplanation /> : null}
      <Cards cards={cards} budgetProvided={budgetProvided} locale={locale} />
    </section>
  );
}
