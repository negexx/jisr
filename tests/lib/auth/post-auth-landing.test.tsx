// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WELCOME_MESSAGE_NAMESPACES } from "@/components/auth/namespaces";
import { PostAuthLanding } from "@/components/auth/post-auth-landing";
import { localeDirection } from "@/i18n/direction";
import type { AppLocale } from "@/i18n/routing";
import { CURRENT_CONSENT_VERSION } from "@/lib/auth/consent";
import { forgetSession } from "@/lib/auth/session-client";
import { AUTH_HINT_KEY } from "@/lib/auth/session-hint";
import { type MessageTree, pickMessages } from "@/lib/i18n/client-messages";

import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";

const mocks = vi.hoisted(() => {
  const replace = vi.fn<(href: string) => void>();
  return {
    replace,
    // One object for every render, like Next's router.
    router: { replace },
    getSession: vi.fn<() => Promise<unknown>>(),
    acceptCurrentConsent: vi.fn<() => Promise<unknown>>(),
    seam: vi.fn<() => Promise<void>>(),
  };
});

// The gate's privacy link pulls in next-intl's navigation, which needs the rest of next/navigation.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => mocks.router,
}));
vi.mock("@/lib/auth/client", () => ({ authClient: { getSession: mocks.getSession } }));
vi.mock("@/lib/server/consent", () => ({ acceptCurrentConsent: mocks.acceptCurrentConsent }));
vi.mock("@/lib/auth/post-auth", () => ({ runPostAuthSeam: mocks.seam }));

const CATALOGS = { fr, en, ar };

function sessionWith(consentVersion: string | null) {
  return { data: { session: {}, user: { id: "u1", consentVersion } }, error: null };
}

function throwOnIntlError(error: Error): never {
  throw error;
}

function renderLanding(locale: AppLocale, search: string) {
  window.history.replaceState(null, "", `/${locale}/welcome${search}`);
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={pickMessages(CATALOGS[locale] as MessageTree, WELCOME_MESSAGE_NAMESPACES)}
      onError={throwOnIntlError}
      timeZone="UTC"
    >
      <div dir={localeDirection(locale)}>
        <PostAuthLanding locale={locale} />
      </div>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  forgetSession();
  mocks.replace.mockReset();
  mocks.getSession.mockReset();
  mocks.acceptCurrentConsent.mockReset();
  mocks.seam.mockReset();
  mocks.seam.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("post-auth landing with a ready account", () => {
  it.each([
    ["fr", "?return=%2Ffr%2Fcompare", "/fr/compare"],
    [
      "ar",
      "?return=%2Far%2Fprograms%2Fde-tum-informatics-bsc",
      "/ar/programs/de-tum-informatics-bsc",
    ],
    ["en", "", "/en/plan"],
    ["fr", "?return=", "/fr/plan"],
  ] as const)("sets the hint, runs the seam and replaces to the %s return %s", async (locale, search, target) => {
    mocks.getSession.mockResolvedValue(sessionWith(CURRENT_CONSENT_VERSION));
    renderLanding(locale, search);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(target));
    expect(window.localStorage.getItem(AUTH_HINT_KEY)).toBe("true");
    expect(mocks.seam).toHaveBeenCalledTimes(1);
    expect(mocks.getSession).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["an absolute URL", "?return=https%3A%2F%2Fevil.example%2Ffr"],
    ["a protocol-relative URL", "?return=%2F%2Fevil.example"],
    ["another locale's path", "?return=%2Fen%2Fplan"],
    ["a path with a query", "?return=%2Ffr%2Fplan%3Fx%3D1"],
    ["a path without a locale", "?return=%2Fplan"],
  ])("never leaves the site for %s", async (_label, search) => {
    mocks.getSession.mockResolvedValue(sessionWith(CURRENT_CONSENT_VERSION));
    renderLanding("fr", search);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledTimes(1));
    const [target] = mocks.replace.mock.calls[0] ?? [];
    expect(target === "/fr" || target === "/fr/plan" || target === "/en/plan").toBe(true);
    expect(String(target)).not.toContain("evil");
  });

  it("moves on only after the post-auth step has finished", async () => {
    mocks.getSession.mockResolvedValue(sessionWith(CURRENT_CONSENT_VERSION));
    let finish: () => void = () => {};
    mocks.seam.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    renderLanding("fr", "?return=%2Ffr%2Fplan");
    await waitFor(() => expect(mocks.seam).toHaveBeenCalledTimes(1));
    expect(mocks.replace).not.toHaveBeenCalled();
    await act(async () => finish());
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/fr/plan");
  });
});

