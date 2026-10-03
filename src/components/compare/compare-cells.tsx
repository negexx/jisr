// Shared, no "use client": needs the namespaces compare, matchCard, costBreakdown, reasonList, deadline, domain and the ones of its parts (SourceBadge, ExternalLink, MatchStatusBadge, DeadlineStatus, CostBreakdown, ReasonList). One component per comparison row; each renders the value of one program and nothing about the others.
import { CircleHelp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { CostBreakdown } from "@/components/cost-breakdown";
import { DeadlineStatus } from "@/components/deadline-status";
import { DISCLOSURE_SUMMARY_CLASS, DisclosureChevron } from "@/components/disclosure-chevron";
import { ExternalLink } from "@/components/external-link";
import { LocalizedDataText } from "@/components/localized-data-text";
import { MatchStatusBadge } from "@/components/match-status-badge";
import { displayNumber } from "@/components/matches/display-number";
import { ReasonList } from "@/components/reason-list";
import { SourceBadge } from "@/components/source-badge";
import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/lib/format";
import type { CompareRowId } from "@/lib/journey/compare-rows";
import type { CompareProgram } from "@/lib/journey/compare-view";
import { formatList, languageName } from "@/lib/journey/reasons";

export type CellProps = { program: CompareProgram; budgetProvided: boolean };

// An unknown value says so and sends the student to the source: it never shows a badge, because
// nothing is published to verify.
function ToCheck({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-base text-muted-foreground">
      <CircleHelp aria-hidden="true" className="mt-[0.2rem] size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

// First-strong isolates keep a Latin portal name from reordering the Arabic sentence around it (a
// message argument cannot hold a <bdi>).
function isolate(text: string): string {
  return `⁨${text}⁩`;
}

function ResultCell({ program }: CellProps) {
  const t = useTranslations("matchCard");
  const tRoute = useTranslations();
  return (
    <div className="flex flex-col gap-3">
      <MatchStatusBadge group={program.group} />
      {program.group === "foundation" ? (
        <p data-testid="route-text" className="text-base">
          {tRoute(program.routeKey)}
        </p>
      ) : null}
      <details data-slot="reasons">
        <summary className={DISCLOSURE_SUMMARY_CLASS}>
          <DisclosureChevron />
          <span className="text-base underline underline-offset-4">{t("reasonsHeading")}</span>
        </summary>
        <ReasonList
          reasons={program.reasons}
          compact
          sources="grouped"
          bodyHiddenFor={program.group === "foundation" ? ["route_foundation"] : []}
        />
      </details>
    </div>
  );
}

function TuitionCell({ program }: CellProps) {
  const locale = useLocale();
  const tCost = useTranslations("domain.cost");
  const tuition = program.tuition.value;
  if (tuition === null) return <ToCheck>{tCost("missingLine")}</ToCheck>;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-base font-medium tabular-nums">
          <bdi dir="ltr">{formatMoney(tuition.amountMinor, tuition.currency, locale)}</bdi>
        </span>
        <small className="text-sm text-muted-foreground">{tCost(`per.${tuition.period}`)}</small>
      </p>
      <SourceBadge meta={program.tuition} variant="compact" />
    </div>
  );
}

function CostCell({ program, budgetProvided }: CellProps) {
  const locale = useLocale();
  return (
    <CostBreakdown
      cost={program.cost}
      budgetProvided={budgetProvided}
      monthsLabel={displayNumber(program.cost.academicYearMonths, locale)}
      variant="compact"
    />
  );
}

function LanguageCell({ program }: CellProps) {
  const locale = useLocale();
  const t = useTranslations("compare.cells");
  const languages = program.teachingLanguages.value;
  if (languages === null) return <ToCheck>{t("languageUnknown")}</ToCheck>;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-base font-medium">
        {formatList(
          languages.map((code) => languageName(code, locale)),
          "conjunction",
          locale,
        )}
      </p>
      <SourceBadge meta={program.teachingLanguages} variant="compact" />
    </div>
  );
}

function DeadlineCell({ program }: CellProps) {
  return <DeadlineStatus intake={program.intake} />;
}

// The list holds only what the published nationality rules open to this student; the caveat that
// says so sits once under the row, not in every cell.
function ScholarshipsCell({ program }: CellProps) {
  const t = useTranslations("compare.scholarships");
  if (program.scholarships.length === 0) return <p className="text-base">{t("none")}</p>;
  return (
    <ul className="flex flex-col">
      {program.scholarships.map((scholarship) => (
        <li key={scholarship.slug}>
          <Link
            href={`/programs/${program.slug}#scholarship-${scholarship.slug}`}
            prefetch={false}
            className="inline-flex min-h-11 items-center text-base text-primary underline underline-offset-4 hover:no-underline md:min-h-8"
          >
            <bdi>{scholarship.name}</bdi>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function TranslationLine({ required }: { required: boolean | null }) {
  const t = useTranslations("compare.application.translation");
  return (
    <span className="text-sm text-muted-foreground">
      {t(required === null ? "unknown" : required ? "yes" : "no")}
    </span>
  );
}

function ApplicationCell({ program }: CellProps) {
  const t = useTranslations("compare.application");
  const tChannel = useTranslations("matchCard.channel");
  const { channel, documents } = program;
  return (
    <div className="flex flex-col gap-4">
      {channel === null ? (
        <ToCheck>{t("channelUnknown")}</ToCheck>
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="flex flex-wrap items-baseline gap-x-3 text-base">
            <span className="font-medium">
              <bdi>{channel.name}</bdi>
            </span>
            <span className="text-muted-foreground">{tChannel(`kind.${channel.kind}`)}</span>
          </p>
          <p className="text-base text-muted-foreground">
            {t(
              channel.accountRequired === null
                ? "account.unknown"
                : channel.accountRequired
                  ? "account.required"
                  : "account.notRequired",
            )}
          </p>
          <ExternalLink href={channel.url} className="min-h-11 w-fit text-base md:min-h-8">
            {t("applyOn", { name: isolate(channel.name) })}
          </ExternalLink>
          {program.channelFact === null ? null : (
            <SourceBadge meta={program.channelFact} variant="compact" />
          )}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium">{t("documents")}</p>
        {documents === null ? (
          <ToCheck>{t("documentsUnknown")}</ToCheck>
        ) : documents.length === 0 ? (
          <ToCheck>{t("documentsNone")}</ToCheck>
        ) : (
          <>
            <ul data-slot="documents" className="flex flex-col gap-2">
              {documents.map((document) => (
                <li key={document.slug} className="flex flex-col">
                  <span className="text-base">
                    <LocalizedDataText
                      value={document.name}
                      fallback={<bdi dir="ltr">{document.slug}</bdi>}
                    />
                  </span>
                  <TranslationLine required={document.translationRequired} />
                </li>
              ))}
            </ul>
            <SourceBadge meta={program.documentsMeta} variant="compact" />
          </>
        )}
      </div>
    </div>
  );
}

export const CELLS: Record<CompareRowId, (props: CellProps) => ReactNode> = {
  result: ResultCell,
  tuition: TuitionCell,
  cost: CostCell,
  language: LanguageCell,
  deadline: DeadlineCell,
  scholarships: ScholarshipsCell,
  application: ApplicationCell,
};
