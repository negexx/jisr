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

const CURRENCIES = ["EUR", "MAD"];
const PERIODS = ["month", "year"];

// The budget selects have no blank choice, so a value they do not offer (an older draft wrote a
// blank one) becomes the default: what the control shows is then what the form holds.
function withOfferedBudgetChoices(form: FormState): void {
  if (!CURRENCIES.includes(form.budget.currency)) form.budget.currency = "EUR";
  if (!PERIODS.includes(form.budget.period)) form.budget.period = "month";
}

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
  withOfferedBudgetChoices(form);
  return { form, stepIndex: step, mode, draftRestored: true, baseline };
}
