import "server-only";

// The program page as built: static facts plus three client leaves (freshness banner, personal result, next deadline) that render nothing clock- or student-dependent on the server.
import { CircleAlert, CircleHelp } from "lucide-react";
import { NextIntlClientProvider, useLocale, useTranslations } from "next-intl";

import { DISCLOSURE_SUMMARY_CLASS, DisclosureChevron } from "@/components/disclosure-chevron";
import type { IsoDate } from "@/data-schema/dates";
import type { FactMeta } from "@/data-schema/resolved";
import { estimateCost } from "@/domain/costs";
import type { CostEstimate } from "@/domain/types";
import type { AppLocale } from "@/i18n/routing";
import { formatMoneyRange } from "@/lib/format";
import type { MessageTree } from "@/lib/i18n/client-messages";
import { oldestVerified } from "@/lib/journey/freshness";
import { pageFacts } from "@/lib/journey/page-facts";
import { formatNumber } from "@/lib/journey/reasons";
import type { ProgramPageData } from "@/lib/snapshot/server";

import { PageFreshnessBanner } from "./page-freshness-banner";
import { PersonalMatch } from "./personal-match";
import { ProgramDeadline } from "./program-deadline";
import {
  CostsSection,
  DeadlineSection,
  DocumentsSection,
  durationParams,
  InstitutionCity,
  LinksSection,
  languagesOf,
  OverviewSection,
  ProcedureSection,
  RequirementsSection,
  ScholarshipsSection,
  SECTION_IDS,
  TuitionSection,
  VerifiedSection,
} from "./program-sections";

// estimateCost and pageFacts require a `now` only to stamp a freshness on the FactRefs they return;
// which facts and lines they pick does not depend on it. The stamp never leaves the server:
// SourceBadge hands the client leaf plain FactMeta and the banner gets FactMeta below, and both
// recompute freshness from the browser's clock.
const UNUSED_NOW: IsoDate = "2000-01-01";

// The banner needs only what freshness is computed from; identical facts are sent once.
function bannerFacts(data: ProgramPageData): FactMeta[] {
  const seen = new Map<string, FactMeta>();
  for (const { meta } of pageFacts(data, UNUSED_NOW)) {
    const fact: FactMeta = {
      source_url: meta.source_url,
      info_kind: meta.info_kind,
      last_verified_at: meta.last_verified_at,
      class: meta.class,
    };
    seen.set(`${fact.source_url}|${fact.info_kind}|${fact.last_verified_at}|${fact.class}`, fact);
  }
  return [...seen.values()];
}

function ProgramHeader({ data }: { data: ProgramPageData }) {
  const locale = useLocale();
  const t = useTranslations("program.header");
  const languages = languagesOf(data, locale);
  const duration = durationParams(data, locale);

  return (
    <header className="flex flex-col gap-2">
      <h1 className="text-2xl font-bold tracking-tight text-balance">
        <bdi>{data.program.name}</bdi>
      </h1>
      <p className="text-pretty text-lg text-muted-foreground">
        <InstitutionCity data={data} />
      </p>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-base">
        <li className="font-medium">{t(`level.${data.program.level}`)}</li>
        <li>{duration === null ? t("durationUnknown") : t("duration", duration)}</li>
        <li>{languages === null ? t("languagesUnknown") : t("taughtIn", { languages })}</li>
      </ul>
    </header>
  );
}

