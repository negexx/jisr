import { Info } from "lucide-react";
import { useTranslations } from "next-intl";

import { DISCLOSURE_SUMMARY_CLASS, DisclosureChevron } from "@/components/disclosure-chevron";
import { MatchCard } from "@/components/match-card";
import type { AppLocale } from "@/i18n/routing";
import type { MatchCardModel, MatchGroup } from "@/lib/journey/matches-view";
import { cn } from "@/lib/utils";

import { displayNumber } from "./display-number";
import { PagedList } from "./paged-list";

const HEADING_CLASS = "text-2xl font-light tracking-tight text-balance";

function Cards({
  cards,
  budgetProvided,
  locale,
  routeExplained,
}: {
  cards: readonly MatchCardModel[];
  budgetProvided: boolean;
  locale: AppLocale;
  routeExplained: boolean;
}) {
  return (
    <PagedList
      locale={locale}
      items={cards.map((card) => (
        <li key={card.slug}>
          <MatchCard
            model={card}
            budgetProvided={budgetProvided}
            monthsLabel={displayNumber(card.cost.academicYearMonths, locale)}
            routeExplained={routeExplained}
          />
        </li>
      ))}
    />
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

// Fixed ids: they hold no profile value and let the counts line jump to a group.
export function groupHeadingId(group: MatchGroup): string {
  return `matches-group-${group}`;
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
  const headingId = groupHeadingId(group);
  const count = displayNumber(cards.length, locale);
  const title = {
    ok: () => tStatus("satisfied"),
    check: () => tStatus("check"),
    foundation: () => tFoundation("title"),
    failed: () => tStatus("not_satisfied"),
  }[group]();
  // The count sits in its own isolated span so a Latin number never reorders Arabic words.
  const heading = (
    <h2 id={headingId} className={HEADING_CLASS}>
      {title}{" "}
      <span className="font-normal text-muted-foreground">
        <bdi>({count})</bdi>
      </span>
    </h2>
  );

  if (group === "failed") {
    return (
      <section aria-labelledby={headingId} data-group={group} className="flex flex-col gap-2">
        {heading}
        <details className="flex flex-col">
          <summary className={cn(DISCLOSURE_SUMMARY_CLASS, "min-h-12 w-full")}>
            <DisclosureChevron />
            <span className="underline underline-offset-4">{tFailed("show", { count })}</span>
          </summary>
          <div className="flex flex-col gap-4 pt-3">
            <p className="max-w-prose text-base text-muted-foreground">{tFailed("note")}</p>
            <Cards
              cards={cards}
              budgetProvided={budgetProvided}
              locale={locale}
              routeExplained={false}
            />
          </div>
        </details>
      </section>
    );
  }

  return (
    <section aria-labelledby={headingId} data-group={group} className="flex flex-col gap-4">
      {heading}
      {group === "foundation" ? <FoundationExplanation /> : null}
      <Cards
        cards={cards}
        budgetProvided={budgetProvided}
        locale={locale}
        routeExplained={group === "foundation"}
      />
    </section>
  );
}
