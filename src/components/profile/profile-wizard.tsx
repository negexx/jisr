"use client";

import { ArrowLeft, ArrowRight, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { CoreShard } from "@/data-schema/snapshot";
import { useRouter } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { buildProfile } from "@/lib/profile/form/build";
import { type FormState, STEPS, type StepId } from "@/lib/profile/form/state";
import {
  pathStep,
  type StepIssue,
  stepOfFirstIssue,
  validateStep,
} from "@/lib/profile/form/validate-step";
import { getLocalStorage } from "@/lib/profile/storage";
import { useProfile } from "@/lib/profile/use-profile";
import type { TextLookup } from "@/lib/snapshot/text";

import { ErrorSummary, Notice, StepHeader } from "./chrome";
import { initialWizardState } from "./initial-state";
import { groupKeyForPath, shownIssues } from "./issues";
import { StepBac } from "./step-bac";
import { StepBudget } from "./step-budget";
import { StepProvider } from "./step-context";
import { StepLanguages } from "./step-languages";
import { StepPreferences } from "./step-preferences";
import { StepReview } from "./step-review";
import { useDraftAutosave } from "./use-draft-autosave";

type FocusTarget = "summary" | "heading" | { id: string };

const FORM_STEP_COUNT = STEPS.length - 1;

export function PageTitle({ mode }: { mode: "create" | "edit" }) {
  const t = useTranslations("profile.title");
  return (
    <h1 id="profile-title" className="text-2xl font-bold tracking-tight text-balance">
      {t(mode)}
    </h1>
  );
}

export function ProfileWizard({
  core,
  text,
  locale,
}: {
  core: CoreShard;
  text: TextLookup;
  locale: AppLocale;
}) {
  const t = useTranslations("profile");
  const router = useRouter();
  const profile = useProfile();

  // Read once, after hydration: the wizard is only mounted once the profile store has been read.
  const [initial] = useState(() => initialWizardState(core, profile.state, getLocalStorage()));
  const { mode, baseline } = initial;
  const [form, setForm] = useState<FormState>(initial.form);
  const [stepIndex, setStepIndex] = useState(initial.stepIndex);
  const [showErrors, setShowErrors] = useState(false);
  const [pinned, setPinned] = useState<StepIssue[] | null>(null);
  const [draftNotice, setDraftNotice] = useState(initial.draftRestored);
  const [saveFailed, setSaveFailed] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [, setAttempts] = useState(0);

  const stepId: StepId = STEPS[stepIndex] ?? "bac";
  const headingRef = useRef<HTMLHeadingElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<FocusTarget | null>(null);
  const autosave = useDraftAutosave(form, stepIndex, baseline);

  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    if (target === "summary") summaryRef.current?.focus();
    else if (target === "heading") headingRef.current?.focus();
    else document.getElementById(target.id)?.focus();
  });

  const stepTitle = (id: StepId) => t(`steps.${id}.title`);
  const progressLabel = (index: number): string => {
    const id = STEPS[index] ?? "bac";
    return id === "review"
      ? t("progress.review")
      : t("progress.step", {
          current: String(index + 1),
          total: String(FORM_STEP_COUNT),
          title: stepTitle(id),
        });
  };

  // Errors are recomputed as the student edits, so a fixed field loses its message at once.
  const issues = useMemo(() => {
    if (pinned !== null) return pinned;
    return showErrors && stepId !== "review" ? validateStep(stepId, form, core) : [];
  }, [pinned, showErrors, stepId, form, core]);
  const shown = useMemo(() => shownIssues(t, issues, form, locale), [t, issues, form, locale]);
  const errorFor = useCallback(
    (path: string) => shown.find((issue) => issue.key === groupKeyForPath(path))?.message,
    [shown],
  );

  const update = useCallback((change: (draft: FormState) => void) => {
    setForm((current) => {
      const next = structuredClone(current);
      change(next);
      return next;
    });
    setPinned(null);
    setSaveFailed(false);
  }, []);

  const goTo = (index: number) => {
    setStepIndex(index);
    setShowErrors(false);
    setPinned(null);
    setSaveFailed(false);
    setAnnouncement(progressLabel(index));
    pendingFocus.current = "heading";
  };
  const goToStep = (id: StepId) => goTo(STEPS.indexOf(id));
  const focusAfterRender = useCallback((id: string) => {
    pendingFocus.current = { id };
  }, []);

  const showSummary = (target: FocusTarget) => {
    setShowErrors(true);
    pendingFocus.current = target;
    setAttempts((count) => count + 1);
  };

  const submit = () => {
    const result = buildProfile(form, core);
    if (!result.ok) {
      const target = stepOfFirstIssue(result.issues);
      if (target === "review") {
        setSaveFailed(true);
        return;
      }
      setStepIndex(STEPS.indexOf(target));
      setPinned(result.issues.filter((issue) => pathStep(issue.path) === target));
      setAnnouncement(progressLabel(STEPS.indexOf(target)));
      showSummary("summary");
      return;
    }
    autosave.suspend();
    const saved = profile.save(result.profile);
    if (!saved.ok) {
      autosave.resume();
      setSaveFailed(true);
      return;
    }
    router.push("/matches");
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (stepId === "review") {
      submit();
      return;
    }
    if (validateStep(stepId, form, core).length > 0) {
      showSummary("summary");
      return;
    }
    goTo(stepIndex + 1);
  };

  const state = profile.state;
  const showReset = state.status === "reset";
  const showStorage = state.status !== "unhydrated" && !state.storageAvailable;
  const lastLabel = mode === "edit" ? t("common.saveChanges") : t("common.seeMatches");
  const why = t(`steps.${stepId}.why`);

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,40rem)_minmax(0,16rem)] lg:justify-center lg:gap-12">
      <form
        noValidate
        aria-labelledby="profile-title"
        onSubmit={onSubmit}
        className="flex min-w-0 flex-col gap-6"
      >
        <div className="flex flex-col gap-2">
          <PageTitle mode={mode} />
          {stepIndex === 0 ? (
            <p className="max-w-[65ch] text-base text-muted-foreground">{t("intro")}</p>
          ) : null}
        </div>

        {showReset ? (
          <Notice dismissLabel={t("common.dismiss")} onDismiss={profile.dismissReset}>
            {t("notices.reset")}
          </Notice>
        ) : null}
        {showStorage ? <Notice>{t("notices.storage")}</Notice> : null}
        {draftNotice ? (
          <Notice dismissLabel={t("common.dismiss")} onDismiss={() => setDraftNotice(false)}>
            {t("notices.draft")}
          </Notice>
        ) : null}

        <StepHeader stepIndex={stepIndex} label={progressLabel(stepIndex)} />
        <div aria-live="polite" className="sr-only">
          {announcement}
        </div>

        <ErrorSummary
          issues={shown}
          summaryRef={summaryRef}
          onFocusField={(id) => document.getElementById(id)?.focus()}
        />

        <section aria-labelledby="step-heading" className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <h2
              id="step-heading"
              ref={headingRef}
              tabIndex={-1}
              className="scroll-mt-4 text-xl font-semibold outline-none"
            >
              {stepTitle(stepId)}
            </h2>
            <details className="group rounded-lg border border-border lg:hidden">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 text-base font-medium [&::-webkit-details-marker]:hidden">
                {t("aside.whyPhone")}
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 transition-transform group-open:rotate-180"
                />
              </summary>
              <p className="px-4 pb-4 text-base text-muted-foreground">{why}</p>
            </details>
          </div>

          <StepProvider
            value={{ form, update, core, text, locale, errorFor, goToStep, focusAfterRender }}
          >
            {stepId === "bac" ? <StepBac /> : null}
            {stepId === "languages" ? <StepLanguages /> : null}
            {stepId === "preferences" ? <StepPreferences /> : null}
            {stepId === "budget" ? <StepBudget /> : null}
            {stepId === "review" ? <StepReview /> : null}
          </StepProvider>
        </section>

        {saveFailed ? (
          <p role="alert" className="text-base font-medium text-destructive">
            {t("notices.saveFailed")}
          </p>
        ) : null}

        <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-background px-4 py-3 md:-mx-6 md:px-6 lg:static lg:mx-0 lg:border-t-0 lg:px-0">
          <div className="flex gap-3">
            {stepIndex === 0 ? null : (
              <Button type="button" variant="outline" size="lg" onClick={() => goTo(stepIndex - 1)}>
                <ArrowLeft aria-hidden="true" data-icon="inline-start" className="rtl:rotate-180" />
                {t("common.back")}
              </Button>
            )}
            <Button type="submit" size="lg" className="flex-1 lg:flex-none">
              {stepId === "review" ? lastLabel : t("common.next")}
              <ArrowRight aria-hidden="true" data-icon="inline-end" className="rtl:rotate-180" />
            </Button>
          </div>
        </div>
      </form>

      <aside className="hidden lg:block">
        <div className="sticky top-8 flex flex-col gap-8">
          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">{t("aside.whyTitle")}</h2>
            <p className="text-base text-muted-foreground">{why}</p>
          </section>
          <section className="flex flex-col gap-2 border-t border-border pt-6">
            <h2 className="text-lg font-semibold">{t("aside.deviceTitle")}</h2>
            <p className="text-base text-muted-foreground">{t("aside.deviceBody")}</p>
          </section>
        </div>
      </aside>
    </div>
  );
}
