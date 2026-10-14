// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ClearDataButton } from "@/components/clear-data-button";
import type { AppLocale } from "@/i18n/routing";
import { AUTH_HINT_KEY, clearAccountLocalState, setSessionHint } from "@/lib/auth/session-hint";
import { PROFILE_KEY } from "@/lib/profile/storage";

import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { renderIntl, shellProps } from "./intl";

// Clear my data while this browser is signed in: the account copy, one session-checked action
// (stood in for here; the rows are covered by tests/lib/server/import.test.ts), and the guest
// behaviour unchanged when signed out or while accounts are off.

const sync = vi.hoisted(() => ({
  clearAccountEverywhere: vi.fn<() => Promise<"cleared" | "signed_out" | "failed">>(),
}));
vi.mock("@/lib/account-sync/client", () => ({
  clearAccountEverywhere: sync.clearAccountEverywhere,
}));

const CATALOGS = { fr, en, ar };

function copyWithAccount(locale: AppLocale) {
  return { ...shellProps(locale).clearData, signedIn: CATALOGS[locale].clearDataAccount };
}

beforeEach(() => {
  window.localStorage.clear();
  sync.clearAccountEverywhere.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

async function openDialog(locale: AppLocale) {
  const user = userEvent.setup();
  renderIntl(<ClearDataButton copy={copyWithAccount(locale)} />, locale);
  await user.click(screen.getByRole("button", { name: CATALOGS[locale].clearData.trigger }));
  return { user, dialog: await screen.findByRole("alertdialog") };
}

describe.each(["fr", "ar", "en"] as const)("Clear my data while signed in (%s)", (locale) => {
  const account = CATALOGS[locale].clearDataAccount;

  beforeEach(() => setSessionHint());

  it("says the account's data goes too, and clears through the account action", async () => {
    sync.clearAccountEverywhere.mockResolvedValue("cleared");
    const { user, dialog } = await openDialog(locale);
    expect(within(dialog).getByRole("heading", { name: account.title })).toBeTruthy();
    expect(dialog.textContent).toContain(account.description);

    await user.click(within(dialog).getByRole("button", { name: account.confirm }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(sync.clearAccountEverywhere).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(AUTH_HINT_KEY)).toBe("true");
  });

  it("stays open with a notice and removes nothing local when the account could not be cleared", async () => {
    window.localStorage.setItem(PROFILE_KEY, "kept");
    sync.clearAccountEverywhere.mockResolvedValue("failed");
    const { user, dialog } = await openDialog(locale);
    await user.click(within(dialog).getByRole("button", { name: account.confirm }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe(account.failed);
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(window.localStorage.getItem(PROFILE_KEY)).toBe("kept");
  });

  it("falls back to the device-only copy once the server says the session is gone", async () => {
    sync.clearAccountEverywhere.mockImplementation(async () => {
      clearAccountLocalState();
      return "signed_out";
    });
    const { user, dialog } = await openDialog(locale);
    await user.click(within(dialog).getByRole("button", { name: account.confirm }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe(account.signedOut);
    expect(
      within(dialog).getByRole("heading", { name: CATALOGS[locale].clearData.title }),
    ).toBeTruthy();
  });
});

describe("Clear my data stays the device-only clear", () => {
  it("when signed out, even with the account copy available", async () => {
    window.localStorage.setItem(PROFILE_KEY, "gone");
    const { user, dialog } = await openDialog("fr");
    expect(within(dialog).getByRole("heading", { name: fr.clearData.title })).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: fr.clearData.confirm }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(window.localStorage.getItem(PROFILE_KEY)).toBeNull();
    expect(sync.clearAccountEverywhere).not.toHaveBeenCalled();
  });

  it("while accounts are off, even with a leftover sign-in hint", async () => {
    setSessionHint();
    const user = userEvent.setup();
    renderIntl(<ClearDataButton copy={shellProps("en").clearData} />, "en");
    await user.click(screen.getByRole("button", { name: en.clearData.trigger }));
    const dialog = await screen.findByRole("alertdialog", { name: en.clearData.title });
    await user.click(within(dialog).getByRole("button", { name: en.clearData.confirm }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(sync.clearAccountEverywhere).not.toHaveBeenCalled();
  });
});
