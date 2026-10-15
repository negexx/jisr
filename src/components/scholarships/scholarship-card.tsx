import "server-only";

import { CircleHelp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { DISCLOSURE_SUMMARY_CLASS, DisclosureChevron } from "@/components/disclosure-chevron";
import { ExternalLink } from "@/components/external-link";
import { LocalizedDataText } from "@/components/localized-data-text";
import { sameSource } from "@/components/program/program-sections";
import { SourceBadge } from "@/components/source-badge";
import { formatDate, formatMoneyRange } from "@/lib/format";
import { formatList, type Params } from "@/lib/journey/reasons";
import { describeRule } from "@/lib/journey/requirements";
import type { ScholarshipEntry } from "@/lib/scholarships/sections";
import type { ScholarshipsPageData } from "@/lib/snapshot/server";
import { cn } from "@/lib/utils";

import { NationalityCheck } from "./nationality-check";
import { ScholarshipProgrammes } from "./scholarship-programmes";

function ToCheck({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-base text-muted-foreground">
      <CircleHelp aria-hidden="true" className="mt-[0.2rem] size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function ScholarshipCard({
  entry,
  data,
  countryName,
}: {
  entry: ScholarshipEntry;
  data: ScholarshipsPageData;
  countryName: string;
}) {
  const locale = useLocale();
  const t = useTranslations("scholarshipsPage");
  const tProg = useTranslations("program.scholarships");
  // Rule and coverage keys come from the journey view models, not literals, so the typed catalogue cannot check them.
  const tDomain = useTranslations() as unknown as (key: string, params?: Params) => string;
  const { scholarship, scope } = entry;

  const support = scholarship.support.value;
  const amount = support?.amount ?? null;
  const covers = formatList(
    (support?.covers ?? []).map((cover) => tProg(`cover.${cover}`)),
    "conjunction",
    locale,
  );
  const deadline = scholarship.deadline.value;
  // One badge when both facts share a source, date, kind and class: two identical badges would only add noise.
  const sharedSource = sameSource(scholarship.support, scholarship.deadline);
  const countryNames = (codes: readonly string[]) =>
    formatList(
      codes.map((code) => {
        const country = data.core.countries.find((c) => c.code === code);
        return (country === undefined ? undefined : data.text(country.name)?.text) ?? code;
      }),
      "disjunction",
      locale,
    );
  const restricted = scholarship.eligibleNationalities;
  const nationals = countryNames(restricted);
  const context = { locale, core: data.core, text: data.text };
  const { requirements, documents } = scholarship;
  const summary = data.text(scholarship.summary);
  const howTo = data.text(scholarship.howToApply);

  return (
    <li
      id={`scholarship-${scholarship.slug}`}
      data-testid="scholarship-card"
      className="flex scroll-mt-6 flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md md:p-6"
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold text-balance">
          <bdi>{scholarship.name}</bdi>
        </h3>
        <p className="text-sm text-muted-foreground">
          {tProg("provider", { provider: scholarship.provider })}
        </p>
      </div>

      <div data-testid="scholarship-eligibility" className="flex flex-col gap-1.5">
        <p className="text-base font-medium">
          {nationals === null
            ? tProg("noNationalityRestriction")
            : tProg("nationals", { countries: nationals })}
        </p>
        {nationals === null ? null : (
          <NationalityCheck
            eligible={restricted}
            labels={{
              open: t("nationality.open"),
              closed: t("nationality.closed", { countries: nationals }),
              noProfile: t("nationality.noProfile"),
              caveat: t("nationality.caveat"),
            }}
          />
        )}
      </div>

      {summary === undefined ? null : (
        <p className="max-w-prose text-base">
          <LocalizedDataText value={summary} />
        </p>
      )}

      <div data-testid="scholarship-amount" className="flex flex-col gap-1.5">
        {amount === null ? (
          <ToCheck>{t("amount.unknown")}</ToCheck>
        ) : (
          <p className="text-base">
            {tProg.rich(`support.${amount.per}`, {
              amount: formatMoneyRange(amount.min, amount.max, amount.currency, locale),
              money: (chunks) => (
                <bdi dir="ltr" className="font-semibold tabular-nums">
                  {chunks}
                </bdi>
              ),
            })}
          </p>
        )}
        {covers === null ? null : <p className="text-base">{tProg("covers", { items: covers })}</p>}
        {amount === null && covers === null ? null : (
          <SourceBadge
            meta={scholarship.support}
            report={{ record: `scholarships/${scholarship.slug}`, path: "support" }}
          />
        )}
      </div>

      <div data-testid="scholarship-deadline" className="flex flex-col gap-1.5">
        {deadline === null ? (
          <ToCheck>{t("deadline.unknown")}</ToCheck>
        ) : (
          <>
            <p className="text-base">
              <bdi>
                <time dateTime={deadline}>
                  {t("deadline.known", { date: formatDate(deadline, locale) })}
                </time>
              </bdi>
            </p>
            {sharedSource && !(amount === null && covers === null) ? null : (
              <SourceBadge
                meta={scholarship.deadline}
                report={{ record: `scholarships/${scholarship.slug}`, path: "deadline" }}
              />
            )}
          </>
        )}
      </div>

      <ExternalLink href={scholarship.officialUrl} className="min-h-11 w-fit text-base md:min-h-8">
        {tProg("link")}
      </ExternalLink>

      <details className="rounded-xl border border-border bg-secondary px-4">
        <summary className={cn(DISCLOSURE_SUMMARY_CLASS, "min-h-11 w-full py-2")}>
          <DisclosureChevron />
          <span className="text-base font-medium">{t("details.summary")}</span>
        </summary>
        <div className="flex flex-col gap-5 pb-4 pt-1">
          <section className="flex flex-col gap-2">
            <h4 className="text-base font-semibold">{t("details.requirements")}</h4>
            {requirements.rules.length === 0 ? (
              <ToCheck>{t("requirements.none")}</ToCheck>
            ) : (
              <>
                {requirements.coverage === "partial" ? (
                  <p className="max-w-prose text-base text-muted-foreground">
                    {t("requirements.partial")}
                  </p>
                ) : null}
                <ul className="divide-y divide-border border-y border-border">
                  {requirements.rules.map((rule) => {
                    const view = describeRule(rule, context);
                    return (
                      <li key={rule.id} className="flex flex-col gap-1.5 py-3">
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
                            <LocalizedDataText
                              value={{ text: view.note.text, note: view.note.textNote }}
                            />
                          </p>
                        )}
                        <SourceBadge
                          meta={view.fact}
                          report={{
                            record: `scholarships/${scholarship.slug}`,
                            path: `requirements.rules.${rule.id}`,
                          }}
                        />
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h4 className="text-base font-semibold">{t("details.documents")}</h4>
            {documents.value === null ? (
              <ToCheck>{t("documents.missing")}</ToCheck>
            ) : documents.value.length === 0 ? (
              <ToCheck>{t("documents.none")}</ToCheck>
            ) : (
              <>
                <ul className="flex flex-col gap-1">
                  {documents.value.map((doc) => (
                    <li key={doc.slug} className="text-base">
                      <LocalizedDataText
                        value={data.text(doc.name)}
                        fallback={<bdi>{doc.slug}</bdi>}
                      />
                    </li>
                  ))}
                </ul>
                <SourceBadge
                  meta={documents}
                  report={{ record: `scholarships/${scholarship.slug}`, path: "documents" }}
                />
              </>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h4 className="text-base font-semibold">{t("details.howToApply")}</h4>
            {howTo === undefined ? (
              <ToCheck>{t("howToApply.missing")}</ToCheck>
            ) : (
              <p className="max-w-prose text-base">
                <LocalizedDataText value={howTo} />
              </p>
            )}
          </section>
        </div>
      </details>

      <ScholarshipProgrammes scope={scope} countryName={countryName} />
    </li>
  );
}
