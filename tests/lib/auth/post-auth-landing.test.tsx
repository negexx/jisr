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
import type { PostAuthStep } from "@/lib/auth/post-auth";
import { forgetSession, lookupSession } from "@/lib/auth/session-client";
import { ACCOUNT_CACHE_PREFIX, AUTH_HINT_KEY } from "@/lib/auth/session-hint";
import { SIGN_IN_BROWSER_KEY } from "@/lib/auth/sign-in-browser";
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
    seam: vi.fn<(locale: AppLocale, mode?: "auto" | "replace") => Promise<PostAuthStep>>(),
    hasGuestData: vi.fn<() => boolean>(),
    signOut: vi.fn<() => Promise<{ error: unknown }>>(),
  };
});

// The gate's privacy link pulls in next-intl's navigation, which needs the rest of next/navigation.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => mocks.router,
}));
vi.mock("@/lib/auth/client", () => ({
  authClient: { getSession: mocks.getSession, signOut: mocks.signOut },
}));
vi.mock("@/lib/server/consent", () => ({ acceptCurrentConsent: mocks.acceptCurrentConsent }));
vi.mock("@/lib/auth/post-auth", () => ({
  runPostAuthSeam: mocks.seam,
  deviceHasGuestData: mocks.hasGuestData,
}));

const CATALOGS = { fr, en, ar };

const EMAIL = "amina.b@example.com";
const MASKED = "a***@example.com";

