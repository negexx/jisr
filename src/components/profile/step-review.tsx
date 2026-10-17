import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useSessionHint } from "@/lib/auth/session-hint";
import { formatGrade, parseLocaleDecimal } from "@/lib/format";
import { gradingScaleFor } from "@/lib/profile/form/options";
import type { StepId } from "@/lib/profile/form/state";

import { languageName, lookupName } from "./display-names";
import { OfficialName } from "./official-name";
import { useStep } from "./step-context";

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
  const signedIn = useSessionHint();
  const { form, core, text, locale } = useStep();
  const { credential } = form;
  const notGiven = t("review.notGiven");

  const scale = gradingScaleFor(form, core);
  const gradeText = (typed: string): string => {
    const value = parseLocaleDecimal(typed);
    return value === null || scale === undefined ? typed : formatGrade(value, scale, locale);
  };
  const orNotGiven = (value: string, show: (value: string) => ReactNode): ReactNode =>
    value.trim() === "" ? notGiven : show(value);

  const country = (code: string) => lookupName(core, text, "country", code).label;
  const type = core.credentialTypes.find((candidate) => candidate.slug === credential.type);
  const track = type?.tracks.find((candidate) => candidate.slug === credential.track);

  return (
    <div className="flex flex-col gap-8">
      <Section step="bac">
        <Row label={t("fields.nationality.label")}>{orNotGiven(form.nationality, country)}</Row>
        <Row label={t("fields.credentialCountry.label")}>
          {orNotGiven(credential.country, country)}
        </Row>
        <Row label={t("fields.credentialType.label")}>
          {type === undefined ? (
            notGiven
          ) : (
            <OfficialName name={type.name} gloss={text(type.gloss)} />
          )}
        </Row>
        <Row label={t("fields.track.label")}>
          {track === undefined ? (
            notGiven
          ) : (
            <OfficialName
              name={track.name}
              gloss={track.gloss === null ? undefined : text(track.gloss)}
            />
          )}
        </Row>
        <Row label={t("fields.status.legend")}>
          {credential.status === "" ? notGiven : t(`fields.status.${credential.status}`)}
        </Row>
        <Row label={t("fields.overall.label")}>
          {orNotGiven(credential.overall, (value) => (
            <bdi dir="ltr">{gradeText(value.trim())}</bdi>
          ))}
        </Row>
        <Row label={t("fields.subjects.legend")}>
          {credential.subjects.length === 0 ? (
            notGiven
          ) : (
            <ul className="flex flex-col gap-1">
              {credential.subjects.map((row, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
                <li key={index} className="flex justify-between gap-4">
                  <span>
                    {orNotGiven(
                      row.subject,
                      (slug) => lookupName(core, text, "subject", slug).label,
                    )}
                  </span>
                  {orNotGiven(row.grade, (value) => (
                    <bdi dir="ltr">{gradeText(value.trim())}</bdi>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </Row>
        <Row label={t("fields.years.label")}>
          {orNotGiven(form.priorHigherEducationYears, (years) => years.trim())}
        </Row>
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
                : t.rich("review.levelWithCertificate", {
                    level,
                    certificate: certificate.name,
                    cert: (chunks) => <bdi>{chunks}</bdi>,
                  })}
            </Row>
          );
        })}
      </Section>

      <section
        aria-labelledby="review-save-title"
        className="flex flex-col gap-2 rounded-xl bg-secondary px-4 py-4"
      >
        <h3 id="review-save-title" className="text-lg font-semibold">
          {t("review.saveTitle")}
        </h3>
        <p className="max-w-[65ch] text-base">
          {t(signedIn ? "review.saveBodySignedIn" : "review.saveBody")}
        </p>
      </section>
    </div>
  );
}
