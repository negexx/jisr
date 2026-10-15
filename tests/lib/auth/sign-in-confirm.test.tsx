// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SIGN_IN_CONFIRM_MESSAGE_NAMESPACES } from "@/components/auth/namespaces";
import { SignInConfirm } from "@/components/auth/sign-in-confirm";
import type { AppLocale } from "@/i18n/routing";
import { confirmSignIn } from "@/lib/auth/sign-in-confirm";
import { type MessageTree, pickMessages } from "@/lib/i18n/client-messages";

import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";

// Todo 28, F3: the emailed sign-in link opens a page that signs in only on the button.

const CATALOGS = { fr, en, ar };
const TOKEN = "AbcdefghAbcdefghAbcdefghAbcdefgh";

const fetchMock = vi.fn<typeof fetch>();

function answer(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("confirmSignIn", () => {
  it("posts the token in a JSON body to the confirm endpoint, never in the URL", async () => {
    fetchMock.mockResolvedValue(answer(200, { status: true }));
    expect(await confirmSignIn(TOKEN)).toEqual({ kind: "signed-in" });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/auth/magic-link/confirm");
    expect(String(url)).not.toContain(TOKEN);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ token: TOKEN });
  });

  it.each([
    [400, { code: "INVALID_TOKEN" }, { kind: "refused", code: "INVALID_TOKEN" }],
    [400, { code: "AGE_NOT_CONFIRMED" }, { kind: "refused", code: "AGE_NOT_CONFIRMED" }],
    [403, { code: "ACCOUNTS_DISABLED" }, { kind: "unavailable" }],
    [403, { code: "INVALID_ORIGIN" }, { kind: "failed" }],
    [500, { code: "AUTH_MISCONFIGURED" }, { kind: "failed" }],
    [400, { code: "<script>" }, { kind: "failed" }],
  ] as const)("maps %i %o to %o", async (status, body, outcome) => {
    fetchMock.mockResolvedValue(answer(status, body));
    expect(await confirmSignIn(TOKEN)).toEqual(outcome);
  });

  it("is failed when the network fails", async () => {
    fetchMock.mockRejectedValue(new TypeError("network"));
    expect(await confirmSignIn(TOKEN)).toEqual({ kind: "failed" });
  });
});

function renderPage(locale: AppLocale, navigate = vi.fn<(url: string) => void>()) {
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={pickMessages(CATALOGS[locale] as MessageTree, SIGN_IN_CONFIRM_MESSAGE_NAMESPACES)}
    >
      <SignInConfirm locale={locale} navigate={navigate} />
    </NextIntlClientProvider>,
  );
  return navigate;
}

describe("the confirm page", () => {
  it("signs nobody in on opening, strips the fragment, and signs in on the button", async () => {
    window.history.replaceState(
      null,
      "",
      `/fr/sign-in/confirm#token=${TOKEN}&mode=signin&return=%2Ffr%2Fcompare`,
    );
    fetchMock.mockResolvedValue(answer(200, { status: true }));
    const navigate = renderPage("fr");
    const button = await screen.findByRole("button", { name: fr.signInConfirm.signin.confirm });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/fr/sign-in/confirm");
    expect(window.location.hash).toBe("");
    expect(window.location.search).toBe("");
    await userEvent.click(button);
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/fr/welcome?return=%2Ffr%2Fcompare"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("words the button for an account creation from the link's mode", async () => {
    window.history.replaceState(null, "", `/ar/sign-in/confirm#token=${TOKEN}&mode=signup`);
    renderPage("ar");
    expect(
      await screen.findByRole("button", { name: ar.signInConfirm.signup.confirm }),
    ).toBeTruthy();
    expect(screen.getByText(ar.signInConfirm.signup.body)).toBeTruthy();
  });

  it.each([
    ["INVALID_TOKEN", "/en/sign-in?return=%2Fen%2Fplan&error=INVALID_TOKEN"],
    ["AGE_NOT_CONFIRMED", "/en/sign-in?return=%2Fen%2Fplan&error=AGE_NOT_CONFIRMED"],
  ])("hands a %s refusal to the sign-in form's error state", async (code, target) => {
    window.history.replaceState(
      null,
      "",
      `/en/sign-in/confirm#token=${TOKEN}&mode=signin&return=%2Fen%2Fplan`,
    );
    fetchMock.mockResolvedValue(answer(400, { code }));
    const navigate = renderPage("en");
    await userEvent.click(
      await screen.findByRole("button", { name: en.signInConfirm.signin.confirm }),
    );
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(target));
  });

  it("keeps the button for a retry after a network failure and moves focus to the alert", async () => {
    window.history.replaceState(null, "", `/fr/sign-in/confirm#token=${TOKEN}`);
    fetchMock.mockRejectedValueOnce(new TypeError("network"));
    fetchMock.mockResolvedValueOnce(answer(200, { status: true }));
    const navigate = renderPage("fr");
    await userEvent.click(
      await screen.findByRole("button", { name: fr.signInConfirm.signin.confirm }),
    );
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(fr.signInConfirm.errors.failed);
    expect(document.activeElement).toBe(alert);
    await userEvent.click(screen.getByRole("button", { name: fr.signInConfirm.signin.confirm }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/fr/welcome?return=%2Ffr"));
  });

  it("says accounts are unavailable when the switch is off", async () => {
    window.history.replaceState(null, "", `/fr/sign-in/confirm#token=${TOKEN}`);
    fetchMock.mockResolvedValue(answer(403, { code: "ACCOUNTS_DISABLED" }));
    const navigate = renderPage("fr");
    await userEvent.click(
      await screen.findByRole("button", { name: fr.signInConfirm.signin.confirm }),
    );
    expect((await screen.findByRole("alert")).textContent).toBe(
      fr.signInConfirm.errors.unavailable,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("offers a new link when the page has no usable token, and calls nothing", async () => {
    window.history.replaceState(null, "", "/en/sign-in/confirm#token=a%20b");
    renderPage("en");
    expect((await screen.findByRole("alert")).textContent).toBe(en.signInConfirm.errors.noToken);
    expect(screen.getByRole("link", { name: en.signInConfirm.newLink }).getAttribute("href")).toBe(
      "/en/sign-in?return=%2Fen",
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
