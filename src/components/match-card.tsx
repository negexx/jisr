// Shared, no "use client": needs the namespaces matchCard, costBreakdown, reasonList and every namespace of its parts (MatchStatusBadge, DeadlineStatus, SourceBadge, CostBreakdown, ReasonList) plus domain.cost and domain.route. The caller passes `monthsLabel` already formatted.
import { ChevronRight, CircleHelp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import type { FactRef } from "@/domain/types";
import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/lib/format";
import type { MatchCardModel } from "@/lib/journey/matches-view";
import { formatList, languageName } from "@/lib/journey/reasons";
import { CostBreakdown, withoutBidiMarks } from "./cost-breakdown";
import { DeadlineStatus } from "./deadline-status";
import { LocalizedDataText } from "./localized-data-text";
import { MatchStatusBadge } from "./match-status-badge";
import { ReasonList } from "./reason-list";
import { SourceBadge } from "./source-badge";
import { buttonVariants } from "./ui/button";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="flex flex-col gap-1.5">{children}</dd>
    </div>
  );
}

function ToCheck({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-base text-muted-foreground">
      <CircleHelp aria-hidden="true" className="mt-[0.2rem] size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function channelFact(factRefs: readonly FactRef[]): FactRef | undefined {
  return factRefs.find((fact) => fact.record.startsWith("application-channels/"));
}

export function MatchCard({ model, monthsLabel }: { model: MatchCardModel; monthsLabel: string }) {
  const locale = useLocale();
  const t = useTranslations("matchCard");
  const tCost = useTranslations("domain.cost");
  const tRoute = useTranslations();
  const titleId = `match-${model.slug}-title`;
  const href = `/programs/${model.slug}`;

  const languages = model.teachingLanguages.value;
  const languageNames =
    languages === null
      ? null
      : formatList(
          languages.map((code) => languageName(code, locale)),
          "conjunction",
          locale,
        );
  const tuition = model.tuition.value;
  const channel = model.applicationChannel;
  const channelSource = channelFact(model.factRefs);

  return (
    <article
      aria-labelledby={titleId}
      data-group={model.group}
      data-slug={model.slug}
      className="flex flex-col gap-5 rounded-xl border border-border bg-card p-4 text-card-foreground md:p-6"
    >
      <header className="flex flex-col gap-2">
        <h3 id={titleId} className="text-lg font-semibold">
          <Link href={href} className="text-primary underline-offset-4 hover:underline">
            <bdi>{model.name}</bdi>
          </Link>
        </h3>
        <p className="text-base text-muted-foreground">
          <bdi>
            {t("institutionCity", { institution: model.institutionName, city: model.cityName })}
          </bdi>
        </p>
        <div className="flex flex-col gap-1.5">
          <p className="flex flex-wrap items-baseline gap-x-2 text-base">
            <span className="font-medium">{t(`level.${model.level}`)}</span>
            {languageNames === null ? (
              <span className="text-muted-foreground">{t("languagesUnknown")}</span>
            ) : (
              <>
                <span className="text-muted-foreground">{t("taughtIn")}</span>
                <span>{languageNames}</span>
              </>
            )}
          </p>
          {languageNames === null ? null : (
            <SourceBadge meta={model.teachingLanguages} variant="compact" />
          )}
        </div>
        <MatchStatusBadge group={model.group} />
        {model.summaryText === null ? null : (
          <p className="hidden max-w-prose text-base text-muted-foreground md:line-clamp-2">
            <LocalizedDataText value={model.summaryText} />
          </p>
        )}
      </header>

      <dl className="grid gap-x-8 gap-y-5 md:grid-cols-2">
        <Fact label={tCost("category.tuition")}>
          {tuition === null ? (
            <ToCheck>{tCost("missingLine")}</ToCheck>
          ) : (
            <>
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-base font-medium tabular-nums">
                  <bdi dir="ltr">
                    {withoutBidiMarks(formatMoney(tuition.amountMinor, tuition.currency, locale))}
                  </bdi>
                </span>
                <small className="text-sm text-muted-foreground">
                  {tCost(`per.${tuition.period}`)}
                </small>
              </p>
              <SourceBadge meta={model.tuition} variant="compact" />
            </>
          )}
        </Fact>
        <Fact label={t("facts.estimatedCost")}>
          <CostBreakdown
            cost={model.cost}
            budgetProvided={model.cost.budgetFit !== "unknown"}
            monthsLabel={monthsLabel}
            variant="compact"
          />
        </Fact>
        <Fact label={t("facts.deadline")}>
          <DeadlineStatus intake={model.intake} />
        </Fact>
        <Fact label={t("facts.application")}>
          {channel === null ? (
            <ToCheck>{tCost("missingLine")}</ToCheck>
          ) : (
            <>
              <p className="text-base font-medium">
                <bdi>{channel.name}</bdi>
              </p>
              <p className="text-base text-muted-foreground">{t(`channel.kind.${channel.kind}`)}</p>
              <p className="text-base text-muted-foreground">
                {t(
                  channel.accountRequired === null
                    ? "channel.account.unknown"
                    : channel.accountRequired
                      ? "channel.account.required"
                      : "channel.account.notRequired",
                )}
              </p>
              {channelSource === undefined ? null : (
                <SourceBadge meta={channelSource} variant="compact" />
              )}
            </>
          )}
        </Fact>
      </dl>

      <div className="flex flex-col gap-2">
        {model.group === "foundation" ? (
          <p data-testid="route-text" className="max-w-prose text-base">
            {tRoute(model.routeKey)}
          </p>
        ) : null}
        <ReasonList reasons={model.topReasons} heading={t("reasonsHeading")} headingLevel={4} />
      </div>

      <Link href={href} className={buttonVariants({ variant: "outline", className: "w-fit" })}>
        {t("seeDetails")}
        <span className="sr-only">
          <bdi>{model.name}</bdi>
        </span>
        <ChevronRight aria-hidden="true" className="rtl:rotate-180" />
      </Link>
    </article>
  );
}
