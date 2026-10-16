// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccountDeleteConfirm } from "@/components/auth/account-delete-confirm";
import { ACCOUNT_DELETE_MESSAGE_NAMESPACES } from "@/components/auth/namespaces";
import type { AppLocale } from "@/i18n/routing";
import {
  confirmAccountDeletion,
  readDeletionToken,
  requestAccountDeletion,
} from "@/lib/auth/account-deletion";
import { AUTH_HINT_KEY } from "@/lib/auth/session-hint";
import { type MessageTree, pickMessages } from "@/lib/i18n/client-messages";
import { PLAN_KEY } from "@/lib/plan/progress";
import { PROFILE_KEY } from "@/lib/profile/storage";
import { SAVED_KEY } from "@/lib/saved/saved";

import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";

type DeleteResult = { data: unknown; error: { status: number; code?: string } | null };

const mocks = vi.hoisted(() => ({
  deleteUser: vi.fn<(body: { token?: string; callbackURL?: string }) => Promise<DeleteResult>>(),
}));

vi.mock("@/lib/auth/client", () => ({ authClient: { deleteUser: mocks.deleteUser } }));

const CATALOGS = { fr, en, ar };
const DEVICE_KEYS = [
  PROFILE_KEY,
  SAVED_KEY,
  PLAN_KEY,
  "jisr.profile-draft",
  AUTH_HINT_KEY,
  "jisr.account.profile",
  "jisr.account.saved",
];

function seedDevice(): void {
  for (const key of DEVICE_KEYS) window.localStorage.setItem(key, "{}");
  window.localStorage.setItem(AUTH_HINT_KEY, "true");
  window.localStorage.setItem("unrelated", "keep");
}

function jisrKeys(): string[] {
  return Object.keys(window.localStorage).filter((key) => key.startsWith("jisr."));
}

const deleted: DeleteResult = { data: { success: true, message: "User deleted" }, error: null };

