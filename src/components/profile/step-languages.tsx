import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { CEFR_LEVELS } from "@/lib/constants";
import { isOneOf } from "@/lib/guards";
import { certificateOptionsFor, languageRowOptions } from "@/lib/profile/form/options";

import { type Choice, languageName } from "./display-names";
import { Field, NativeSelect } from "./field";
import { fieldIdForPath } from "./issues";
import { useStep } from "./step-context";

const REQUIRED_LANGUAGES = ["fr", "en"];
const LEVELS = [...CEFR_LEVELS, "unknown"] as const;

export function StepLanguages() {
  const t = useTranslations("profile");
  const { form, update, core, locale, errorFor, focusAfterRender } = useStep();
  const rows = form.languages;
  const offered = languageRowOptions(core);
  const unused = offered.filter((code) => !rows.some((row) => row.language === code));

  const levelChoices: Choice[] = LEVELS.map((level) => ({
    value: level,
    label: t(`fields.levels.${level}`),
  }));

  const addRow = () => {
    const [first] = unused;
    if (first === undefined) return;
    update((draft) => {
      draft.languages.push({ language: first, level: "", certificate: "" });
    });
    focusAfterRender(fieldIdForPath(`languages.${rows.length}.language`));
  };
  const removeRow = (index: number) => {
    update((draft) => {
      draft.languages.splice(index, 1);
    });
    focusAfterRender("add-language");
  };

  return (
    <div className="flex flex-col gap-8">
      {rows.map((row, index) => {
        const base = `languages.${index}`;
        const fixed = REQUIRED_LANGUAGES.includes(row.language);
        const name = languageName(row.language, locale);
        const certificates = certificateOptionsFor(row.language, core);
        const certificateChoices: Choice[] = certificates.map((certificate) => ({
          value: certificate.slug,
          label: certificate.name,
        }));
        const languageChoices: Choice[] = offered
          .filter((code) => code === row.language || unused.includes(code))
          .map((code) => ({ value: code, label: languageName(code, locale) }));
        return (
          // Rows are edited in place and removed by position; they have no identity of their own.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          <fieldset key={index} aria-label={name} className="flex min-w-0 flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold">{name}</h3>
              {fixed ? null : (
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={t("fields.language.remove", { language: name })}
                  onClick={() => removeRow(index)}
                >
                  <Trash2 aria-hidden="true" data-icon="inline-start" />
                  {t("common.remove")}
                </Button>
              )}
            </div>
            {fixed ? null : (
              <Field
                path={`${base}.language`}
                label={t("fields.language.label")}
                requirement="required"
                error={errorFor(`${base}.language`)}
              >
                {(control) => (
                  <NativeSelect
                    control={control}
                    value={row.language}
                    choices={languageChoices}
                    placeholder={t("common.choose")}
                    onChange={(value) =>
                      update((draft) => {
                        const target = draft.languages[index];
                        if (target === undefined) return;
                        target.language = value;
                        target.certificate = "";
                      })
                    }
                  />
                )}
              </Field>
            )}
            <Field
              path={`${base}.level`}
              label={t("fields.level.label")}
              requirement="required"
              hint={t("fields.level.hint")}
              error={errorFor(`${base}.level`)}
            >
              {(control) => (
                <NativeSelect
                  control={control}
                  value={row.level}
                  choices={levelChoices}
                  placeholder={t("common.choose")}
                  onChange={(value) =>
                    update((draft) => {
                      const target = draft.languages[index];
                      if (target === undefined) return;
                      target.level = isOneOf(value, LEVELS) ? value : "";
                    })
                  }
                />
              )}
            </Field>
            <Field
              path={`${base}.certificate`}
              label={t("fields.certificate.label")}
              requirement="optional"
              hint={t("fields.certificate.hint")}
              error={errorFor(`${base}.certificate`)}
            >
              {(control) => (
                <NativeSelect
                  control={control}
                  value={row.certificate}
                  choices={certificateChoices}
                  placeholder={t("fields.certificate.none")}
                  onChange={(value) =>
                    update((draft) => {
                      const target = draft.languages[index];
                      if (target !== undefined) target.certificate = value;
                    })
                  }
                />
              )}
            </Field>
          </fieldset>
        );
      })}
      {unused.length === 0 ? null : (
        <div>
          <Button id="add-language" type="button" variant="outline" onClick={addRow}>
            <Plus aria-hidden="true" data-icon="inline-start" />
            {t("fields.language.add")}
          </Button>
        </div>
      )}
    </div>
  );
}
