"use client";

import { ArrowRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId } from "react";

import { DeadlineStatus } from "@/components/deadline-status";
import { MatchStatusBadge } from "@/components/match-status-badge";
import { displayNumber } from "@/components/matches/display-number";
import { Button, buttonVariants } from "@/components/ui/button";
import type { ChecklistStepId } from "@/domain/types";
import { Link } from "@/i18n/navigation";
import type { PlanProgram, PlanStep } from "@/lib/journey/plan-view";

import { SkippedSteps } from "./skipped-steps";
import { StepRow } from "./step-row";

export type StepProgress = { todo: PlanStep[]; skipped: PlanStep[]; done: number };

// Only todo steps count: a skipped step is not a task, and a tick left on a step that has since
// become skipped must not inflate the count.
export function stepProgress(program: PlanProgram, done: readonly ChecklistStepId[]): StepProgress {
  const todo = program.steps.filter((step) => step.status === "todo");
  return {
    todo,
    skipped: program.steps.filter((step) => step.status === "skipped"),
    done: todo.filter((step) => done.includes(step.id)).length,
  };
}

export function ProgramPlan({
  program,
  done,
  showProgress,
  onToggle,
  onRemove,
}: {
  program: PlanProgram;
  done: readonly ChecklistStepId[];
  // Only when the switcher (which carries the progress for each program) is not shown.
  showProgress: boolean;
  onToggle: (step: ChecklistStepId, done: boolean) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("plan");
  const tStep = useTranslations("domain.checklist.step");
  const locale = useLocale();
  const headingId = useId();
  const { todo, skipped, done: doneCount } = stepProgress(program, done);
  const nextStep = todo.find((step) => !done.includes(step.id));

  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2
          id={headingId}
          data-slot="plan-heading"
          tabIndex={-1}
          className="text-2xl font-semibold outline-none"
        >
          <bdi>{program.name}</bdi>
        </h2>
        <p className="text-base text-muted-foreground">
          <bdi>{program.institutionName}</bdi>
          <span aria-hidden="true"> · </span>
          <bdi>{program.cityName}</bdi>
        </p>
        <MatchStatusBadge group={program.group} />
      </header>

      <div className="grid gap-4 rounded-xl bg-muted p-4 sm:grid-cols-2">
        <div data-slot="next-step" className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">{t("program.nextStep")}</p>
          <p className="text-lg font-semibold">
            {nextStep === undefined ? t("program.allDone") : tStep(`${nextStep.id}.title`)}
          </p>
          {showProgress ? (
            <p className="text-sm text-muted-foreground">
              {t("switcher.progress", {
                done: displayNumber(doneCount, locale),
                total: displayNumber(todo.length, locale),
              })}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">{t("program.deadline")}</p>
          <DeadlineStatus intake={program.intake} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold">{t("steps.heading")}</h3>
        <ol data-slot="steps" className="flex flex-col">
          {todo.map((step) => (
            <StepRow
              key={step.id}
              program={program}
              step={step}
              done={done.includes(step.id)}
              onToggle={(checked) => onToggle(step.id, checked)}
            />
          ))}
        </ol>
      </div>

      <SkippedSteps steps={skipped} />

      <div className="flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:flex-wrap">
        <Link
          href={`/programs/${program.slug}`}
          prefetch={false}
          className={buttonVariants({ variant: "outline" })}
        >
          {t("program.viewProgram")}
          <ArrowRight data-icon="inline-end" aria-hidden="true" className="rtl:rotate-180" />
        </Link>
        <Button type="button" variant="outline" onClick={onRemove}>
          {t("program.remove")}
        </Button>
      </div>
    </section>
  );
}
