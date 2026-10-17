import type { CoreShard } from "@/data-schema/snapshot";
import { readDraft } from "@/lib/profile/draft";
import {
  emptyFormState,
  type FormState,
  formFromDraft,
  formFromProfile,
} from "@/lib/profile/form/state";
import type { StorageLike } from "@/lib/profile/storage";
import type { ProfileState } from "@/lib/profile/store";

export type InitialWizardState = {
  form: FormState;
  stepIndex: number;
  mode: "create" | "edit";
  draftRestored: boolean;
  // What "nothing changed yet" looks like: the draft is only written once the form differs from it.
  baseline: FormState;
};

// A kept draft wins over the saved profile (the student was in the middle of a change); the mode
// still follows the saved profile.
export function initialWizardState(
  core: CoreShard,
  profile: ProfileState,
  storage: StorageLike | null,
): InitialWizardState {
  const saved = profile.status === "ok" ? profile.profile : null;
  const baseline = saved === null ? emptyFormState(core) : formFromProfile(saved);
  const mode = saved === null ? "create" : "edit";
  const draft = storage === null ? null : readDraft(storage);
  if (draft === null)
    return { form: structuredClone(baseline), stepIndex: 0, mode, draftRestored: false, baseline };
  const { form, step } = formFromDraft(draft, core);
  return { form, stepIndex: step, mode, draftRestored: true, baseline };
}
