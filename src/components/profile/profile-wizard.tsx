"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { CoreShard } from "@/data-schema/snapshot";
import { useRouter } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { track } from "@/lib/analytics";
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

import { ErrorSummary, Notice, PAGE_GRID, PageTitle, StepHeader } from "./chrome";
import { ArrowIcon, ChevronDownIcon } from "./icons";
import { initialWizardState } from "./initial-state";
import { groupKeyForPath, type ShownIssue, shownIssues } from "./issues";
import { StepBac } from "./step-bac";
import { StepBudget } from "./step-budget";
import { StepProvider } from "./step-context";
import { StepLanguages } from "./step-languages";
import { StepPreferences } from "./step-preferences";
import { StepReview } from "./step-review";
import { useDraftAutosave } from "./use-draft-autosave";

type FocusTarget = "summary" | "heading" | { id: string };

const FORM_STEP_COUNT = STEPS.length - 1;

// Loaded on demand: the review step is the only place that builds the profile.
const loadBuilder = () => import("@/lib/profile/form/build");

type WizardProps = { core: CoreShard; text: TextLookup; locale: AppLocale };

// "Clear my data" empties the store while the form is open: the body is then rebuilt from a fresh
// initial state (empty form, create mode), so nothing typed before can be written back.
export function ProfileWizard(props: WizardProps) {
  const [generation, setGeneration] = useState(0);
  const restart = useCallback(() => setGeneration((count) => count + 1), []);
  return <WizardBody key={generation} {...props} onCleared={restart} />;
}

function WizardBody({ core, text, locale, onCleared }: WizardProps & { onCleared: () => void }) {
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
  // The list as it was at the failed attempt: it does not change while the student types.
  const [summary, setSummary] = useState<ShownIssue[]>([]);
  const [draftNotice, setDraftNotice] = useState(initial.draftRestored);
  const [saveFailed, setSaveFailed] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  // Bumped to render again (and so run the focus effect) when nothing else in the state changed.
  const [, setFocusNonce] = useState(0);

  const stepId: StepId = STEPS[stepIndex] ?? "bac";
  const headingRef = useRef<HTMLHeadingElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<FocusTarget | null>(null);
  const submitting = useRef(false);
  const dismissingReset = useRef(false);
  const { suspend, resume } = useDraftAutosave(form, stepIndex, baseline);

  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    if (target === "summary") summaryRef.current?.focus();
    else if (target === "heading") headingRef.current?.focus();
    else document.getElementById(target.id)?.focus();
  });

  // A store that went back to empty (Clear my data) while this form holds answers.
  const storeState = profile.state;
  const previousStore = useRef(storeState);
  useEffect(() => {
    const previous = previousStore.current;
    previousStore.current = storeState;
    if (previous === storeState || previous.status === "unhydrated") return;
    if (storeState.status !== "none") return;
    if (previous.status === "reset" && dismissingReset.current) {
      dismissingReset.current = false;
      return;
    }
    if (previous.status === "none" && previous.storageAvailable !== storeState.storageAvailable) {
      return;
    }
    suspend();
    onCleared();
  }, [storeState, suspend, onCleared]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: counted once when the form opens; `mode` is fixed for this mount
  useEffect(() => {
    if (mode === "create") track("profile-started");
  }, []);

  // Started as the review opens, so the chunk is usually there when the student taps save.
  useEffect(() => {
    if (stepId === "review") loadBuilder().catch(() => undefined);
  }, [stepId]);

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

  // Inline errors are recomputed as the student edits, so a fixed field loses its message at once.
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
    setSummary([]);
    setSaveFailed(false);
    setDraftNotice(false);
    setAnnouncement(progressLabel(index));
    pendingFocus.current = "heading";
  };
  const goToStep = (id: StepId) => goTo(STEPS.indexOf(id));
  const focusAfterRender = useCallback((id: string) => {
    pendingFocus.current = { id };
  }, []);

  const showFailedAttempt = (list: readonly StepIssue[]) => {
    setSummary(shownIssues(t, list, form, locale));
    setShowErrors(true);
    pendingFocus.current = "summary";
    setFocusNonce((count) => count + 1);
  };

  const submit = async () => {
    if (submitting.current) return;
    submitting.current = true;
    let result: ReturnType<typeof import("@/lib/profile/form/build").buildProfile>;
    try {
      const { buildProfile } = await loadBuilder();
      result = buildProfile(form, core);
    } catch {
      // The chunk did not load (a flaky connection): say so, and let the next tap try again.
      submitting.current = false;
      setSaveFailed(true);
      return;
    }
    if (!result.ok) {
      submitting.current = false;
      const target = stepOfFirstIssue(result.issues);
      if (target === "review") {
        setSaveFailed(true);
        return;
      }
      const forStep = result.issues.filter((issue) => pathStep(issue.path) === target);
      setStepIndex(STEPS.indexOf(target));
      setPinned(forStep);
      setAnnouncement(progressLabel(STEPS.indexOf(target)));
      showFailedAttempt(forStep);
      return;
    }
    suspend();
    const saved = profile.save(result.profile);
    if (!saved.ok) {
      submitting.current = false;
      resume();
      setSaveFailed(true);
      return;
    }
    if (mode === "create") track("profile-completed");
    router.push("/matches");
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (stepId === "review") {
      void submit();
      return;
    }
    const found = validateStep(stepId, form, core);
    if (found.length > 0) {
      showFailedAttempt(found);
      return;
    }
    goTo(stepIndex + 1);
  };

  const dismissReset = () => {
    dismissingReset.current = true;
    profile.dismissReset();
  };

  const state = profile.state;
  const showReset = state.status === "reset";
  const showStorage = state.status !== "unhydrated" && !state.storageAvailable;
  const lastLabel = mode === "edit" ? t("common.saveChanges") : t("common.seeMatches");
  const why = t(`steps.${stepId}.why`);

  return (
    <div className={PAGE_GRID}>
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
          <Notice dismissLabel={t("common.dismiss")} onDismiss={dismissReset}>
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
          issues={summary}
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
                <ChevronDownIcon className="size-4 transition-transform group-open:rotate-180" />
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
                <ArrowIcon direction="back" data-icon="inline-start" />
                {t("common.back")}
              </Button>
            )}
            <Button type="submit" size="lg" className="flex-1 lg:flex-none">
              {stepId === "review" ? lastLabel : t("common.next")}
              <ArrowIcon direction="forward" data-icon="inline-end" />
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
