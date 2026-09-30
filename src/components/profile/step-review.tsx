import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { formatGrade, intlLocale, parseLocaleDecimal } from "@/lib/format";
import { gradingScaleFor } from "@/lib/profile/form/options";
import type { StepId } from "@/lib/profile/form/state";

import { languageName, textOr } from "./display-names";
import { useStep } from "./step-context";

const WHOLE_AMOUNT = /^[0-9]{1,7}$/;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-border py-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-base">{children}</dd>
    </div>
  );
}

function Section({ step, children }: { step: Exclude<StepId, "review">; children: ReactNode }) {
  const t = useTranslations("profile");
  const { goToStep } = useStep();
  const title = t(`steps.${step}.title`);
  return (
    <section aria-label={title} className="flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        <Button
          type="button"
          variant="ghost"
          aria-label={t("review.editStep", { step: title })}
          onClick={() => goToStep(step)}
        >
          {t("common.edit")}
        </Button>
      </div>
      <dl>{children}</dl>
    </section>
  );
}

export function StepReview() {
  const t = useTranslations("profile");
  const { form, core, text, locale } = useStep();
  const { credential, budget } = form;
  const notGiven = t("review.notGiven");
  const list = new Intl.ListFormat(intlLocale(locale), { type: "conjunction" });

  const scale = gradingScaleFor(form, core);
  const gradeText = (typed: string): string => {
    const value = parseLocaleDecimal(typed);
    return value === null || scale === undefined ? typed : formatGrade(value, scale, locale);
  };

  const country = (code: string): string => {
    const found = core.countries.find((candidate) => candidate.code === code);
    return found === undefined ? code : textOr(text, found.name, code);
  };
  const type = core.credentialTypes.find((candidate) => candidate.slug === credential.type);
  const track = type?.tracks.find((candidate) => candidate.slug === credential.track);
  const withGloss = (name: string, gloss: string | null | undefined): ReactNode => {
    const glossText = gloss === null || gloss === undefined ? undefined : text(gloss)?.text;
    return (
      <>
        <bdi>{name}</bdi>
        {glossText === undefined ? null : (
          <span className="text-muted-foreground"> ({glossText})</span>
        )}
      </>
    );
  };

  const subjectName = (slug: string): string => {
    const found = core.subjects.find((candidate) => candidate.slug === slug);
    return found === undefined ? slug : textOr(text, found.name, slug);
  };
  const fieldNames = form.fields.map((slug) => {
    const found = core.fields.find((candidate) => candidate.slug === slug);
    return found === undefined ? slug : textOr(text, found.name, slug);
  });

  const amountLine = (): ReactNode => {
    const amount = budget.amount.trim();
    if (amount === "") return notGiven;
    if (!WHOLE_AMOUNT.test(amount)) return <bdi dir="ltr">{amount}</bdi>;
    // Whole amounts only: no cents for a budget the student typed as a whole number.
    const formatted = new Intl.NumberFormat(intlLocale(locale), {
      style: "currency",
      currency: budget.currency,
      maximumFractionDigits: 0,
    }).format(Number(amount));
    return t("review.budgetLine", {
      amount: formatted,
      period: budget.period,
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <Section step="bac">
        <Row label={t("fields.nationality.label")}>{country(form.nationality)}</Row>
        <Row label={t("fields.credentialCountry.label")}>{country(credential.country)}</Row>
        <Row label={t("fields.credentialType.label")}>
          {type === undefined ? notGiven : withGloss(type.name, type.gloss)}
        </Row>
        <Row label={t("fields.track.label")}>
          {track === undefined ? notGiven : withGloss(track.name, track.gloss)}
        </Row>
        <Row label={t("fields.status.legend")}>
          {credential.status === "" ? notGiven : t(`fields.status.${credential.status}`)}
        </Row>
        <Row label={t("fields.overall.label")}>
          {credential.overall.trim() === "" ? (
            notGiven
          ) : (
            <bdi dir="ltr">{gradeText(credential.overall.trim())}</bdi>
          )}
        </Row>
        <Row label={t("fields.subjects.legend")}>
          {credential.subjects.length === 0 ? (
            notGiven
          ) : (
            <ul className="flex flex-col gap-1">
              {credential.subjects.map((row, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
                <li key={index} className="flex justify-between gap-4">
                  <span>{subjectName(row.subject)}</span>
                  <bdi dir="ltr">{gradeText(row.grade.trim())}</bdi>
                </li>
              ))}
            </ul>
          )}
        </Row>
        <Row label={t("fields.years.label")}>{form.priorHigherEducationYears}</Row>
      </Section>

      <Section step="languages">
        {form.languages.map((row, index) => {
          const certificate = core.languageCertificates.find(
            (candidate) => candidate.slug === row.certificate,
          );
          const level = row.level === "" ? notGiven : t(`fields.levels.${row.level}`);
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
            <Row key={index} label={languageName(row.language, locale)}>
              {certificate === undefined
                ? level
                : t("review.levelWithCertificate", { level, certificate: certificate.name })}
            </Row>
          );
        })}
      </Section>

      <Section step="preferences">
        <Row label={t("fields.fieldsOfStudy.legend")}>
          {fieldNames.length === 0 ? notGiven : list.format(fieldNames)}
        </Row>
        <Row label={t("fields.studyLanguages.legend")}>
          {form.studyLanguages.length === 0
            ? t("review.noPreference")
            : list.format(form.studyLanguages.map((code) => languageName(code, locale)))}
        </Row>
        <Row label={t("fields.destinations.legend")}>
          {form.destinations.length === 0
            ? t("review.allCountries")
            : list.format(form.destinations.map(country))}
        </Row>
        <Row label={t("fields.institution.legend")}>
          {t(`fields.institution.${form.institutionType}`)}
        </Row>
      </Section>

      <Section step="budget">
        <Row label={t("fields.budget.amount.label")}>{amountLine()}</Row>
        {budget.currency === "MAD" && budget.amount.trim() !== "" ? (
          <Row label={t("fields.budget.currency.label")}>{t("fields.budget.madNote")}</Row>
        ) : null}
      </Section>

      <section
        aria-labelledby="review-save-title"
        className="flex flex-col gap-2 rounded-lg bg-muted px-4 py-4"
      >
        <h3 id="review-save-title" className="text-lg font-semibold">
          {t("review.saveTitle")}
        </h3>
        <p className="max-w-[65ch] text-base">{t("review.saveBody")}</p>
      </section>
    </div>
  );
}
