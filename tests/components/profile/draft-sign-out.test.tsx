// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AUTOSAVE_DELAY_MS, useDraftAutosave } from "@/components/profile/use-draft-autosave";
import type { CoreShard } from "@/data-schema/snapshot";
import { ACCOUNT_DRAFT_KEY } from "@/lib/account-cache";
import { clearAccountLocalState, setSessionHint } from "@/lib/auth/session-hint";
import { emptyFormState, type FormState } from "@/lib/profile/form/state";
import { DRAFT_KEY } from "@/lib/profile/storage";

// The profile form's autosave writes its draft only under the key of the mode it was opened in:
// the account's grades never reach the guest's `jisr.profile-draft` after a sign-out elsewhere.

const CORE = { credentialTypes: [] } as unknown as CoreShard;
const BASELINE = emptyFormState(CORE);

function edited(nationality: string): FormState {
  return { ...structuredClone(BASELINE), nationality };
}

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("useDraftAutosave across a sign-out", () => {
  it("writes the signed-in draft under the account key while signed in", () => {
    setSessionHint();
    const { rerender } = renderHook(({ form }) => useDraftAutosave(form, 0, BASELINE), {
      initialProps: { form: BASELINE },
    });
    rerender({ form: edited("MA") });
    act(() => vi.advanceTimersByTime(AUTOSAVE_DELAY_MS));
    expect(window.localStorage.getItem(ACCOUNT_DRAFT_KEY)).toContain('"MA"');
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("stops writing once the device signed out while the form was open", () => {
    setSessionHint();
    window.localStorage.setItem(DRAFT_KEY, "guest draft bytes");
    const { rerender, unmount } = renderHook(
      ({ form, step }) => useDraftAutosave(form, step, BASELINE),
      { initialProps: { form: BASELINE, step: 0 } },
    );
    act(() => clearAccountLocalState());

    rerender({ form: edited("MA"), step: 0 });
    act(() => vi.advanceTimersByTime(AUTOSAVE_DELAY_MS));
    rerender({ form: edited("MA"), step: 1 });
    window.dispatchEvent(new Event("pagehide"));
    unmount();

    expect(window.localStorage.getItem(DRAFT_KEY)).toBe("guest draft bytes");
    expect(window.localStorage.getItem(ACCOUNT_DRAFT_KEY)).toBeNull();
  });

  it("does not write a guest form's answers into the account draft after a sign-in elsewhere", () => {
    const { rerender } = renderHook(({ form }) => useDraftAutosave(form, 0, BASELINE), {
      initialProps: { form: BASELINE },
    });
    act(() => setSessionHint());
    rerender({ form: edited("MA") });
    act(() => vi.advanceTimersByTime(AUTOSAVE_DELAY_MS));
    expect(window.localStorage.getItem(ACCOUNT_DRAFT_KEY)).toBeNull();
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});
