import "server-only";

// Build-time sections of the program page: every fact as published with its SourceBadge, nothing that depends on the clock or on the student.
import { CircleAlert, CircleHelp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { CostBreakdown } from "@/components/cost-breakdown";
import { ExternalLink, sourceHostname } from "@/components/external-link";
import { LocalizedDataText } from "@/components/localized-data-text";
import { SourceBadge } from "@/components/source-badge";
import type { IsoDate } from "@/data-schema/dates";
import type { FactMeta, Scholarship } from "@/data-schema/resolved";
import type { CostEstimate } from "@/domain/types";
import type { AppLocale } from "@/i18n/routing";
import { formatDate, formatMoney, formatMoneyRange } from "@/lib/format";
import { formatList, formatNumber, languageName, type Params } from "@/lib/journey/reasons";
import { describeCoverage, describeRule } from "@/lib/journey/requirements";
import type { ProgramPageData } from "@/lib/snapshot/server";

export const SECTION_IDS = [
  "overview",
  "requirements",
  "tuition",
  "costs",
  "deadline",
  "procedure",
  "documents",
  "scholarships",
  "links",
  "verified",
] as const;
export type SectionId = (typeof SECTION_IDS)[number];

function useDomainText() {
  // Rule, coverage and cost keys come from the journey view models, not literals, so the typed catalogue cannot check them.
  return useTranslations() as unknown as (key: string, params?: Params) => string;
}

export function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  const t = useTranslations("program.sections");
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="flex scroll-mt-6 flex-col gap-4">
      <h2 id={`${id}-heading`} className="text-xl font-semibold">
        {t(id)}
      </h2>
      {children}
    </section>
  );
}

function ToCheck({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-base text-muted-foreground">
      <CircleHelp aria-hidden="true" className="mt-[0.2rem] size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="flex flex-col gap-1.5">{children}</dd>
    </div>
  );
}

export function institutionAndCity(data: ProgramPageData) {
  return {
    institution: data.institution?.name ?? data.program.institution,
    city: data.institution?.city.name ?? data.program.city,
  };
}

export function languagesOf(data: ProgramPageData, locale: AppLocale): string | null {
  const codes = data.program.teachingLanguages.value;
  return codes === null
    ? null
    : formatList(
        codes.map((code) => languageName(code, locale)),
        "conjunction",
        locale,
      );
}

export function durationParams(data: ProgramPageData, locale: AppLocale) {
  const years = data.program.durationYears.value;
  const count = years === null ? null : formatNumber(years, locale);
  return years === null || count === null ? null : { years, count };
}

export function OverviewSection({ data }: { data: ProgramPageData }) {
  const locale = useLocale();
  const t = useTranslations("program");
  const { program, institution } = data;
  const languages = languagesOf(data, locale);
  const duration = durationParams(data, locale);

  return (
    <Section id="overview">
      {data.text(program.summary) === undefined ? null : (
        <p className="max-w-prose text-base">
          <LocalizedDataText value={data.text(program.summary)} />
        </p>
      )}
      <dl className="grid gap-x-8 gap-y-5 md:grid-cols-2">
        <Fact label={t("overview.institution")}>
          {institution === null ? (
            <ToCheck>
              <bdi>{program.institution}</bdi>
            </ToCheck>
          ) : (
            <>
              <p className="text-base">
                <bdi className="font-medium">{institution.name}</bdi>
                <span className="text-muted-foreground">
                  {", "}
                  <bdi>{institution.city.name}</bdi>
                </span>
              </p>
              <p className="text-sm text-muted-foreground">
                {t(`overview.institutionType.${institution.type}`)}
              </p>
              <SourceBadge meta={institution.fact} />
            </>
          )}
        </Fact>
        <Fact label={t("overview.duration")}>
          {duration === null ? (
            <ToCheck>{t("header.durationUnknown")}</ToCheck>
          ) : (
            <p className="text-base">{t("header.duration", duration)}</p>
          )}
          <SourceBadge meta={program.durationYears} />
        </Fact>
        <Fact label={t("overview.languages")}>
          {languages === null ? (
            <ToCheck>{t("header.languagesUnknown")}</ToCheck>
          ) : (
            <p className="text-base">{languages}</p>
          )}
          <SourceBadge meta={program.teachingLanguages} />
        </Fact>
      </dl>
    </Section>
  );
}

