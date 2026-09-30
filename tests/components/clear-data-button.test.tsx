// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ClearDataButton } from "@/components/clear-data-button";
import type { AppLocale } from "@/i18n/routing";
import { profileStore } from "@/lib/profile/store";

import { renderIntl } from "./intl";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type Copy = { trigger: string; title: string; description: RegExp; cancel: string };

const COPY: Record<AppLocale, Copy> = {
  fr: {
    trigger: "Effacer mes données",
    title: "Effacer mes données ?",
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
    renderIntl(<ClearDataButton />, locale);
    expect(screen.queryByRole("alertdialog")).toBeNull();

    await user.click(screen.getByRole("button", { name: copy.trigger }));

    const dialog = await screen.findByRole("alertdialog", { name: copy.title });
    expect(dialog.textContent).toMatch(copy.description);
    expect(clear).not.toHaveBeenCalled();
  });

  it("does not clear when the student cancels, and returns focus to the trigger", async () => {
    const clear = vi.spyOn(profileStore, "clear");
    const user = userEvent.setup();
    renderIntl(<ClearDataButton />, locale);
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
    renderIntl(<ClearDataButton />, locale);
    await user.click(screen.getByRole("button", { name: copy.trigger }));
    const dialog = await screen.findByRole("alertdialog");
    const confirm = Array.from(dialog.querySelectorAll("button")).find(
      (button) => button.textContent === copy.trigger,
    );
    if (!confirm) throw new Error("confirm button not found");

    await user.click(confirm);

    await waitFor(() => expect(clear).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });
});
