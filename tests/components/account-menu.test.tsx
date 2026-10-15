// @vitest-environment jsdom
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccountMenu, type AccountMenuLabels } from "@/components/auth/account-menu";
import { CURRENT_CONSENT_VERSION } from "@/lib/auth/consent";
import { forgetSession } from "@/lib/auth/session-client";
import { ACCOUNT_CACHE_PREFIX, AUTH_HINT_KEY, setSessionHint } from "@/lib/auth/session-hint";
import { PLAN_KEY } from "@/lib/plan/progress";
import { PROFILE_KEY } from "@/lib/profile/storage";
import { SAVED_KEY } from "@/lib/saved/saved";

import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { renderIntl } from "./intl";

const mocks = vi.hoisted(() => ({
  push: vi.fn<(href: string) => void>(),
  prefetch: vi.fn<(href: string) => void>(),
  pathname: "/plan",
  getSession: vi.fn<() => Promise<unknown>>(),
  signOut: vi.fn<() => Promise<unknown>>(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, prefetch: mocks.prefetch }),
}));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("@/lib/auth/client", () => ({
  authClient: { getSession: mocks.getSession, signOut: mocks.signOut },
}));

const LABELS = {
  fr: fr.account,
  en: en.account,
  ar: ar.account,
} as const satisfies Record<string, AccountMenuLabels>;

function signedInWith(consentVersion: string | null) {
  return { data: { session: {}, user: { id: "u1", consentVersion } }, error: null };
}
const SIGNED_IN = signedInWith(CURRENT_CONSENT_VERSION);
const GUEST_PROFILE = '{"guest":"profile"}';
const GUEST_SAVED = '{"guest":"saved"}';
const GUEST_PLAN = '{"guest":"plan"}';
const fetchSpy = vi.fn<typeof fetch>();

function renderMenu(locale: "fr" | "en" | "ar" = "fr") {
  return renderIntl(<AccountMenu locale={locale} labels={LABELS[locale]} />, locale);
}

beforeEach(() => {
  window.localStorage.clear();
  forgetSession();
  mocks.pathname = "/plan";
  mocks.push.mockReset();
  mocks.prefetch.mockReset();
  mocks.getSession.mockReset();
  mocks.signOut.mockReset();
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("AccountMenu for a guest", () => {
  it("renders a Sign in button, makes no request and prefetches nothing", async () => {
    const { container } = renderMenu();
    await act(async () => {});
    expect(screen.getByRole("button", { name: fr.account.signIn })).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.prefetch).not.toHaveBeenCalled();
    // A link would be prefetched by Next; the entry is a button that navigates on click.
    expect(container.querySelector("a")).toBeNull();
    expect(screen.queryByRole("button", { name: fr.account.signOut })).toBeNull();
  });

  it.each([
    ["fr", "/plan", "/fr/sign-in?return=%2Ffr%2Fplan"],
    [
      "ar",
      "/programs/de-tum-informatics-bsc",
      "/ar/sign-in?return=%2Far%2Fprograms%2Fde-tum-informatics-bsc",
    ],
    ["en", "/", "/en/sign-in?return=%2Fen"],
  ] as const)("goes to the sign-in surface of %s on click, returning to the current page", async (locale, pathname, expected) => {
    mocks.pathname = pathname;
    renderMenu(locale);
    await userEvent.setup().click(screen.getByRole("button", { name: LABELS[locale].signIn }));
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith(expected);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("does not return to the sign-in or landing pages", async () => {
    mocks.pathname = "/sign-in";
    renderMenu();
    await userEvent.setup().click(screen.getByRole("button", { name: fr.account.signIn }));
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith("/fr/sign-in?return=%2Ffr");
  });
});

describe("AccountMenu with the session hint", () => {
  beforeEach(() => setSessionHint());

  it("asks the server once, not on every render, and shows Sign out", async () => {
    mocks.getSession.mockResolvedValue(SIGNED_IN);
    const view = renderMenu();
    expect(await screen.findByRole("button", { name: fr.account.signOut })).toBeTruthy();
    view.rerender(<AccountMenu locale="fr" labels={LABELS.fr} />);
    view.rerender(<AccountMenu locale="fr" labels={LABELS.fr} />);
    await act(async () => {});
    expect(mocks.getSession).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: fr.account.signIn })).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("looks signed out with a retry and a message when the check fails, and recovers on retry", async () => {
    mocks.getSession.mockRejectedValueOnce(new TypeError("network"));
    renderMenu();
    expect(await screen.findByText(fr.account.checkFailed)).toBeTruthy();
    expect(screen.getByRole("button", { name: fr.account.signIn })).toBeTruthy();
    expect(window.localStorage.getItem(AUTH_HINT_KEY)).toBe("true");

    mocks.getSession.mockResolvedValue(SIGNED_IN);
    await userEvent.setup().click(screen.getByRole("button", { name: fr.account.retry }));
    expect(await screen.findByRole("button", { name: fr.account.signOut })).toBeTruthy();
    expect(screen.queryByText(fr.account.checkFailed)).toBeNull();
    expect(mocks.getSession).toHaveBeenCalledTimes(2);
  });

  it("drops a stale hint and the account cache when the server has no session", async () => {
    window.localStorage.setItem(`${ACCOUNT_CACHE_PREFIX}saved`, "[]");
    window.localStorage.setItem(SAVED_KEY, GUEST_SAVED);
    mocks.getSession.mockResolvedValue({ data: null, error: null });
    renderMenu();
    expect(await screen.findByRole("button", { name: fr.account.signIn })).toBeTruthy();
    expect(screen.queryByRole("button", { name: fr.account.retry })).toBeNull();
    expect(window.localStorage.getItem(AUTH_HINT_KEY)).toBeNull();
    expect(window.localStorage.getItem(`${ACCOUNT_CACHE_PREFIX}saved`)).toBeNull();
    expect(window.localStorage.getItem(SAVED_KEY)).toBe(GUEST_SAVED);
  });
});

describe.each([
  "fr",
  "ar",
] as const)("AccountMenu for an account that needs finishing (%s)", (locale) => {
  const copy = LABELS[locale];
  beforeEach(() => setSessionHint());

  it.each([
    ["a new account", null],
    ["a privacy notice that changed", "2020-01-01"],
  ])("offers to finish setting up for %s, next to Sign out", async (_label, version) => {
    mocks.getSession.mockResolvedValue(signedInWith(version));
    mocks.pathname = "/compare";
    renderMenu(locale);
    await userEvent.setup().click(await screen.findByRole("button", { name: copy.finishSetup }));
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith(
      `/${locale}/welcome?return=%2F${locale}%2Fcompare`,
    );
    expect(screen.getByRole("button", { name: copy.signOut })).toBeTruthy();
    expect(mocks.prefetch).not.toHaveBeenCalled();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("does not offer it once consent is current", async () => {
    mocks.getSession.mockResolvedValue(SIGNED_IN);
    renderMenu(locale);
    await screen.findByRole("button", { name: copy.signOut });
    expect(screen.queryByRole("button", { name: copy.finishSetup })).toBeNull();
  });

  it("does not offer it on the landing, which is where it would go", async () => {
    mocks.getSession.mockResolvedValue(signedInWith(null));
    mocks.pathname = "/welcome";
    renderMenu(locale);
    await screen.findByRole("button", { name: copy.signOut });
    await act(async () => {});
    expect(screen.queryByRole("button", { name: copy.finishSetup })).toBeNull();
  });

  it("drops the offer after the next navigation once the landing took the consent", async () => {
    mocks.getSession.mockResolvedValue(signedInWith(null));
    const view = renderMenu(locale);
    await screen.findByRole("button", { name: copy.finishSetup });
    // The landing forgets the kept answer after the student consents, then moves on.
    forgetSession();
    mocks.getSession.mockResolvedValue(SIGNED_IN);
    mocks.pathname = "/compare";
    view.rerender(<AccountMenu locale={locale} labels={copy} />);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: copy.finishSetup })).toBeNull(),
    );
    expect(mocks.getSession).toHaveBeenCalledTimes(2);
  });
});