beforeEach(() => {
  window.localStorage.clear();
  mocks.deleteUser.mockReset();
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("requestAccountDeletion", () => {
  it("asks Better Auth to email a link back to this locale's confirm page", async () => {
    mocks.deleteUser.mockResolvedValue({
      data: { success: true, message: "Verification email sent" },
      error: null,
    });
    expect(await requestAccountDeletion("ar")).toBe("sent");
    expect(mocks.deleteUser).toHaveBeenCalledWith({ callbackURL: "/ar/account/delete" });
  });

  it.each([
    [{ status: 401, code: "UNAUTHORIZED" }, "signed-out"],
    [{ status: 403, code: "ACCOUNTS_DISABLED" }, "unavailable"],
    [{ status: 500 }, "failed"],
  ] as const)("maps %o to %s", async (error, outcome) => {
    mocks.deleteUser.mockResolvedValue({ data: null, error });
    expect(await requestAccountDeletion("fr")).toBe(outcome);
  });

  it("is 'failed' when the auth client cannot load or the network fails", async () => {
    mocks.deleteUser.mockRejectedValue(new TypeError("network"));
    expect(await requestAccountDeletion("fr")).toBe("failed");
  });
});

describe("confirmAccountDeletion", () => {
  it("deletes with the token, then removes every jisr. key from this device (ruling Q6)", async () => {
    seedDevice();
    mocks.deleteUser.mockResolvedValue(deleted);
    expect(await confirmAccountDeletion("tok123")).toBe("deleted");
    expect(mocks.deleteUser).toHaveBeenCalledWith({ token: "tok123" });
    expect(jisrKeys()).toEqual([]);
    expect(window.localStorage.getItem("unrelated")).toBe("keep");
  });

  it.each([
    [{ status: 404, code: "INVALID_TOKEN" }, "invalid-token"],
    [{ status: 401, code: "UNAUTHORIZED" }, "signed-out"],
    [{ status: 403, code: "ACCOUNTS_DISABLED" }, "unavailable"],
    [{ status: 500 }, "failed"],
  ] as const)("keeps this device's data when refused with %o (%s)", async (error, outcome) => {
    seedDevice();
    mocks.deleteUser.mockResolvedValue({ data: null, error });
    expect(await confirmAccountDeletion("tok123")).toBe(outcome);
    expect(jisrKeys().sort()).toEqual([...DEVICE_KEYS].sort());
  });
});

describe("readDeletionToken", () => {
  it.each([
    ["#token=abc0123456789xyz", "abc0123456789xyz"],
    ["token=abc0123456789xyz", "abc0123456789xyz"],
    ["", null],
    ["#token=", null],
    ["#token=a%20b", null],
    [`#token=${"a".repeat(129)}`, null],
  ])("reads %s as %s", (search, token) => {
    expect(readDeletionToken(search)).toBe(token);
  });
});

function renderPage(locale: AppLocale) {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={pickMessages(CATALOGS[locale] as MessageTree, ACCOUNT_DELETE_MESSAGE_NAMESPACES)}
    >
      <AccountDeleteConfirm locale={locale} />
    </NextIntlClientProvider>,
  );
}

describe("the confirm page", () => {
  it("deletes nothing on opening, strips the token from the address, and deletes on the button", async () => {
    seedDevice();
    window.history.replaceState(null, "", "/fr/account/delete#token=tok123");
    mocks.deleteUser.mockResolvedValue(deleted);
    renderPage("fr");

    const button = await screen.findByRole("button", { name: fr.accountDelete.confirm });
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/fr/account/delete");

    await userEvent.click(button);
    expect(await screen.findByText(fr.accountDelete.deleted.title)).toBeTruthy();
    expect(mocks.deleteUser).toHaveBeenCalledWith({ token: "tok123" });
    expect(jisrKeys()).toEqual([]);
    expect(
      screen.getByRole("link", { name: fr.accountDelete.deleted.home }).getAttribute("href"),
    ).toBe("/fr");
  });

  it("shows the typed error for an invalid link and keeps the device's data", async () => {
    seedDevice();
    window.history.replaceState(null, "", "/ar/account/delete#token=garbage");
    mocks.deleteUser.mockResolvedValue({
      data: null,
      error: { status: 404, code: "INVALID_TOKEN" },
    });
    renderPage("ar");

    await userEvent.click(await screen.findByRole("button", { name: ar.accountDelete.confirm }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      ar.accountDelete.errors.invalidToken,
    );
    expect(jisrKeys().length).toBe(DEVICE_KEYS.length);
  });

  it("offers sign-in when the session is gone", async () => {
    window.history.replaceState(null, "", "/en/account/delete#token=tok123");
    mocks.deleteUser.mockResolvedValue({
      data: null,
      error: { status: 401, code: "UNAUTHORIZED" },
    });
    renderPage("en");

    await userEvent.click(await screen.findByRole("button", { name: en.accountDelete.confirm }));
    expect((await screen.findByRole("alert")).textContent).toBe(en.accountDelete.errors.signedOut);
    expect(
      screen.getByRole("link", { name: en.accountDelete.errors.signIn }).getAttribute("href"),
    ).toBe("/en/sign-in?return=%2Fen");
  });

  it.each([
    "fr",
    "en",
    "ar",
  ] as const)("treats a signed-out answer to a submitted token as probably deleted and offers to erase the device (%s)", async (locale) => {
    const messages = CATALOGS[locale].accountDelete.errors;
    seedDevice();
    window.history.replaceState(null, "", `/${locale}/account/delete#token=tok123`);
    mocks.deleteUser.mockResolvedValue({
      data: null,
      error: { status: 401, code: "UNAUTHORIZED" },
    });
    renderPage(locale);

    await userEvent.click(
      await screen.findByRole("button", { name: CATALOGS[locale].accountDelete.confirm }),
    );
    expect((await screen.findByRole("alert")).textContent).toBe(messages.signedOut);
    // Nothing is erased until the student asks: the link may have been opened signed out on a
    // device that was never part of the deleted account.
    expect(jisrKeys().length).toBe(DEVICE_KEYS.length);

    await userEvent.click(screen.getByRole("button", { name: messages.eraseDevice }));
    expect((await screen.findByRole("status")).textContent).toBe(messages.erased);
    expect(jisrKeys()).toEqual([]);
    expect(window.localStorage.getItem("unrelated")).toBe("keep");
    expect(screen.queryByRole("button", { name: messages.eraseDevice })).toBeNull();
  });

  it("keeps the button for a retry after a failure", async () => {
    window.history.replaceState(null, "", "/fr/account/delete#token=tok123");
    mocks.deleteUser.mockResolvedValueOnce({ data: null, error: { status: 500 } });
    mocks.deleteUser.mockResolvedValueOnce(deleted);
    renderPage("fr");

    await userEvent.click(await screen.findByRole("button", { name: fr.accountDelete.confirm }));
    expect((await screen.findByRole("alert")).textContent).toBe(fr.accountDelete.errors.failed);
    await userEvent.click(screen.getByRole("button", { name: fr.accountDelete.confirm }));
    await waitFor(() => expect(screen.getByText(fr.accountDelete.deleted.title)).toBeTruthy());
  });

  it("says the link is not valid when it carries no token, and calls nothing", async () => {
    window.history.replaceState(null, "", "/fr/account/delete");
    renderPage("fr");
    expect((await screen.findByRole("alert")).textContent).toBe(
      fr.accountDelete.errors.invalidToken,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("re-reads the fragment when a second deletion link opens in the same tab without a reload", async () => {
    window.history.replaceState(null, "", "/fr/account/delete#token=first");
    mocks.deleteUser.mockResolvedValue(deleted);
    renderPage("fr");
    await screen.findByRole("button", { name: fr.accountDelete.confirm });

    // Opening another emailed link in this tab only changes the fragment: no reload, no remount.
    window.location.hash = "#token=second";
    await userEvent.click(await screen.findByRole("button", { name: fr.accountDelete.confirm }));
    await waitFor(() => expect(mocks.deleteUser).toHaveBeenCalledWith({ token: "second" }));
  });
});
