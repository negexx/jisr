import { useTranslations } from "next-intl";
import { useId } from "react";

import { DISCLOSURE_SUMMARY_CLASS, DisclosureChevron } from "@/components/disclosure-chevron";
import type { PreferenceMismatch } from "@/domain/filter";
import type { AppLocale } from "@/i18n/routing";
import type { MatchesView } from "@/lib/journey/matches-view";
import { formatList } from "@/lib/journey/reasons";
import { cn } from "@/lib/utils";

import { displayNumber } from "./display-number";

type OkView = Extract<MatchesView, { kind: "ok" }>;

const MISMATCHES: readonly PreferenceMismatch[] = [
  "destination",
  "field",
  "institution_type",
  "study_language",
];

// Hidden programs are never matched or ranked: name and the preferences that hid them, nothing else.
export function HiddenPrograms({
  view,
  locale,
  defaultOpen,
}: {
  view: OkView;
  locale: AppLocale;
  defaultOpen: boolean;
}) {
  const t = useTranslations("matches.hidden");
  const tMismatch = useTranslations("domain.mismatch");
  const summaryId = useId();
  const total = view.hiddenCount;
  const counted = MISMATCHES.filter((mismatch) => view.hiddenByMismatch[mismatch] > 0);

  return (
    <section aria-labelledby={summaryId}>
      <details
        open={defaultOpen}
        className={cn(
          "rounded-xl border border-border bg-secondary px-4",
          defaultOpen && "border-2 border-primary/40",
        )}
      >
        <summary id={summaryId} className={cn(DISCLOSURE_SUMMARY_CLASS, "min-h-12 w-full py-2")}>
          <DisclosureChevron />
          <span className="text-base font-medium">
            {t("summary", { n: total, count: displayNumber(total, locale) })}
          </span>
        </summary>
        <div className="flex flex-col gap-4 pb-4 pt-1">
          <p className="max-w-prose text-base text-muted-foreground">{t("note")}</p>
          {total > 1 ? (
            <ul className="flex flex-wrap gap-2">
              {counted.map((mismatch) => (
                <li
                  key={mismatch}
                  className="rounded-full border border-border bg-background px-3 py-1 text-sm"
                >
                  {t("reasonCount", {
                    reason: tMismatch(mismatch),
                    count: displayNumber(view.hiddenByMismatch[mismatch], locale),
                  })}
                </li>
              ))}
            </ul>
          ) : null}
          <ul className="flex flex-col gap-3">
            {view.hidden.map((program) => (
              <li key={program.slug} className="flex flex-col gap-0.5">
                <span className="text-base font-medium">
                  <bdi>{program.name}</bdi>
                </span>
                <span className="text-sm text-muted-foreground">
                  {formatList(
                    program.mismatches.map((mismatch) => tMismatch(mismatch)),
                    "conjunction",
                    locale,
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </section>
  );
}