describe("AccountMenu sign-out", () => {
  beforeEach(() => {
    setSessionHint();
    window.localStorage.setItem(`${ACCOUNT_CACHE_PREFIX}saved`, "[]");
    window.localStorage.setItem(`${ACCOUNT_CACHE_PREFIX}profile`, "{}");
    window.localStorage.setItem(PROFILE_KEY, GUEST_PROFILE);
    window.localStorage.setItem(SAVED_KEY, GUEST_SAVED);
    window.localStorage.setItem(PLAN_KEY, GUEST_PLAN);
    mocks.getSession.mockResolvedValue(SIGNED_IN);
  });

  it("clears the hint and the account cache and keeps the guest data (B5)", async () => {
    mocks.signOut.mockResolvedValue({ data: { success: true }, error: null });
    renderMenu();
    await userEvent.setup().click(await screen.findByRole("button", { name: fr.account.signOut }));
    expect(await screen.findByRole("button", { name: fr.account.signIn })).toBeTruthy();
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(AUTH_HINT_KEY)).toBeNull();
    expect(window.localStorage.getItem(`${ACCOUNT_CACHE_PREFIX}saved`)).toBeNull();
    expect(window.localStorage.getItem(`${ACCOUNT_CACHE_PREFIX}profile`)).toBeNull();
    expect(window.localStorage.getItem(PROFILE_KEY)).toBe(GUEST_PROFILE);
    expect(window.localStorage.getItem(SAVED_KEY)).toBe(GUEST_SAVED);
    expect(window.localStorage.getItem(PLAN_KEY)).toBe(GUEST_PLAN);
  });

  it.each([
    [
      "an error answer",
      () => mocks.signOut.mockResolvedValue({ data: null, error: { status: 500 } }),
    ],
    ["a network failure", () => mocks.signOut.mockRejectedValue(new TypeError("network"))],
  ])("keeps the hint and everything stored after %s, and says so", async (_label, arrange) => {
    arrange();
    renderMenu();
    await userEvent.setup().click(await screen.findByRole("button", { name: fr.account.signOut }));
    expect(await screen.findByText(fr.account.signOutFailed)).toBeTruthy();
    expect(screen.getByRole("button", { name: fr.account.signOut })).toBeTruthy();
    expect(window.localStorage.getItem(AUTH_HINT_KEY)).toBe("true");
    expect(window.localStorage.getItem(`${ACCOUNT_CACHE_PREFIX}saved`)).toBe("[]");
  });

  it("asks for a new session check after signing out and in again", async () => {
    mocks.signOut.mockResolvedValue({ data: { success: true }, error: null });
    renderMenu();
    await userEvent.setup().click(await screen.findByRole("button", { name: fr.account.signOut }));
    await screen.findByRole("button", { name: fr.account.signIn });
    act(() => setSessionHint());
    await waitFor(() => expect(mocks.getSession).toHaveBeenCalledTimes(2));
  });
});