function sessionWith(consentVersion: string | null) {
  return { data: { session: {}, user: { id: "u1", email: EMAIL, consentVersion } }, error: null };
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
  window.sessionStorage.clear();
  forgetSession();
  mocks.replace.mockReset();
  mocks.getSession.mockReset();
  mocks.acceptCurrentConsent.mockReset();
  mocks.seam.mockReset();
  mocks.seam.mockResolvedValue("done");
  mocks.hasGuestData.mockReset();
  mocks.hasGuestData.mockReturnValue(false);
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
  ] as const)("sets the hint and, with no guest data, replaces to the %s return %s", async (locale, search, target) => {
    mocks.getSession.mockResolvedValue(sessionWith(CURRENT_CONSENT_VERSION));
    renderLanding(locale, search);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(target));
    expect(window.localStorage.getItem(AUTH_HINT_KEY)).toBe("true");
    expect(mocks.seam).not.toHaveBeenCalled();
    expect(mocks.getSession).toHaveBeenCalledTimes(1);
  });

  it("never offers the import when the link was not asked for on this browser (ruling Q19)", async () => {
    window.sessionStorage.setItem(SIGN_IN_BROWSER_KEY, "other");
    mocks.getSession.mockResolvedValue(sessionWith(CURRENT_CONSENT_VERSION));
    mocks.hasGuestData.mockReturnValue(true);
    renderLanding("fr", "?return=%2Ffr%2Fcompare");

    expect(
      await screen.findByRole("heading", { name: fr.welcome.otherBrowser.title }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: fr.welcome.confirm.add })).toBeNull();
    expect(mocks.seam).not.toHaveBeenCalled();
    // The flag is not consumed, so a reload (a fresh mount) keeps the warning rather than offering
    // the import again (ruling Q19: never).
    expect(window.sessionStorage.getItem(SIGN_IN_BROWSER_KEY)).toBe("other");

    await userEvent.click(screen.getByRole("button", { name: fr.welcome.otherBrowser.continue }));
    expect(mocks.replace).toHaveBeenCalledWith("/fr/compare");
  });

  it("clears an earlier account's cache before it sets the hint (ruling P24)", async () => {
    const cached = `${ACCOUNT_CACHE_PREFIX}saved`;
    window.localStorage.setItem(AUTH_HINT_KEY, "true");
    window.localStorage.setItem(cached, '{"earlier":"account"}');
    window.localStorage.setItem(`${ACCOUNT_CACHE_PREFIX}profile`, '{"earlier":"account"}');
    window.localStorage.setItem("jisr.saved", '{"guest":"saved"}');
    const cacheWhenHintSet: Array<string | null> = [];
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === AUTH_HINT_KEY) cacheWhenHintSet.push(this.getItem(cached));
      setItem.call(this, key, value);
    });
    mocks.getSession.mockResolvedValue(sessionWith(CURRENT_CONSENT_VERSION));
    renderLanding("fr", "?return=%2Ffr%2Fplan");
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledTimes(1));
    vi.restoreAllMocks();
    expect(cacheWhenHintSet).toEqual([null]);
    expect(window.localStorage.getItem(`${ACCOUNT_CACHE_PREFIX}profile`)).toBeNull();
    expect(window.localStorage.getItem(AUTH_HINT_KEY)).toBe("true");
    expect(window.localStorage.getItem("jisr.saved")).toBe('{"guest":"saved"}');
  });

  it.each([
    ["an absolute URL", "?return=https%3A%2F%2Fevil.example%2Ffr"],
    ["a protocol-relative URL", "?return=%2F%2Fevil.example"],
    ["a path with a query", "?return=%2Ffr%2Fplan%3Fx%3D1"],
    ["a path without a locale", "?return=%2Fplan"],
  ])("falls back to the locale home, never off the site, for %s", async (_label, search) => {
    mocks.getSession.mockResolvedValue(sessionWith(CURRENT_CONSENT_VERSION));
    renderLanding("fr", search);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/fr"));
  });

  it("keeps a same-site path under another known locale as it is", async () => {
    mocks.getSession.mockResolvedValue(sessionWith(CURRENT_CONSENT_VERSION));
    renderLanding("fr", "?return=%2Fen%2Fplan");
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/en/plan"));
  });

  it("moves on only after the post-auth step has finished", async () => {
    mocks.getSession.mockResolvedValue(sessionWith(CURRENT_CONSENT_VERSION));
    mocks.hasGuestData.mockReturnValue(true);
    let finish: () => void = () => {};
    mocks.seam.mockReturnValue(
      new Promise<PostAuthStep>((resolve) => {
        finish = () => resolve("done");
      }),
    );
    renderLanding("fr", "?return=%2Ffr%2Fplan");
    await confirmImport("fr");
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
    expect(mocks.seam).not.toHaveBeenCalled();
    // The kept answer predates the consent: the next lookup (the menu's) asks the server again.
    expect(mocks.getSession).toHaveBeenCalledTimes(1);
    mocks.getSession.mockResolvedValue(sessionWith(CURRENT_CONSENT_VERSION));
    await expect(lookupSession()).resolves.toMatchObject({
      consentVersion: CURRENT_CONSENT_VERSION,
    });
    expect(mocks.getSession).toHaveBeenCalledTimes(2);
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

async function confirmImport(locale: AppLocale) {
  await userEvent
    .setup()
    .click(await screen.findByRole("button", { name: CATALOGS[locale].welcome.confirm.add }));
}

describe.each([
  "fr",
  "ar",
  "en",
] as const)("post-auth landing: the import confirmation (%s)", (locale) => {
  const copy = CATALOGS[locale].welcome.confirm;

  beforeEach(() => {
    mocks.getSession.mockResolvedValue(sessionWith(CURRENT_CONSENT_VERSION));
    mocks.hasGuestData.mockReturnValue(true);
  });

  it("names the signed-in account, masked, and imports nothing before the student confirms", async () => {
    renderLanding(locale, `?return=%2F${locale}%2Fplan`);
    const heading = await screen.findByRole("heading", { level: 2 });
    expect(heading.textContent).toContain(MASKED);
    expect(document.body.textContent).not.toContain(EMAIL);
    expect(document.body.textContent).toContain(copy.body);
    const notNow = screen.getByRole("button", { name: copy.notNow });
    expect(notNow.getAttribute("aria-describedby")).toBe(screen.getByText(copy.notNowHint).id);
    await act(async () => {});
    expect(mocks.seam).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(AUTH_HINT_KEY)).toBe("true");
  });

  it("imports once the student confirms, for the page's locale, then moves on", async () => {
    renderLanding(locale, `?return=%2F${locale}%2Fplan`);
    await confirmImport(locale);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(`/${locale}/plan`));
    expect(mocks.seam).toHaveBeenCalledExactlyOnceWith(locale, "auto");
  });

  it("moves on without any import on Not now", async () => {
    renderLanding(locale, `?return=%2F${locale}%2Fcompare`);
    await userEvent.setup().click(await screen.findByRole("button", { name: copy.notNow }));
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(`/${locale}/compare`);
    expect(mocks.seam).not.toHaveBeenCalled();
  });
});