export function RequirementsSection({ data }: { data: ProgramPageData }) {
  const locale = useLocale();
  const t = useTranslations("program.requirements");
  const tDomain = useDomainText();
  const { requirements } = data.program;
  const context = { locale, core: data.core, text: data.text };
  const coverage = describeCoverage(requirements);

  return (
    <Section id="requirements">
      <p className="max-w-prose text-base text-muted-foreground">{t("intro")}</p>
      {requirements.coverage === "partial" ? (
        <p
          data-testid="coverage-partial"
          className="flex max-w-prose items-start gap-2 rounded-lg border border-border bg-muted px-4 py-3 text-base"
        >
          <CircleAlert aria-hidden="true" className="mt-[0.2rem] size-4 shrink-0" />
          <span>{tDomain(coverage.key)}</span>
        </p>
      ) : null}
      <SourceBadge meta={requirements.fact} variant="full" />
      {requirements.rules.length === 0 ? (
        <ToCheck>{t("none")}</ToCheck>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {requirements.rules.map((rule) => {
            const view = describeRule(rule, context);
            return (
              <li
                key={rule.id}
                data-testid="rule"
                data-kind={rule.kind}
                className="flex flex-col gap-1.5 py-4"
              >
                <p className="text-sm font-medium text-muted-foreground">
                  {tDomain(view.kindKey, view.params)}
                </p>
                <p className="max-w-prose text-base">{tDomain(view.key, view.params)}</p>
                {view.details.map((detail) => (
                  <p key={detail.key} className="max-w-prose text-base">
                    {tDomain(detail.key, detail.params)}
                  </p>
                ))}
                {view.note === undefined ? null : (
                  <p className="max-w-prose text-base">
                    <LocalizedDataText value={{ text: view.note.text, note: view.note.textNote }} />
                  </p>
                )}
                <SourceBadge meta={view.fact} />
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

export function TuitionSection({ data }: { data: ProgramPageData }) {
  const locale = useLocale();
  const tDomain = useDomainText();
  const tuition = data.program.tuition.value;

  return (
    <Section id="tuition">
      {tuition === null ? (
        <ToCheck>{tDomain("domain.cost.missingLine")}</ToCheck>
      ) : (
        <p data-testid="tuition-amount" className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-lg font-semibold tabular-nums">
            <bdi dir="ltr">{formatMoney(tuition.amountMinor, tuition.currency, locale)}</bdi>
          </span>{" "}
          <span className="text-base text-muted-foreground">
            {tDomain(`domain.cost.per.${tuition.period}`)}
          </span>
        </p>
      )}
      <SourceBadge meta={data.program.tuition} variant="full" />
    </Section>
  );
}

export function CostsSection({ cost }: { cost: CostEstimate }) {
  const locale = useLocale();
  const t = useTranslations("program.costs");
  return (
    <Section id="costs">
      <CostBreakdown
        cost={cost}
        budgetProvided={false}
        monthsLabel={
          formatNumber(cost.academicYearMonths, locale) ?? String(cost.academicYearMonths)
        }
        caption={t("caption")}
      />
    </Section>
  );
}

function PublishedDate({
  date,
  known,
  unknown,
}: {
  date: IsoDate | null;
  known: (date: string) => string;
  unknown: string;
}) {
  const locale = useLocale();
  return (
    <p className="text-base">
      {date === null ? (
        <span className="text-muted-foreground">{unknown}</span>
      ) : (
        <bdi>
          <time dateTime={date}>{known(formatDate(date, locale))}</time>
        </bdi>
      )}
    </p>
  );
}

export function DeadlineSection({ data }: { data: ProgramPageData }) {
  const t = useTranslations("program.deadline");
  const intakes = data.program.intakes.value ?? [];

  return (
    <Section id="deadline">
      {intakes.length === 0 ? (
        <ToCheck>{t("none")}</ToCheck>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{t("asPublished")}</p>
          <ul className="divide-y divide-border border-y border-border">
            {intakes.map((intake) => (
              <li
                key={`${intake.startDate}|${intake.applicationOpens}|${intake.applicationDeadline}`}
                data-testid="intake"
                className="flex flex-col gap-1 py-3"
              >
                <PublishedDate
                  date={intake.applicationDeadline}
                  known={(date) => t("deadline", { date })}
                  unknown={t("deadlineUnknown")}
                />
                <PublishedDate
                  date={intake.applicationOpens}
                  known={(date) => t("opens", { date })}
                  unknown={t("opensUnknown")}
                />
                <PublishedDate
                  date={intake.startDate}
                  known={(date) => t("start", { date })}
                  unknown={t("startUnknown")}
                />
              </li>
            ))}
          </ul>
        </>
      )}
      <SourceBadge meta={data.program.intakes} />
    </Section>
  );
}

export function ProcedureSection({ data }: { data: ProgramPageData }) {
  const t = useTranslations("program.procedure");
  const tCard = useTranslations("matchCard.channel");
  const channel = data.applicationChannel;

  return (
    <Section id="procedure">
      {channel === null ? (
        <>
          <ToCheck>{t("missing")}</ToCheck>
          <SourceBadge meta={data.program.applicationChannel} />
        </>
      ) : (
        <dl className="flex flex-col gap-4">
          <Fact label={t("where")}>
            <p className="flex flex-wrap items-baseline gap-x-3 text-base">
              <bdi className="font-medium">{channel.name}</bdi>
              <span className="text-muted-foreground">{tCard(`kind.${channel.kind}`)}</span>
            </p>
            <p className="text-base text-muted-foreground">
              {tCard(
                channel.accountRequired === null
                  ? "account.unknown"
                  : channel.accountRequired
                    ? "account.required"
                    : "account.notRequired",
              )}
            </p>
            {data.text(channel.summary) === undefined ? null : (
              <p className="max-w-prose text-base">
                <LocalizedDataText value={data.text(channel.summary)} />
              </p>
            )}
            <ExternalLink href={channel.url} className="min-h-11 w-fit text-base md:min-h-8">
              {t("open")}
            </ExternalLink>
            <SourceBadge meta={data.program.applicationChannel} />
            <SourceBadge meta={channel.fact} />
          </Fact>
        </dl>
      )}
    </Section>
  );
}

export function DocumentsSection({ data }: { data: ProgramPageData }) {
  const t = useTranslations("program.documents");
  const documents = data.program.documents.value;

  return (
    <Section id="documents">
      {documents === null ? (
        <ToCheck>{t("missing")}</ToCheck>
      ) : documents.length === 0 ? (
        <ToCheck>{t("none")}</ToCheck>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {documents.map((doc) => (
            <li key={doc.slug} data-testid="document" className="flex flex-col gap-1 py-3">
              <p className="text-base font-medium">
                <LocalizedDataText value={data.text(doc.name)} fallback={<bdi>{doc.slug}</bdi>} />
              </p>
              <p className="text-base text-muted-foreground">
                {t(
                  doc.translationRequired === null
                    ? "translation.unknown"
                    : doc.translationRequired
                      ? "translation.yes"
                      : "translation.no",
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
      <SourceBadge meta={data.program.documents} />
    </Section>
  );
}

function sameSource(a: FactMeta, b: FactMeta): boolean {
  return (
    a.source_url === b.source_url &&
    a.info_kind === b.info_kind &&
    a.last_verified_at === b.last_verified_at &&
    a.class === b.class
  );
}

function ScholarshipItem({
  scholarship,
  data,
}: {
  scholarship: Scholarship;
  data: ProgramPageData;
}) {
  const locale = useLocale();
  const t = useTranslations("program.scholarships");
  const support = scholarship.support.value;
  const amount = support?.amount ?? null;
  const countries = formatList(
    scholarship.eligibleNationalities.map((code) => {
      const country = data.core.countries.find((c) => c.code === code);
      return (country === undefined ? undefined : data.text(country.name)?.text) ?? code;
    }),
    "disjunction",
    locale,
  );
  const covers = formatList(
    (support?.covers ?? []).map((cover) => t(`cover.${cover}`)),
    "conjunction",
    locale,
  );
  const deadline = scholarship.deadline.value;
  // One badge when both facts share a source, date and kind: two identical badges would only add noise.
  const sharedSource = sameSource(scholarship.support, scholarship.deadline);

  return (
    <li
      id={`scholarship-${scholarship.slug}`}
      data-testid="scholarship"
      className="flex scroll-mt-6 flex-col gap-1.5 py-4"
    >
      <h3 className="text-lg font-semibold">
        <bdi>{scholarship.name}</bdi>
      </h3>
      <p className="text-sm text-muted-foreground">
        {t("provider", { provider: scholarship.provider })}
      </p>
      <p data-testid="scholarship-eligibility" className="text-base font-medium">
        {countries === null ? t("openToEveryone") : t("nationals", { countries })}
      </p>
      {data.text(scholarship.summary) === undefined ? null : (
        <p className="max-w-prose text-base">
          <LocalizedDataText value={data.text(scholarship.summary)} />
        </p>
      )}
      <p className="text-base">
        {amount === null ? (
          <span className="text-muted-foreground">{t("support.unknown")}</span>
        ) : (
          t.rich(`support.${amount.per}`, {
            amount: formatMoneyRange(amount.min, amount.max, amount.currency, locale),
            money: (chunks) => (
              <bdi dir="ltr" className="tabular-nums">
                {chunks}
              </bdi>
            ),
          })
        )}
      </p>
      {covers === null ? null : <p className="text-base">{t("covers", { items: covers })}</p>}
      <p className="text-base">
        {deadline === null ? (
          <span className="text-muted-foreground">{t("deadlineUnknown")}</span>
        ) : (
          <bdi>
            <time dateTime={deadline}>{t("deadline", { date: formatDate(deadline, locale) })}</time>
          </bdi>
        )}
      </p>
      <ExternalLink href={scholarship.officialUrl} className="min-h-11 w-fit text-base md:min-h-8">
        {t("link")}
      </ExternalLink>
      <SourceBadge meta={scholarship.support} />
      {sharedSource ? null : <SourceBadge meta={scholarship.deadline} />}
    </li>
  );
}

export function ScholarshipsSection({ data }: { data: ProgramPageData }) {
  const t = useTranslations("program.scholarships");
  return (
    <Section id="scholarships">
      {data.scholarships.length === 0 ? (
        <p className="text-base text-muted-foreground">{t("none")}</p>
      ) : (
        <>
          <p className="max-w-prose text-base text-muted-foreground">{t("intro")}</p>
          <ul className="divide-y divide-border border-y border-border">
            {data.scholarships.map((scholarship) => (
              <ScholarshipItem key={scholarship.slug} scholarship={scholarship} data={data} />
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}

function LinkItem({ href, label }: { href: string; label: string }) {
  const hostname = sourceHostname(href);
  return (
    <li className="flex flex-wrap items-center gap-x-3">
      <ExternalLink href={href} className="min-h-11 text-base md:min-h-8">
        {label}
      </ExternalLink>
      {hostname === null ? null : (
        <bdi dir="ltr" className="text-sm text-muted-foreground">
          {hostname}
        </bdi>
      )}
    </li>
  );
}

export function LinksSection({ data }: { data: ProgramPageData }) {
  const t = useTranslations("program.links");
  return (
    <Section id="links">
      <ul className="flex flex-col gap-1">
        <LinkItem href={data.program.officialUrl} label={t("program")} />
        {data.institution === null ? null : (
          <LinkItem href={data.institution.website} label={t("institution")} />
        )}
        {data.applicationChannel === null ? null : (
          <LinkItem href={data.applicationChannel.url} label={t("channel")} />
        )}
      </ul>
    </Section>
  );
}

export function VerifiedSection({ oldest }: { oldest: IsoDate | null }) {
  const locale = useLocale();
  const t = useTranslations("program.verified");
  return (
    <Section id="verified">
      {oldest === null ? null : (
        <p className="text-base">
          <bdi>
            <time dateTime={oldest}>{t("oldest", { date: formatDate(oldest, locale) })}</time>
          </bdi>
        </p>
      )}
      <p className="text-sm text-muted-foreground">{t("each")}</p>
    </Section>
  );
}
