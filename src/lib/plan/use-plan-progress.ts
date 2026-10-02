"use client";

import { useMemo, useSyncExternalStore } from "react";

import type { ChecklistStepId } from "@/domain/types";

import { doneSteps as doneStepsOf, EMPTY_PROGRESS } from "./progress";
import { planStore, setStepDone } from "./store";

export type UsePlanProgress = {
  hydrated: boolean;
  doneSteps: (slug: string) => readonly ChecklistStepId[];
  setDone: (slug: string, step: ChecklistStepId, done: boolean) => void;
};

export function usePlanProgress(): UsePlanProgress {
  const state = useSyncExternalStore(
    planStore.subscribe,
    planStore.getSnapshot,
    planStore.getServerSnapshot,
  );
  return useMemo(() => {
    const progress = state.status === "ready" ? state.value : EMPTY_PROGRESS;
    return {
      hydrated: state.status === "ready",
      doneSteps: (slug) => doneStepsOf(progress, slug),
      setDone: setStepDone,
    };
  }, [state]);
}
