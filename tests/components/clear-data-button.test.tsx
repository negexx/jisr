// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ClearDataButton } from "@/components/clear-data-button";
import type { AppLocale } from "@/i18n/routing";
import { PLAN_KEY } from "@/lib/plan/progress";
import { setStepDone } from "@/lib/plan/store";
import { DRAFT_KEY, PROFILE_KEY } from "@/lib/profile/storage";
import { profileStore } from "@/lib/profile/store";
import { toggleSavedProgram } from "@/lib/saved/actions";
import { SAVED_KEY } from "@/lib/saved/saved";
import { savedStore } from "@/lib/saved/store";

import { profile } from "../fixtures/domain/builders";
import { renderIntl, shellProps } from "./intl";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type Copy = { trigger: string; title: string; description: RegExp; cancel: string };

afterEach(() => {
  window.localStorage.clear();
});

const COPY: Record<AppLocale, Copy> = {
  fr: {
    trigger: "Effacer mes données",
    title: "Effacer mes données\u00a0?",
    description: /cet appareil uniquement/,
    cancel: "Annuler",
  },
  ar: {
    trigger: "مسح بياناتي",
    title: "هل تريد مسح بياناتك؟",
    description: /هذا الجهاز فقط/,
    cancel: "إلغاء",
  },
  en: {
    trigger: "Clear my data",
    title: "Clear my data?",
    description: /this device only/,
    cancel: "Cancel",
  },
};

describe.each(["fr", "ar", "en"] as const)("ClearDataButton (%s)", (locale) => {
  const copy = COPY[locale];

  it("opens a dialog that explains what is removed, without clearing anything yet", async () => {
    const clear = vi.spyOn(profileStore, "clear");
    const user = userEvent.setup();
    renderIntl(<ClearDataButton copy={shellProps(locale).clearData} />, locale);
    expect(screen.queryByRole("alertdialog")).toBeNull();

    await user.click(screen.getByRole("button", { name: copy.trigger }));

    const dialog = await screen.findByRole("alertdialog", { name: copy.title });
    expect(dialog.textContent).toMatch(copy.description);
    expect(clear).not.toHaveBeenCalled();
  });

  it("does not clear when the student cancels, and returns focus to the trigger", async () => {
    const clear = vi.spyOn(profileStore, "clear");
    const user = userEvent.setup();
    renderIntl(<ClearDataButton copy={shellProps(locale).clearData} />, locale);
    const trigger = screen.getByRole("button", { name: copy.trigger });
    await user.click(trigger);
    await user.click(await screen.findByRole("button", { name: copy.cancel }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(clear).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  });

  it("clears exactly once on confirm, then closes", async () => {
    const clear = vi.spyOn(profileStore, "clear").mockImplementation(() => {});
    const user = userEvent.setup();
    renderIntl(<ClearDataButton copy={shellProps(locale).clearData} />, locale);
    await user.click(screen.getByRole("button", { name: copy.trigger }));
    const dialog = await screen.findByRole("alertdialog");

    await user.click(within(dialog).getByRole("button", { name: copy.trigger }));

    await waitFor(() => expect(clear).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });
});

describe("ClearDataButton with the real store", () => {
  it("removes the profile, draft, saved list and plan progress, and nothing else, before it closes", async () => {
    profileStore.save(profile());
    toggleSavedProgram(
      { slug: "xx-a", country: "FR", field: "computer-science" },
      "0123456789ab",
      "2026-10-02",
    );
    setStepDone("xx-a", "visa", true);
    expect(window.localStorage.getItem(SAVED_KEY)).not.toBeNull();
    expect(window.localStorage.getItem(PLAN_KEY)).not.toBeNull();
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ schemaVersion: 1, step: 1 }));
    window.localStorage.setItem("unrelated.key", "keep me");
    expect(window.localStorage.getItem(PROFILE_KEY)).not.toBeNull();
    const user = userEvent.setup();
    renderIntl(<ClearDataButton copy={shellProps("en").clearData} />, "en");
    const trigger = screen.getByRole("button", { name: "Clear my data" });
    await user.click(trigger);
    const dialog = await screen.findByRole("alertdialog");

    await user.click(within(dialog).getByRole("button", { name: "Clear my data" }));

    expect(window.localStorage.getItem(PROFILE_KEY)).toBeNull();
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(window.localStorage.getItem(SAVED_KEY)).toBeNull();
    expect(window.localStorage.getItem(PLAN_KEY)).toBeNull();
    const saved = savedStore.getSnapshot();
    expect(saved.status === "ready" && saved.value.items).toEqual([]);
    expect(window.localStorage.getItem("unrelated.key")).toBe("keep me");
    expect(profileStore.getSnapshot().status).toBe("none");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});