describe("post-auth landing: the guest import", () => {
  beforeEach(() => mocks.hasGuestData.mockReturnValue(true));

  it.each([
    ["fails", () => mocks.seam.mockResolvedValueOnce("failed")],
    ["throws", () => mocks.seam.mockRejectedValueOnce(new Error("chunk"))],
  ])("shows a retry and a way on, never a dead end, when the step %s", async (_label, arrange) => {
    mocks.getSession.mockResolvedValue(sessionWith(CURRENT_CONSENT_VERSION));
    arrange();
    renderLanding("fr", "?return=%2Ffr%2Fcompare");
    await confirmImport("fr");
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      fr.welcome.import.failed,
    );
    expect(mocks.replace).not.toHaveBeenCalled();

    await userEvent.setup().click(screen.getByRole("button", { name: fr.welcome.import.retry }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/fr/compare"));
    expect(mocks.seam).toHaveBeenNthCalledWith(2, "fr", "auto");
  });

  it("lets the student move on without the import after a failure", async () => {
    mocks.getSession.mockResolvedValue(sessionWith(CURRENT_CONSENT_VERSION));
    mocks.seam.mockResolvedValueOnce("failed");
    renderLanding("en", "?return=%2Fen%2Fmatches");
    await confirmImport("en");
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: en.welcome.import.continue }));
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/en/matches");
    expect(mocks.seam).toHaveBeenCalledTimes(1);
  });

  describe.each(["fr", "ar"] as const)("when the account already holds data (%s)", (locale) => {
    const copy = CATALOGS[locale].welcome.import;

    async function openChoice() {
      mocks.getSession.mockResolvedValue(sessionWith(CURRENT_CONSENT_VERSION));
      mocks.seam.mockResolvedValueOnce("choose");
      renderLanding(locale, `?return=%2F${locale}%2Fplan`);
      await confirmImport(locale);
      return screen.findByRole("alertdialog", { name: copy.title });
    }

    it("asks, and moves on without replacing when the student keeps the account's data", async () => {
      const dialog = await openChoice();
      expect(dialog.textContent).toContain(copy.description);
      expect(dialog.textContent).toContain(MASKED);
      expect(dialog.textContent).not.toContain(EMAIL);
      expect(mocks.replace).not.toHaveBeenCalled();
      const keep = screen.getByRole("button", { name: copy.keep });
      expect(keep.getAttribute("aria-describedby")).toBe("import-keep-hint");

      await userEvent.setup().click(keep);
      await waitFor(() => expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(`/${locale}/plan`));
      expect(mocks.seam).toHaveBeenCalledExactlyOnceWith(locale, "auto");
    });

    it("keeps the account's data when the dialog is dismissed with Escape", async () => {
      await openChoice();
      await userEvent.setup().keyboard("{Escape}");
      await waitFor(() => expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(`/${locale}/plan`));
      expect(mocks.seam).toHaveBeenCalledTimes(1);
    });

    it("replaces only on the explicit choice, then moves on", async () => {
      await openChoice();
      await userEvent.setup().click(screen.getByRole("button", { name: copy.replace }));
      await waitFor(() => expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(`/${locale}/plan`));
      expect(mocks.seam).toHaveBeenNthCalledWith(2, locale, "replace");
    });

    it("offers to retry the replace itself when it fails", async () => {
      await openChoice();
      mocks.seam.mockResolvedValueOnce("failed");
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: copy.replace }));
      await user.click(await screen.findByRole("button", { name: copy.retry }));
      await waitFor(() => expect(mocks.replace).toHaveBeenCalledTimes(1));
      expect(mocks.seam).toHaveBeenNthCalledWith(3, locale, "replace");
    });
  });
});
