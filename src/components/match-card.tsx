// Shared, no "use client": needs the namespaces matchCard, costBreakdown, reasonList and every namespace of its parts (MatchStatusBadge, DeadlineStatus, SourceBadge, CostBreakdown, ReasonList) plus domain.cost and domain.route. The caller passes `monthsLabel` already formatted.
import { ChevronRight, CircleHelp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId } from "react";

import type { FactRef } from "@/domain/types";
import { Link } from "@/i18n/navigation";
import { formatTuition } from "@/lib/format";
import type { MatchCardModel } from "@/lib/journey/matches-view";
import { formatList, languageName } from "@/lib/journey/reasons";
import { cn } from "@/lib/utils";
import { CostBreakdown } from "./cost-breakdown";
import { DeadlineStatus } from "./deadline-status";
import { ExternalLink, sourceHostname } from "./external-link";
import { LocalizedDataText } from "./localized-data-text";
import { MatchStatusBadge } from "./match-status-badge";
import { ReasonList } from "./reason-list";
import { SaveProgramButton } from "./save-program-button";
import { SourceBadge } from "./source-badge";
import { TuitionBasisNote } from "./tuition-basis-note";
import { buttonVariants } from "./ui/button";
import { useSaveCopy } from "./use-save-copy";

function Fact({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
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

export function MatchCard({
  model,
  budgetProvided,
  monthsLabel,
  routeExplained = false,
  aliases,
}: {
  model: MatchCardModel;
  // The profile has a budget: the domain still answers "unknown" when it cannot compare, and that is said too.
  budgetProvided: boolean;
  monthsLabel: string;
  // The page already explains the foundation route (a box above the group): skip the long text here and keep the short reason.
  routeExplained?: boolean;
  // Former slug to current slug, so a save made before a rename shows as saved.
  aliases?: Readonly<Record<string, string>> | undefined;
}) {
  const locale = useLocale();
  const t = useTranslations("matchCard");
  const tCost = useTranslations("domain.cost");
  const tRoute = useTranslations();
  const saveCopy = useSaveCopy();
  const titleId = `${useId()}-title`;
  // Its links are not prefetched: a list of cards would fetch every program page's payload and the
  // program chunks on the student's mobile data, for pages they may never open.
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
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm transition-shadow hover:shadow-md md:p-6"
    >
      <header className="flex flex-col gap-1.5">
        <h3 id={titleId} className="text-lg font-semibold">
          <Link
            href={href}
            prefetch={false}
            className="text-primary underline-offset-4 hover:underline"
          >
            <bdi>{model.name}</bdi>
          </Link>
        </h3>
        <p className="text-pretty text-base text-muted-foreground">
          {t.rich("institutionCity", {
            institution: model.institutionName,
            city: model.cityName,
            place: (chunks) => <bdi className="inline-block max-w-full">{chunks}</bdi>,
          })}
        </p>
        {model.institutionWebsite === null ? null : (
          <p className="flex flex-wrap items-center gap-x-3 text-sm">
            <ExternalLink href={model.institutionWebsite} className="min-h-8">
              {t("institutionWebsite")}
            </ExternalLink>
            <span className="text-muted-foreground">
              <bdi dir="ltr">{sourceHostname(model.institutionWebsite)}</bdi>
            </span>
          </p>
        )}
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
          <div
            data-testid="match-summary"
            className="hidden max-w-prose text-base text-muted-foreground md:block"
          >
            <LocalizedDataText value={model.summaryText} />
          </div>
        )}
      </header>

      <dl className="grid gap-x-8 gap-y-3 md:grid-cols-2">
        <Fact label={tCost("category.tuition")}>
          {tuition === null ? (
            <ToCheck>{tCost("missingLine")}</ToCheck>
          ) : (
            <>
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-base font-medium tabular-nums">
                  <bdi dir="ltr">{formatTuition(tuition, locale)}</bdi>
                </span>
                <small className="text-sm text-muted-foreground">
                  {tCost(`per.${tuition.period}`)}
                </small>
              </p>
              <TuitionBasisNote tuition={tuition} />
              <SourceBadge meta={model.tuition} variant="compact" />
            </>
          )}
        </Fact>
        <Fact
          label={t("facts.deadline")}
          className="border-t border-border pt-3 md:border-t-0 md:pt-0"
        >
          <DeadlineStatus intake={model.intake} />
        </Fact>
        <Fact label={t("facts.application")} className="border-t border-border pt-3 md:col-span-2">
          {channel === null ? (
            <ToCheck>{tCost("missingLine")}</ToCheck>
          ) : (
            <>
              <p className="flex flex-wrap items-baseline gap-x-3 text-base">
                <span className="font-medium">
                  <bdi>{channel.name}</bdi>
                </span>
                <span className="text-muted-foreground">{t(`channel.kind.${channel.kind}`)}</span>
              </p>
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
        <Fact
          label={t("facts.estimatedCost")}
          className="border-t border-border pt-3 md:col-span-2"
        >
          <CostBreakdown
            cost={model.cost}
            budgetProvided={budgetProvided}
            monthsLabel={monthsLabel}
            variant="compact"
          />
        </Fact>
      </dl>

      <div className="flex flex-col gap-2">
        {model.group === "foundation" && !routeExplained ? (
          <p data-testid="route-text" className="max-w-prose text-base">
            {tRoute(model.routeKey)}
          </p>
        ) : null}
        <ReasonList
          reasons={model.topReasons}
          heading={t("reasonsHeading")}
          headingLevel={4}
          collapseFrom={3}
          compact
          sources="grouped"
          bodyHiddenFor={model.group === "foundation" ? ["route_foundation"] : []}
        />
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <Link
          href={href}
          prefetch={false}
          className={buttonVariants({ variant: "outline", className: "w-fit" })}
        >
          {t("seeDetails")}
          <span className="sr-only">
            <bdi>{model.name}</bdi>
          </span>
          <ChevronRight aria-hidden="true" className="rtl:rotate-180" />
        </Link>
        <SaveProgramButton
          program={{ slug: model.slug, country: model.country, field: model.field }}
          snapshotVersion={model.snapshotVersion}
          programName={model.name}
          copy={saveCopy}
          aliases={aliases}
        />
      </div>
    </article>
  );
}
