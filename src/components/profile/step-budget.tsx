import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { type Choice, currencyName, hasNonLatinDigits } from "./display-names";
import { CONTROL_CLASS, Field, NativeSelect } from "./field";
import { useStep } from "./step-context";

const CURRENCIES = ["EUR", "MAD"] as const;

export function StepBudget() {
  const t = useTranslations("profile");
  const { form, update, locale, errorFor } = useStep();
  const { budget } = form;

  const currencyChoices: Choice[] = CURRENCIES.map((code) => ({
    value: code,
    label: `${code} (${currencyName(code, locale)})`,
  }));
  const periodChoices: Choice[] = [
    { value: "month", label: t("fields.budget.period.month") },
    { value: "year", label: t("fields.budget.period.year") },
  ];

  return (
    <div className="flex flex-col gap-8">
      <p className="max-w-[65ch] text-base text-muted-foreground">
        {t("fields.budget.neverHides")}
      </p>

      <Field
        path="budget.amount"
        label={t("fields.budget.amount.label")}
        requirement="optional"
        hint={t("fields.budget.amount.hint")}
        error={errorFor("budget.amount")}
        notes={[hasNonLatinDigits(budget.amount) ? t("errors.digitsHint") : undefined]}
      >
        {(control) => (
          <input
            {...control}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            dir="ltr"
            value={budget.amount}
            onChange={(event) =>
              update((draft) => {
                draft.budget.amount = event.target.value;
              })
            }
            className={cn(CONTROL_CLASS, "w-40 text-start")}
          />
        )}
      </Field>

      <div className="grid gap-8 sm:grid-cols-2">
        <Field
          path="budget.currency"
          label={t("fields.budget.currency.label")}
          requirement="optional"
          error={errorFor("budget.currency")}
        >
          {(control) => (
            <NativeSelect
              control={control}
              value={budget.currency}
              choices={currencyChoices}
              onChange={(value) =>
                update((draft) => {
                  draft.budget.currency = value;
                })
              }
            />
          )}
        </Field>
        <Field
          path="budget.period"
          label={t("fields.budget.period.label")}
          requirement="optional"
          error={errorFor("budget.period")}
        >
          {(control) => (
            <NativeSelect
              control={control}
              value={budget.period}
              choices={periodChoices}
              onChange={(value) =>
                update((draft) => {
                  draft.budget.period = value === "year" ? "year" : "month";
                })
              }
            />
          )}
        </Field>
      </div>

      <output className="block">
        {budget.currency === "MAD" ? (
          <p className="max-w-[65ch] rounded-lg bg-muted px-4 py-3 text-base">
            {t("fields.budget.madNote")}
          </p>
        ) : null}
      </output>
    </div>
  );
}
