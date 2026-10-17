import { useTranslations } from "next-intl";

import { DISCLOSURE_SUMMARY_CLASS, DisclosureChevron } from "@/components/disclosure-chevron";
import { languageName, lookupName } from "@/components/profile/display-names";
import type { MatchFilters } from "@/data-schema/match-filters";
import type { CoreShard } from "@/data-schema/snapshot";
import type { AppLocale } from "@/i18n/routing";
import { isOneOf } from "@/lib/guards";
import { destinationOptions, fieldOptions, studyLanguageOptions } from "@/lib/profile/form/options";
import type { TextLookup } from "@/lib/snapshot/text";
import { cn } from "@/lib/utils";

import { displayNumber } from "./display-number";
import {
  activeFilterCount,
  BudgetFilter,
  type FilterChoice,
  FilterChoiceGroup,
  INSTITUTION_TYPES,
  toggledValue,
} from "./filter-controls";

// The five former wizard steps, as one mobile-first disclosure above the results: closed it is a
// single bar, and when the filters hide everything it opens on their own so the student has the
// controls right there.
export function FilterPanel({
  filters,
  onFiltersChange,
  core,
  text,
  locale,
  defaultOpen,
}: {
  filters: MatchFilters;
  onFiltersChange: (filters: MatchFilters) => void;
  core: CoreShard;
  text: TextLookup;
  locale: AppLocale;
  defaultOpen: boolean;
}) {
  const t = useTranslations("matches.filters");
  const active = activeFilterCount(filters);
  const fieldChoices: FilterChoice[] = fieldOptions(core).map((field) => ({
    value: field.slug,
    label: lookupName(core, text, "field", field.slug).label,
  }));
  const languageChoices: FilterChoice[] = studyLanguageOptions(core).map((code) => ({
    value: code,
    label: languageName(code, locale),
  }));
  const destinationChoices: FilterChoice[] = destinationOptions(core).map((country) => ({
    value: country.code,
    label: lookupName(core, text, "country", country.code).label,
  }));
  const institutionChoices: FilterChoice[] = INSTITUTION_TYPES.map((type) => ({
    value: type,
    label: t(`institution.${type}`),
  }));

  return (
    <details open={defaultOpen} className="rounded-xl border border-border bg-secondary px-4">
      <summary className={cn(DISCLOSURE_SUMMARY_CLASS, "min-h-12 w-full py-2")}>
        <DisclosureChevron />
        <span className="text-base font-medium">
          {t("toggle")}
          {active === 0 ? null : (
            <>
              {" "}
              <bdi>({displayNumber(active, locale)})</bdi>
            </>
          )}
        </span>
      </summary>
      <div className="flex flex-col gap-6 pt-3 pb-4">
        <FilterChoiceGroup
          name="filter-field"
          legend={t("field.legend")}
          hint={t("field.hint")}
          choices={fieldChoices}
          selected={filters.fields}
          onToggle={(value, checked) =>
            onFiltersChange({ ...filters, fields: toggledValue(filters.fields, value, checked) })
          }
        />
        <FilterChoiceGroup
          name="filter-study-language"
          legend={t("studyLanguage.legend")}
          hint={t("studyLanguage.hint")}
          choices={languageChoices}
          selected={filters.studyLanguages}
          columns
          onToggle={(value, checked) =>
            onFiltersChange({
              ...filters,
              studyLanguages: toggledValue(filters.studyLanguages, value, checked),
            })
          }
        />
        <FilterChoiceGroup
          name="filter-destination"
          legend={t("destination.legend")}
          hint={t("destination.hint")}
          choices={destinationChoices}
          selected={filters.destinations}
          columns
          onToggle={(value, checked) =>
            onFiltersChange({
              ...filters,
              destinations: toggledValue(filters.destinations, value, checked),
            })
          }
        />
        <FilterChoiceGroup
          name="filter-institution"
          kind="radio"
          legend={t("institution.legend")}
          hint={t("institution.hint")}
          choices={institutionChoices}
          selected={[filters.institutionType]}
          onToggle={(value) => {
            if (!isOneOf(value, INSTITUTION_TYPES)) return;
            onFiltersChange({ ...filters, institutionType: value });
          }}
        />
        <BudgetFilter
          budget={filters.budget}
          locale={locale}
          onChange={(budget) => onFiltersChange({ ...filters, budget })}
        />
      </div>
    </details>
  );
}