function JumpList() {
  const t = useTranslations("program");
  return (
    <details className="rounded-lg border border-border px-4 lg:hidden">
      <summary className={DISCLOSURE_SUMMARY_CLASS}>
        <DisclosureChevron />
        <span className="text-base font-medium">{t("jumpList.title")}</span>
      </summary>
      <nav aria-label={t("jumpList.label")} className="pb-2">
        <ul className="flex flex-col">
          {SECTION_IDS.map((id) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="flex min-h-11 items-center text-base text-primary underline underline-offset-4"
              >
                {t(`sections.${id}`)}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </details>
  );
}

type CostSummaryText = {
  heading: string;
  estimateTag: string;
  missingLine: string;
  partialTotal: string;
  tenMonthNote: string;
  details: string;
};

// Rendered inside the client leaves' provider, so it takes its strings as props rather than reading namespaces that provider does not carry.
function CostSummary({
  cost,
  text,
  locale,
}: {
  cost: CostEstimate;
  text: CostSummaryText;
  locale: AppLocale;
}) {
  return (
    <section
      aria-labelledby="aside-cost-heading"
      className="flex flex-col gap-2 border-t border-border pt-4"
    >
      <h3 id="aside-cost-heading" className="text-base font-semibold">
        {text.heading}
      </h3>
      {cost.totals.length === 0 ? (
        <p className="flex items-start gap-2 text-base text-muted-foreground">
          <CircleHelp aria-hidden="true" className="mt-[0.2rem] size-4 shrink-0" />
          <span>{text.missingLine}</span>
        </p>
      ) : (
        cost.totals.map((total) => (
          <p
            key={total.currency}
            data-testid="aside-cost-total"
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
          >
            <span className="rounded-full border border-dashed border-kind-estimate bg-kind-estimate-bg px-2.5 py-0.5 text-sm font-medium text-kind-estimate">
              {text.estimateTag}
            </span>
            <span className="text-lg font-semibold tabular-nums">
              <bdi dir="ltr">{formatMoneyRange(total.min, total.max, total.currency, locale)}</bdi>
            </span>
          </p>
        ))
      )}
      {cost.complete || cost.totals.length === 0 ? null : (
        <p className="flex items-start gap-2 text-base">
          <CircleAlert aria-hidden="true" className="mt-[0.2rem] size-4 shrink-0" />
          <span>{text.partialTotal}</span>
        </p>
      )}
      <p className="text-sm text-muted-foreground">{text.tenMonthNote}</p>
      <a
        href="#costs"
        className="flex min-h-11 w-fit items-center text-base text-primary underline underline-offset-4 md:min-h-8"
      >
        {text.details}
      </a>
    </section>
  );
}

export function ProgramPageView({
  data,
  locale,
  clientMessages,
}: {
  data: ProgramPageData;
  locale: AppLocale;
  // Only the namespaces of PROGRAM_CLIENT_NAMESPACES: the client leaves' strings, nothing else.
  clientMessages: MessageTree;
}) {
  const t = useTranslations("program");
  const tCost = useTranslations("domain.cost");
  const { program } = data;
  const cost = estimateCost({
    program,
    costProfiles: data.costProfiles,
    budget: null,
    now: UNUSED_NOW,
  });
  const facts = bannerFacts(data);
  const months = formatNumber(cost.academicYearMonths, locale) ?? String(cost.academicYearMonths);
  const costText: CostSummaryText = {
    heading: t("aside.cost"),
    estimateTag: tCost("estimateTag"),
    missingLine: tCost("missingLine"),
    partialTotal: tCost("partialTotal"),
    tenMonthNote: tCost("tenMonthNote", { months }),
    details: t("aside.costDetails"),
  };

  return (
    <div className="flex flex-col gap-6">
      <ProgramHeader data={data} />
      <PageFreshnessBanner
        facts={facts}
        labels={{
          aging: t("banner.aging"),
          stale: t("banner.stale"),
          check: t("banner.check"),
        }}
      />
      <JumpList />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start lg:gap-12">
        <aside
          aria-label={t("aside.label")}
          className="rounded-xl border border-border bg-card text-card-foreground lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto"
        >
          <NextIntlClientProvider locale={locale} messages={clientMessages}>
            <section
              id="your-result"
              aria-labelledby="your-result-heading"
              className="flex scroll-mt-6 flex-col gap-3 p-4 md:p-5"
            >
              <h2 id="your-result-heading" className="text-lg font-semibold">
                {t("personal.heading")}
              </h2>
              <PersonalMatch
                program={{ slug: program.slug, country: program.country, field: program.field }}
                snapshotVersion={data.snapshotVersion}
                scholarshipSlugs={data.scholarships.map((s) => s.slug)}
                locale={locale}
              >
                <section
                  aria-labelledby="aside-deadline-heading"
                  className="flex flex-col gap-2 border-t border-border pt-4"
                >
                  <h3 id="aside-deadline-heading" className="text-base font-semibold">
                    {t("aside.deadline")}
                  </h3>
                  <ProgramDeadline program={program} />
                </section>
                <CostSummary cost={cost} text={costText} locale={locale} />
              </PersonalMatch>
            </section>
          </NextIntlClientProvider>
        </aside>
        <div className="flex min-w-0 flex-col gap-12 lg:col-start-1 lg:row-start-1">
          <OverviewSection data={data} />
          <RequirementsSection data={data} />
          <TuitionSection data={data} />
          <CostsSection cost={cost} />
          <DeadlineSection data={data} />
          <ProcedureSection data={data} />
          <DocumentsSection data={data} />
          <ScholarshipsSection data={data} />
          <LinksSection data={data} />
          <VerifiedSection oldest={oldestVerified(facts)} />
        </div>
      </div>
    </div>
  );
}
