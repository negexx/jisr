"use client";

import { useLocale, useTranslations } from "next-intl";

import { DISCLOSURE_SUMMARY_CLASS, DisclosureChevron } from "@/components/disclosure-chevron";
import { displayNumber } from "@/components/matches/display-number";
import type { PlanStep } from "@/lib/journey/plan-view";

import { StepSources } from "./step-row";

// Steps the published data suggests do not apply: shown for transparency, never as tasks (no
// checkbox, not counted), and always with the reason and the source to confirm it.
export function SkippedSteps({ steps }: { steps: readonly PlanStep[] }) {
  const t = useTranslations("plan.steps");
  const tDomain = useTranslations("domain.checklist");
  const locale = useLocale();
  if (steps.length === 0) return null;
  return (
    <details data-slot="skipped-steps" className="flex flex-col">
      <summary className={DISCLOSURE_SUMMARY_CLASS}>
        <span className="text-base font-medium underline underline-offset-4">
          {t("skippedHeading", { count: displayNumber(steps.length, locale) })}
        </span>
        <DisclosureChevron />
      </summary>
      <div className="flex flex-col gap-4 pt-2">
        <p className="max-w-prose text-base text-muted-foreground">{t("skippedLead")}</p>
        <ul className="flex flex-col">
          {steps.map((step) => (
            <li
              key={step.id}
              data-step={step.id}
              className="flex flex-col gap-2 border-t border-border py-4 first:border-t-0 first:pt-0"
            >
              <p className="text-base font-medium">{tDomain(`step.${step.id}.title`)}</p>
              <p className="text-sm text-muted-foreground">{tDomain(`reason.${step.reason}`)}</p>
              {/* No facts: the reason above is itself a statement about this program's data, so the
                  "general guidance" tag would contradict it. */}
              <StepSources facts={step.facts} covered />
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
