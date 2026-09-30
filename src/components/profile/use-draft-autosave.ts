import { useCallback, useEffect, useRef } from "react";

import { writeDraft } from "@/lib/profile/draft";
import { draftFromForm, type FormState } from "@/lib/profile/form/state";
import { getLocalStorage } from "@/lib/profile/storage";

export const AUTOSAVE_DELAY_MS = 400;

type Latest = { form: FormState; step: number };

// Keeps the unfinished answers in localStorage: 400 ms after the last change, at once on a step
// change, and once more when the page is left. Nothing is written until the form differs from
// `baseline`, so opening the page and leaving does not create a draft. A failed write is ignored:
// the page already tells the student when this device cannot save.
export function useDraftAutosave(form: FormState, step: number, baseline: FormState) {
  const baselineJson = useRef(JSON.stringify(baseline));
  const latest = useRef<Latest>({ form, step });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(false);
  const suspended = useRef(false);
  const mounted = useRef(false);

  const write = useCallback(() => {
    pending.current = false;
    if (suspended.current) return;
    const storage = getLocalStorage();
    if (storage === null) return;
    const { form: current, step: currentStep } = latest.current;
    if (JSON.stringify(current) === baselineJson.current) return;
    writeDraft(storage, draftFromForm(current, currentStep));
  }, []);

  useEffect(() => {
    latest.current = { form, step };
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: `form` is the trigger, the timer reads the latest form from a ref
  useEffect(() => {
    if (!mounted.current) return;
    pending.current = true;
    timer.current = setTimeout(write, AUTOSAVE_DELAY_MS);
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [form, write]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `step` is the trigger, the write reads the latest step from a ref
  useEffect(() => {
    if (!mounted.current) return;
    if (timer.current !== null) clearTimeout(timer.current);
    write();
  }, [step, write]);

  // Declared last: on the first run it only arms the effects above for later changes.
  useEffect(() => {
    mounted.current = true;
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      if (pending.current) write();
    };
  }, [write]);

  // The saved profile replaces the draft (the store clears it): a late write must not bring it back.
  const suspend = useCallback(() => {
    suspended.current = true;
    pending.current = false;
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);
  const resume = useCallback(() => {
    suspended.current = false;
  }, []);

  return { suspend, resume };
}
