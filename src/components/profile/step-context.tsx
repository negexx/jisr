"use client";

import { createContext, useContext } from "react";

import type { CoreShard } from "@/data-schema/snapshot";
import type { AppLocale } from "@/i18n/routing";
import type { FormState, StepId } from "@/lib/profile/form/state";
import type { TextLookup } from "@/lib/snapshot/text";

export type StepContextValue = {
  form: FormState;
  update: (change: (draft: FormState) => void) => void;
  core: CoreShard;
  text: TextLookup;
  locale: AppLocale;
  // The message for the first issue of a control, or undefined when it has none.
  errorFor: (path: string) => string | undefined;
  goToStep: (step: StepId) => void;
  // Moves focus to the element with this id once the next render has committed.
  focusAfterRender: (id: string) => void;
};

const StepContext = createContext<StepContextValue | null>(null);

export const StepProvider = StepContext.Provider;

export function useStep(): StepContextValue {
  const value = useContext(StepContext);
  if (value === null) throw new Error("useStep must be used inside the profile form");
  return value;
}
