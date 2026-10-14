import { useCallback, useEffect, useRef } from "react";

import { inAccountMode } from "@/lib/account-cache";
import { clearDraft, writeDraft } from "@/lib/profile/draft";
import { draftFromForm, type FormState } from "@/lib/profile/form/state";
import { getLocalStorage } from "@/lib/profile/storage";

export const AUTOSAVE_DELAY_MS = 400;

type Latest = { form: FormState; step: number };

// Keeps the unfinished answers in localStorage: 400 ms after the last change, at once on a step
// change, and once more when the page is left or hidden. Nothing is written until the form differs
// from `baseline` (so opening the page and leaving does not create a draft), and a form that goes
// back to `baseline` removes the draft. A failed write is ignored:
// the page already tells the student when this device cannot save.
export function useDraftAutosave(form: FormState, step: number, baseline: FormState) {
  const baselineJson = useRef(JSON.stringify(baseline));
  const latest = useRef<Latest>({ form, step });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(false);
  const suspended = useRef(false);
  const mounted = useRef(false);
  // The draft key follows the sign-in hint (draft.ts). A form opened signed in and still open after
  // a sign-out elsewhere (another tab, an expired session) would otherwise write the account's
  // answers into the guest's draft, or the reverse: it only writes in the mode it was opened in.
  const accountModeAtMount = useRef(false);

  const write = useCallback(() => {
    pending.current = false;
    if (suspended.current) return;
    if (inAccountMode() !== accountModeAtMount.current) return;
    const storage = getLocalStorage();
    if (storage === null) return;
    const { form: current, step: currentStep } = latest.current;
    // Back to where it started: an older draft would only bring stale answers back.
    if (JSON.stringify(current) === baselineJson.current) {
      clearDraft(storage);
      return;
    }
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
    accountModeAtMount.current = inAccountMode();
    mounted.current = true;
    const flush = () => {
      if (!pending.current) return;
      if (timer.current !== null) clearTimeout(timer.current);
      write();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    // A phone browser may discard the tab without ever running the timer.
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
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
