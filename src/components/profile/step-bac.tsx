import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  countryOptions,
  credentialTypeOptions,
  gradingScaleFor,
  MAX_SUBJECT_ROWS,
  originCountries,
  subjectOptions,
  trackOptions,
} from "@/lib/profile/form/options";
import { cn } from "@/lib/utils";

import { type Choice, hasNonLatinDigits, strongestNote, textOr } from "./display-names";
import {
  ChoiceGroup,
  CONTROL_CLASS,
  type ControlProps,
  Field,
  FieldGroup,
  NativeSelect,
  TextNote,
} from "./field";
import { fieldIdForPath } from "./issues";
import { useStep } from "./step-context";

const YEAR_CHOICES = ["0", "1", "2", "3"] as const;

function GradeControl({
  control,
  value,
  max,
  onChange,
}: {
  control: ControlProps;
  value: string;
  max: number | undefined;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("profile");
  return (
    <div className="flex">
      <div dir="ltr" className="flex items-center gap-2">
        <input
          {...control}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(CONTROL_CLASS, "w-28 text-start")}
        />
        {max === undefined ? null : (
          <bdi dir="ltr" className="text-base text-muted-foreground">
            {t("fields.overall.outOf", { max: String(max) })}
          </bdi>
        )}
      </div>
    </div>
  );
}

function DigitsHint({ value }: { value: string }) {
  const t = useTranslations("profile.errors");
  return hasNonLatinDigits(value) ? <span>{t("digitsHint")}</span> : null;
}

function SubjectRows() {
  const t = useTranslations("profile");
  const { form, update, core, text, errorFor, focusAfterRender } = useStep();
  const rows = form.credential.subjects;
  const scale = gradingScaleFor(form, core);
  const canAdd = rows.length < MAX_SUBJECT_ROWS && subjectOptions(form, core).length > 0;

  const addRow = () => {
    update((draft) => {
      draft.credential.subjects.push({ subject: "", grade: "" });
    });
    focusAfterRender(fieldIdForPath(`credential.subjects.${rows.length}.subject`));
  };
  const removeRow = (index: number) => {
    update((draft) => {
      draft.credential.subjects.splice(index, 1);
    });
    const remaining = rows.length - 1;
    focusAfterRender(
      remaining === 0
        ? "add-subject"
        : fieldIdForPath(`credential.subjects.${Math.min(index, remaining - 1)}.subject`),
    );
  };

  return (
    <FieldGroup
      path="credential.subjects"
      legend={t("fields.subjects.legend")}
      requirement="optional"
      hint={t("fields.subjects.hint")}
      error={errorFor("credential.subjects")}
    >
      <div className="flex flex-col gap-4">
        {rows.map((row, index) => {
          const offered = subjectOptions(form, core, index);
          const kept = offered.some((subject) => subject.slug === row.subject);
          const current = kept ? undefined : core.subjects.find((s) => s.slug === row.subject);
          const named = current === undefined ? offered : [...offered, current];
          const choices: Choice[] = [
            ...offered.map((subject) => ({
              value: subject.slug,
              label: textOr(text, subject.name, subject.slug),
            })),
            ...(current === undefined
              ? []
              : [
                  {
                    value: current.slug,
                    label: `${textOr(text, current.name, current.slug)} (${t("fields.subjects.notInTrack")})`,
                  },
                ]),
          ];
          // Rows have no identity of their own: they are edited in place and removed by position.
          const rowKey = `subject-row-${index}`;
          const number = String(index + 1);
          const base = `credential.subjects.${index}`;
          const gradeValue = row.grade;
          return (
            <fieldset
              key={rowKey}
              aria-label={t("fields.subjects.rowTitle", { number })}
              className="min-w-0"
            >
              <div className="flex items-center justify-between gap-2 pb-2">
                <p className="text-base font-medium">{t("fields.subjects.rowTitle", { number })}</p>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={t("fields.subjects.remove", { number })}
                  onClick={() => removeRow(index)}
                >
                  <Trash2 aria-hidden="true" data-icon="inline-start" />
                  {t("common.remove")}
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Field
                  path={`${base}.subject`}
                  label={t("fields.subjects.subject")}
                  requirement="required"
                  error={errorFor(`${base}.subject`)}
                  note={
                    <TextNote note={strongestNote(named.map((subject) => text(subject.name)))} />
                  }
                >
                  {(control) => (
                    <NativeSelect
                      control={control}
                      value={row.subject}
                      choices={choices}
                      placeholder={t("common.choose")}
                      onChange={(value) =>
                        update((draft) => {
                          const target = draft.credential.subjects[index];
                          if (target !== undefined) target.subject = value;
                        })
                      }
                    />
                  )}
                </Field>
                <Field
                  path={`${base}.grade`}
                  label={t("fields.subjects.grade")}
                  requirement="required"
                  error={errorFor(`${base}.grade`)}
                  note={<DigitsHint value={gradeValue} />}
                >
                  {(control) => (
                    <GradeControl
                      control={control}
                      value={gradeValue}
                      max={scale?.max}
                      onChange={(value) =>
                        update((draft) => {
                          const target = draft.credential.subjects[index];
                          if (target !== undefined) target.grade = value;
                        })
                      }
                    />
                  )}
                </Field>
              </div>
            </fieldset>
          );
        })}
        {canAdd ? (
          <div>
            <Button id="add-subject" type="button" variant="outline" onClick={addRow}>
              <Plus aria-hidden="true" data-icon="inline-start" />
              {t("fields.subjects.add")}
            </Button>
          </div>
        ) : rows.length >= MAX_SUBJECT_ROWS ? (
          <p className="text-sm text-muted-foreground">
            {t("fields.subjects.cap", { max: String(MAX_SUBJECT_ROWS) })}
          </p>
        ) : null}
      </div>
    </FieldGroup>
  );
}

