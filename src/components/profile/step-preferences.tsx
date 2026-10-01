import { useTranslations } from "next-intl";

import { isOneOf } from "@/lib/guards";
import { destinationOptions, fieldOptions, studyLanguageOptions } from "@/lib/profile/form/options";

import { type Choice, languageName, lookupName, strongestNote } from "./display-names";
import { ChoiceGroup, useNoteText } from "./field";
import { useStep } from "./step-context";

const INSTITUTION_TYPES = ["any", "public", "private"] as const;

function toggled(list: string[], value: string, checked: boolean): void {
  const index = list.indexOf(value);
  if (checked && index === -1) list.push(value);
  if (!checked && index !== -1) list.splice(index, 1);
}

export function StepPreferences() {
  const t = useTranslations("profile");
  const noteText = useNoteText();
  const { form, update, core, text, locale, errorFor } = useStep();

  const fields = fieldOptions(core);
  const destinations = destinationOptions(core);
  const fieldChoices: Choice[] = fields.map((field) => ({
    value: field.slug,
    label: lookupName(core, text, "field", field.slug).label,
  }));
  const languageChoices: Choice[] = studyLanguageOptions(core).map((code) => ({
    value: code,
    label: languageName(code, locale),
  }));
  const destinationChoices: Choice[] = destinations.map((country) => ({
    value: country.code,
    label: lookupName(core, text, "country", country.code).label,
  }));
  const institutionChoices: Choice[] = INSTITUTION_TYPES.map((type) => ({
    value: type,
    label: t(`fields.institution.${type}`),
  }));

  return (
    <div className="flex flex-col gap-8">
      <ChoiceGroup
        path="fields"
        name="fields"
        kind="checkbox"
        legend={t("fields.fieldsOfStudy.legend")}
        requirement="required"
        hint={t("fields.fieldsOfStudy.hint")}
        notes={[
          noteText(
            strongestNote(form.fields.map((slug) => lookupName(core, text, "field", slug).data)),
          ),
        ]}
        error={errorFor("fields")}
        choices={fieldChoices}
        selected={form.fields}
        onToggle={(value, checked) => update((draft) => toggled(draft.fields, value, checked))}
      />
      <ChoiceGroup
        path="studyLanguages"
        name="study-languages"
        kind="checkbox"
        legend={t("fields.studyLanguages.legend")}
        requirement="optional"
        hint={t("fields.studyLanguages.hint")}
        error={errorFor("studyLanguages")}
        choices={languageChoices}
        selected={form.studyLanguages}
        columns
        onToggle={(value, checked) =>
          update((draft) => toggled(draft.studyLanguages, value, checked))
        }
      />
      <ChoiceGroup
        path="destinations"
        name="destinations"
        kind="checkbox"
        legend={t("fields.destinations.legend")}
        requirement="optional"
        hint={t("fields.destinations.hint")}
        notes={[
          noteText(
            strongestNote(
              form.destinations.map((code) => lookupName(core, text, "country", code).data),
            ),
          ),
        ]}
        error={errorFor("destinations")}
        choices={destinationChoices}
        selected={form.destinations}
        columns
        onToggle={(value, checked) =>
          update((draft) => toggled(draft.destinations, value, checked))
        }
      />
      <ChoiceGroup
        path="institutionType"
        name="institution-type"
        kind="radio"
        legend={t("fields.institution.legend")}
        requirement="optional"
        hint={t("fields.institution.hint")}
        error={errorFor("institutionType")}
        choices={institutionChoices}
        selected={[form.institutionType]}
        onToggle={(value) =>
          update((draft) => {
            if (isOneOf(value, INSTITUTION_TYPES)) draft.institutionType = value;
          })
        }
      />
    </div>
  );
}
