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

import {
  type Choice,
  hasNonLatinDigits,
  isolate,
  lookupName,
  strongestNote,
} from "./display-names";
import {
  ChoiceGroup,
  CONTROL_CLASS,
  type ControlProps,
  Field,
  FieldGroup,
  NativeSelect,
  useNoteText,
} from "./field";
import { PlusIcon, TrashIcon } from "./icons";
import { fieldIdForPath } from "./issues";
import { OfficialName } from "./official-name";
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

function useDigitsHint(): (value: string) => string | undefined {
  const t = useTranslations("profile.errors");
  return (value) => (hasNonLatinDigits(value) ? t("digitsHint") : undefined);
}

function SubjectRows() {
  const t = useTranslations("profile");
  const digitsHint = useDigitsHint();
  const noteText = useNoteText();
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
          // A subject the track no longer offers stays visible (and marked) rather than blank.
          const kept = offered.some((subject) => subject.slug === row.subject);
          const outside = kept ? undefined : core.subjects.find((s) => s.slug === row.subject);
          const choices: Choice[] = [
            ...offered.map((subject) => ({
              value: subject.slug,
              label: lookupName(core, text, "subject", subject.slug).label,
            })),
            ...(outside === undefined
              ? []
              : [
                  {
                    value: outside.slug,
                    label: `${lookupName(core, text, "subject", outside.slug).label} (${t("fields.subjects.notInTrack")})`,
                  },
                ]),
          ];
          // Rows have no identity of their own: they are edited in place and removed by position.
          const rowKey = `subject-row-${index}`;
          const number = String(index + 1);
          const base = `credential.subjects.${index}`;
          const chosen = lookupName(core, text, "subject", row.subject);
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
                  <TrashIcon data-icon="inline-start" />
                  {t("common.remove")}
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Field
                  path={`${base}.subject`}
                  label={t("fields.subjects.subject")}
                  requirement="required"
                  error={errorFor(`${base}.subject`)}
                  notes={[noteText(strongestNote([row.subject === "" ? undefined : chosen.data]))]}
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
                  notes={[digitsHint(row.grade)]}
                >
                  {(control) => (
                    <GradeControl
                      control={control}
                      value={row.grade}
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
              <PlusIcon data-icon="inline-start" />
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
  const digitsHint = useDigitsHint();
  const noteText = useNoteText();
  const { form, update, core, text, errorFor } = useStep();
  const { credential } = form;
  const scale = gradingScaleFor(form, core);
  const expected = credential.status === "expected";

  const types = credentialTypeOptions(form, core);
  const tracks = trackOptions(form, core);
  const chosenType = types.find((type) => type.slug === credential.type);
  const chosenTrack = tracks.find((track) => track.slug === credential.track);

  const toCountryChoices = (list: ReturnType<typeof countryOptions>): Choice[] =>
    list.map((country) => ({
      value: country.code,
      label: lookupName(core, text, "country", country.code).label,
    }));
  const countryNote = (code: string) =>
    noteText(
      strongestNote([code === "" ? undefined : lookupName(core, text, "country", code).data]),
    );
  // In the list, the official name alone; the gloss appears below the chosen one.
  const officialChoices = (list: readonly { slug: string; name: string }[]): Choice[] =>
    list.map((item) => ({ value: item.slug, label: isolate(item.name) }));

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
        notes={[countryNote(form.nationality)]}
      >
        {(control) => (
          <NativeSelect
            control={control}
            value={form.nationality}
            choices={toCountryChoices(countryOptions(core))}
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
        notes={[countryNote(credential.country)]}
      >
        {(control) => (
          <NativeSelect
            control={control}
            value={credential.country}
            choices={toCountryChoices(originCountries(core))}
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
        detail={
          chosenType === undefined ? undefined : (
            <OfficialName name={chosenType.name} gloss={text(chosenType.gloss)} />
          )
        }
      >
        {(control) => (
          <NativeSelect
            control={control}
            value={credential.type}
            choices={officialChoices(types)}
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
        detail={
          chosenTrack === undefined ? undefined : (
            <OfficialName
              name={chosenTrack.name}
              gloss={chosenTrack.gloss === null ? undefined : text(chosenTrack.gloss)}
            />
          )
        }
      >
        {(control) => (
          <NativeSelect
            control={control}
            value={credential.track}
            choices={officialChoices(tracks)}
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
        notes={[digitsHint(credential.overall)]}
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
