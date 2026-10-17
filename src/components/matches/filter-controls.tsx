import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { currencyName } from "@/components/profile/display-names";
import type { MatchFilters } from "@/data-schema/match-filters";
import type { Budget } from "@/data-schema/profile";
import type { AppLocale } from "@/i18n/routing";
import { minorUnitDigits } from "@/lib/format";
import { isOneOf } from "@/lib/guards";
import { cn } from "@/lib/utils";

export type FilterChoice = { value: string; label: string };

export const INSTITUTION_TYPES = ["any", "public", "private"] as const;

const CURRENCIES = ["EUR", "MAD"] as const;
const PERIODS = ["month", "year"] as const;

// Same 48px tap target and border as the profile controls: the filter panel is used on a phone first.
const CONTROL_CLASS =
  "h-12 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base text-foreground";

// One active group counts once, however many values it holds.
export function activeFilterCount(filters: MatchFilters): number {
  let count = 0;
  if (filters.fields.length > 0) count += 1;
  if (filters.studyLanguages.length > 0) count += 1;
  if (filters.destinations.length > 0) count += 1;
  if (filters.institutionType !== "any") count += 1;
  if (filters.budget !== null) count += 1;
  return count;
}

export function toggledValue(list: readonly string[], value: string, checked: boolean): string[] {
  if (!checked) return list.filter((item) => item !== value);
  return list.includes(value) ? [...list] : [...list, value];
}

export function FilterChoiceGroup({
  name,
  legend,
  hint,
  kind = "checkbox",
  choices,
  selected,
  onToggle,
  columns = false,
}: {
  name: string;
  legend: string;
  hint: string;
  kind?: "checkbox" | "radio";
  choices: readonly FilterChoice[];
  selected: readonly string[];
  onToggle: (value: string, checked: boolean) => void;
  columns?: boolean;
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="text-base font-medium">{legend}</legend>
      <p className="text-sm text-muted-foreground">{hint}</p>
      <div className={cn("grid gap-2 pt-1", columns && "sm:grid-cols-2")}>
        {choices.map((choice) => (
          <label
            key={choice.value}
            className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-input bg-background px-3 py-2 text-base has-checked:border-primary has-checked:bg-accent"
          >
            <input
              type={kind}
              name={name}
              value={choice.value}
              checked={selected.includes(choice.value)}
              onChange={(event) => onToggle(choice.value, event.target.checked)}
              className="size-5 shrink-0 accent-primary"
            />
            <span>{choice.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function amountText(budget: Budget | null): string {
  return budget === null ? "" : String(budget.amountMinor / 10 ** minorUnitDigits(budget.currency));
}

export function BudgetFilter({
  budget,
  locale,
  onChange,
}: {
  budget: Budget | null;
  locale: AppLocale;
  onChange: (budget: Budget | null) => void;
}) {
  const t = useTranslations("matches.filters.budget");
  const amountId = useId();
  const currencyId = useId();
  const periodId = useId();
  const [amount, setAmount] = useState(() => amountText(budget));
  const [currency, setCurrency] = useState(budget?.currency ?? "EUR");
  const [period, setPeriod] = useState<Budget["period"]>(budget?.period ?? "month");

  // Clear filters (or a deep link) hands the control a different budget: the draft follows it, so
  // the amount shown and the amount the view uses are never two different numbers.
  useEffect(() => {
    setAmount(amountText(budget));
    setCurrency(budget?.currency ?? "EUR");
    setPeriod(budget?.period ?? "month");
  }, [budget]);

  function publish(nextAmount: string, nextCurrency: string, nextPeriod: Budget["period"]): void {
    if (nextAmount === "") {
      onChange(null);
      return;
    }
    onChange({
      amountMinor: Number(nextAmount) * 10 ** minorUnitDigits(nextCurrency),
      currency: nextCurrency,
      period: nextPeriod,
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <p className="max-w-prose text-base text-muted-foreground">{t("neverHides")}</p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={amountId} className="text-base font-medium">
          {t("amount.label")}
        </label>
        <p id={`${amountId}-hint`} className="text-sm text-muted-foreground">
          {t("amount.hint")}
        </p>
        <input
          id={amountId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          dir="ltr"
          maxLength={9}
          aria-describedby={`${amountId}-hint`}
          value={amount}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, "").slice(0, 9);
            setAmount(digits);
            publish(digits, currency, period);
          }}
          className={cn(CONTROL_CLASS, "w-40 text-start")}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={currencyId} className="text-base font-medium">
            {t("currency.label")}
          </label>
          <select
            id={currencyId}
            value={currency}
            onChange={(event) => {
              const next = event.target.value;
              if (!isOneOf(next, CURRENCIES)) return;
              setCurrency(next);
              if (amount !== "") publish(amount, next, period);
            }}
            className={CONTROL_CLASS}
          >
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {`${code} (${currencyName(code, locale)})`}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={periodId} className="text-base font-medium">
            {t("period.label")}
          </label>
          <select
            id={periodId}
            value={period}
            onChange={(event) => {
              const next = event.target.value;
              if (!isOneOf(next, PERIODS)) return;
              setPeriod(next);
              if (amount !== "") publish(amount, currency, next);
            }}
            className={CONTROL_CLASS}
          >
            {PERIODS.map((value) => (
              <option key={value} value={value}>
                {t(`period.${value}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {currency === "MAD" ? (
        <p className="max-w-prose rounded-lg bg-background px-3 py-2 text-base">{t("madNote")}</p>
      ) : null}
    </div>
  );
}