export function StepBac() {
  const t = useTranslations("profile");
  const { form, update, core, text, errorFor } = useStep();
  const { credential } = form;
  const scale = gradingScaleFor(form, core);
  const expected = credential.status === "expected";

  const countries = countryOptions(core);
  const origins = originCountries(core);
  const types = credentialTypeOptions(form, core);
  const tracks = trackOptions(form, core);

  const toCountryChoices = (list: typeof countries): Choice[] =>
    list.map((country) => ({
      value: country.code,
      label: textOr(text, country.name, country.code),
    }));
  const withGloss = (name: string, gloss: string | null): string => {
    const glossText = gloss === null ? undefined : text(gloss)?.text;
    return glossText === undefined ? name : `${name} (${glossText})`;
  };
  const typeChoices: Choice[] = types.map((type) => ({
    value: type.slug,
    label: withGloss(type.name, type.gloss),
  }));
  const trackChoices: Choice[] = tracks.map((track) => ({
    value: track.slug,
    label: withGloss(track.name, track.gloss),
  }));

  const statusChoices: Choice[] = [
    { value: "obtained", label: t("fields.status.obtained") },
    { value: "expected", label: t("fields.status.expected") },
  ];
  const yearChoices: Choice[] = YEAR_CHOICES.map((year) => ({ value: year, label: year }));

  return (
    <div className="flex flex-col gap-8">
      <Field
        path="nationality"
        label={t("fields.nationality.label")}
        requirement="required"
        hint={t("fields.nationality.hint")}
        error={errorFor("nationality")}
        note={<TextNote note={strongestNote(countries.map((c) => text(c.name)))} />}
      >
        {(control) => (
          <NativeSelect
            control={control}
            value={form.nationality}
            choices={toCountryChoices(countries)}
            placeholder={t("common.choose")}
            onChange={(value) =>
              update((draft) => {
                draft.nationality = value;
              })
            }
          />
        )}
      </Field>

      <Field
        path="credential.country"
        label={t("fields.credentialCountry.label")}
        requirement="required"
        hint={t("fields.credentialCountry.hint")}
        error={errorFor("credential.country")}
        note={<TextNote note={strongestNote(origins.map((c) => text(c.name)))} />}
      >
        {(control) => (
          <NativeSelect
            control={control}
            value={credential.country}
            choices={toCountryChoices(origins)}
            placeholder={t("common.choose")}
            onChange={(value) =>
              update((draft) => {
                draft.credential.country = value;
                draft.credential.type = "";
                draft.credential.track = "";
              })
            }
          />
        )}
      </Field>

      <Field
        path="credential.type"
        label={t("fields.credentialType.label")}
        requirement="required"
        hint={
          types.length === 0
            ? t("fields.credentialType.chooseFirst")
            : t("fields.credentialType.hint")
        }
        error={errorFor("credential.type")}
        note={<TextNote note={strongestNote(types.map((type) => text(type.gloss)))} />}
      >
        {(control) => (
          <NativeSelect
            control={control}
            value={credential.type}
            choices={typeChoices}
            placeholder={t("common.choose")}
            onChange={(value) =>
              update((draft) => {
                draft.credential.type = value;
                draft.credential.track = "";
              })
            }
          />
        )}
      </Field>

      <Field
        path="credential.track"
        label={t("fields.track.label")}
        requirement="required"
        hint={tracks.length === 0 ? t("fields.track.chooseFirst") : t("fields.track.hint")}
        error={errorFor("credential.track")}
        note={
          <TextNote
            note={strongestNote(
              tracks.map((track) => (track.gloss === null ? undefined : text(track.gloss))),
            )}
          />
        }
      >
        {(control) => (
          <NativeSelect
            control={control}
            value={credential.track}
            choices={trackChoices}
            placeholder={t("common.choose")}
            onChange={(value) =>
              update((draft) => {
                draft.credential.track = value;
              })
            }
          />
        )}
      </Field>

      <ChoiceGroup
        path="credential.status"
        name="credential-status"
        kind="radio"
        legend={t("fields.status.legend")}
        requirement="required"
        error={errorFor("credential.status")}
        choices={statusChoices}
        selected={credential.status === "" ? [] : [credential.status]}
        onToggle={(value) =>
          update((draft) => {
            draft.credential.status = value === "expected" ? "expected" : "obtained";
          })
        }
      />

      <Field
        path="credential.overall"
        label={t("fields.overall.label")}
        requirement={expected ? "optional" : "required"}
        hint={expected ? t("fields.overall.hintExpected") : t("fields.overall.hint")}
        error={errorFor("credential.overall")}
        note={<DigitsHint value={credential.overall} />}
      >
        {(control) => (
          <GradeControl
            control={control}
            value={credential.overall}
            max={scale?.max}
            onChange={(value) =>
              update((draft) => {
                draft.credential.overall = value;
              })
            }
          />
        )}
      </Field>

      <SubjectRows />

      <Field
        path="priorHigherEducationYears"
        label={t("fields.years.label")}
        requirement="required"
        hint={t("fields.years.hint")}
        error={errorFor("priorHigherEducationYears")}
      >
        {(control) => (
          <NativeSelect
            control={control}
            value={form.priorHigherEducationYears}
            choices={yearChoices}
            placeholder={t("common.choose")}
            onChange={(value) =>
              update((draft) => {
                draft.priorHigherEducationYears = value;
              })
            }
          />
        )}
      </Field>
    </div>
  );
}