describe("post-auth landing before the account is ready", () => {
  it("holds a new user at the finish-signup gate, then completes after consent", async () => {
    mocks.getSession.mockResolvedValue(sessionWith(null));
    mocks.acceptCurrentConsent.mockResolvedValue({ ok: true });
    renderLanding("fr", "?return=%2Ffr%2Fplan");
    const copy = fr.signup;
    expect(await screen.findByRole("heading", { name: copy.gate.titleNew })).toBeTruthy();
    expect(window.localStorage.getItem(AUTH_HINT_KEY)).toBeNull();
    expect(mocks.seam).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("checkbox", { name: new RegExp(copy.consent.label.slice(0, 20)) }),
    );
    await user.click(screen.getByRole("button", { name: copy.gate.submit }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/fr/plan"));
    expect(window.localStorage.getItem(AUTH_HINT_KEY)).toBe("true");
    expect(mocks.seam).toHaveBeenCalledTimes(1);
  });

  it("holds a user who agreed to an older notice at the gate", async () => {
    mocks.getSession.mockResolvedValue(sessionWith("2020-01-01"));
    renderLanding("en", "?return=%2Fen%2Fplan");
    expect(await screen.findByRole("heading", { name: en.signup.gate.titleChanged })).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

describe("post-auth landing without a session", () => {
  it("forwards Better Auth's error to the sign-in page, keeping the return, without asking the server", async () => {
    renderLanding("fr", "?return=%2Ffr%2Fcompare&error=AGE_NOT_CONFIRMED");
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledTimes(1));
    expect(mocks.replace).toHaveBeenCalledWith(
      "/fr/sign-in?return=%2Ffr%2Fcompare&error=AGE_NOT_CONFIRMED",
    );
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(AUTH_HINT_KEY)).toBeNull();
  });

  it("forwards EMAIL_COOLDOWN in Arabic and defaults the return to the plan", async () => {
    renderLanding("ar", "?error=EMAIL_COOLDOWN");
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        "/ar/sign-in?return=%2Far%2Fplan&error=EMAIL_COOLDOWN",
      ),
    );
  });

  it("does not forward an error that is not a plain code", async () => {
    renderLanding("fr", "?error=%3Cscript%3E");
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledTimes(1));
    expect(mocks.replace).toHaveBeenCalledWith("/fr/sign-in?return=%2Ffr%2Fplan&error=UNKNOWN");
  });

  it("sends a visitor with no session to the sign-in page", async () => {
    mocks.getSession.mockResolvedValue({ data: null, error: null });
    renderLanding("fr", "?return=%2Ffr%2Fplan");
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledTimes(1));
    expect(mocks.replace).toHaveBeenCalledWith("/fr/sign-in?return=%2Ffr%2Fplan&error=NO_SESSION");
    expect(window.localStorage.getItem(AUTH_HINT_KEY)).toBeNull();
    expect(mocks.seam).not.toHaveBeenCalled();
  });

  it("shows a retry, not a blank page, when the session check fails, and finishes on retry", async () => {
    mocks.getSession.mockRejectedValueOnce(new TypeError("network"));
    renderLanding("fr", "?return=%2Ffr%2Fplan");
    expect(await screen.findByText(fr.welcome.failed)).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalled();

    mocks.getSession.mockResolvedValue(sessionWith(CURRENT_CONSENT_VERSION));
    await userEvent.setup().click(screen.getByRole("button", { name: fr.welcome.retry }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/fr/plan"));
  });
});
