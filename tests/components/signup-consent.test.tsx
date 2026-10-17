// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FinishSignupGate } from "@/components/auth/finish-signup-gate";
import { SIGN_IN_MESSAGE_NAMESPACES } from "@/components/auth/namespaces";
import { SignInForm } from "@/components/auth/sign-in-form";
import { localeDirection } from "@/i18n/direction";
import type { AppLocale } from "@/i18n/routing";
import { CURRENT_CONSENT_VERSION } from "@/lib/auth/consent";
import { type MessageTree, pickMessages } from "@/lib/i18n/client-messages";
import type { SignInLinkRequest, SignInLinkResult } from "@/lib/server/signup";

import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

const server = vi.hoisted(() => ({
  requestSignInLink: vi.fn<(input: unknown) => Promise<unknown>>(),
  acceptCurrentConsent: vi.fn<() => Promise<unknown>>(),
  signInSocial: vi.fn<(input: unknown) => Promise<unknown>>(),
}));

vi.mock("@/lib/server/signup", () => ({ requestSignInLink: server.requestSignInLink }));
vi.mock("@/lib/server/consent", () => ({ acceptCurrentConsent: server.acceptCurrentConsent }));
vi.mock("@/lib/auth/client", () => ({
  authClient: { signIn: { social: server.signInSocial } },
}));

const CATALOGS = { fr, en, ar };
type Copy = (typeof fr)["signup"];

function copy(locale: AppLocale): Copy {
  return CATALOGS[locale].signup;
}

function throwOnIntlError(error: Error): never {
  throw error;
}

// Mirrors the page: a nested provider with exactly the sign-in namespaces.
function renderSignup(ui: ReactElement, locale: AppLocale) {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={pickMessages(CATALOGS[locale] as MessageTree, SIGN_IN_MESSAGE_NAMESPACES)}
      onError={throwOnIntlError}
      timeZone="UTC"
    >
      <div dir={localeDirection(locale)}>{ui}</div>
    </NextIntlClientProvider>,
  );
}

function setUrl(search: string): void {
  window.history.replaceState(null, "", `/fr/sign-in${search}`);
}

function checkbox(name: string): HTMLInputElement {
  const element = screen.getByRole("checkbox", { name: new RegExp(escapeRegExp(name)) });
  if (!(element instanceof HTMLInputElement)) throw new Error("not an input");
  return element;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sentRequest(): SignInLinkRequest {
  const call = server.requestSignInLink.mock.calls.at(-1);
  if (call === undefined) throw new Error("the action was not called");
  return call[0] as SignInLinkRequest;
}

beforeEach(() => {
  setUrl("?return=%2Ffr%2Fplan");
  server.requestSignInLink.mockResolvedValue({ ok: true } satisfies SignInLinkResult);
  server.acceptCurrentConsent.mockResolvedValue({ ok: true });
  server.signInSocial.mockResolvedValue({ data: { url: "https://accounts.google.com" } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe.each(["fr", "ar", "en"] as const)("SignInForm (%s)", (locale) => {
  const t = copy(locale);

  it("renders the consent and age boxes unticked, with the privacy notice link", () => {
    renderSignup(<SignInForm locale={locale} />, locale);
    expect(checkbox(t.consent.label).checked).toBe(false);
    expect(checkbox(t.age.label).checked).toBe(false);
    const link = screen.getByRole("link", {
      name: new RegExp(escapeRegExp(t.consent.privacyLink)),
    });
    expect(link.getAttribute("href")).toBe(`/${locale}/privacy`);
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("blocks a signup without both confirmations and shows each error", async () => {
    const user = userEvent.setup();
    renderSignup(<SignInForm locale={locale} />, locale);
    await user.type(
      screen.getByLabelText(new RegExp(escapeRegExp(t.email.label))),
      "ana@example.com",
    );
    await user.click(screen.getByRole("button", { name: t.submit }));
    expect(screen.getByText(t.errors.consentRequired)).toBeTruthy();
    expect(screen.getByText(t.errors.ageRequired)).toBeTruthy();
    expect(checkbox(t.consent.label).getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(checkbox(t.consent.label));
    expect(server.requestSignInLink).not.toHaveBeenCalled();
  });

  it("blocks a signup with only the consent box unticked", async () => {
    const user = userEvent.setup();
    renderSignup(<SignInForm locale={locale} />, locale);
    await user.type(
      screen.getByLabelText(new RegExp(escapeRegExp(t.email.label))),
      "ana@example.com",
    );
    await user.click(checkbox(t.age.label));
    await user.click(screen.getByRole("button", { name: t.submit }));
    expect(screen.getByText(t.errors.consentRequired)).toBeTruthy();
    expect(screen.queryByText(t.errors.ageRequired)).toBeNull();
    expect(server.requestSignInLink).not.toHaveBeenCalled();
  });

  it("blocks an address that is not one", async () => {
    const user = userEvent.setup();
    renderSignup(<SignInForm locale={locale} />, locale);
    await user.type(screen.getByLabelText(new RegExp(escapeRegExp(t.email.label))), "ana@");
    await user.click(checkbox(t.consent.label));
    await user.click(checkbox(t.age.label));
    await user.click(screen.getByRole("button", { name: t.submit }));
    expect(screen.getByText(t.errors.emailInvalid)).toBeTruthy();
    expect(server.requestSignInLink).not.toHaveBeenCalled();
  });

  it("sends the signup with both confirmations and the return path, then says where to look", async () => {
    const user = userEvent.setup();
    renderSignup(<SignInForm locale={locale} />, locale);
    await user.type(
      screen.getByLabelText(new RegExp(escapeRegExp(t.email.label))),
      "ana@example.com",
    );
    await user.click(checkbox(t.consent.label));
    await user.click(checkbox(t.age.label));
    await user.click(screen.getByRole("button", { name: t.submit }));
    expect(sentRequest()).toEqual({
      email: "ana@example.com",
      consent: true,
      ageConfirmed: true,
      locale,
      returnPath: "/fr/plan",
    });
    expect(await screen.findByRole("heading", { name: t.sent.title })).toBeTruthy();
    expect(screen.getByText(new RegExp(escapeRegExp("ana@example.com")))).toBeTruthy();
  });

  it("maps a cooldown refusal to its message", async () => {
    server.requestSignInLink.mockResolvedValue({ ok: false, error: "cooldown" });
    const user = userEvent.setup();
    renderSignup(<SignInForm locale={locale} />, locale);
    await user.type(
      screen.getByLabelText(new RegExp(escapeRegExp(t.email.label))),
      "ana@example.com",
    );
    await user.click(checkbox(t.consent.label));
    await user.click(checkbox(t.age.label));
    await user.click(screen.getByRole("button", { name: t.submit }));
    expect(await screen.findByText(t.errors.cooldown)).toBeTruthy();
  });

  it("maps an unknown failure to the generic message", async () => {
    server.requestSignInLink.mockResolvedValue({ ok: false, error: "failed" });
    const user = userEvent.setup();
    renderSignup(<SignInForm locale={locale} />, locale);
    await user.type(
      screen.getByLabelText(new RegExp(escapeRegExp(t.email.label))),
      "ana@example.com",
    );
    await user.click(checkbox(t.consent.label));
    await user.click(checkbox(t.age.label));
    await user.click(screen.getByRole("button", { name: t.submit }));
    expect(await screen.findByText(t.errors.failed)).toBeTruthy();
  });

  it("shows the link-failed notice for any landing error", async () => {
    setUrl("?return=%2Ffr&error=AGE_NOT_CONFIRMED");
    renderSignup(<SignInForm locale={locale} />, locale);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(t.errors.linkFailed);
  });

  it("does not start Google sign-up without both confirmations", async () => {
    const user = userEvent.setup();
    renderSignup(<SignInForm locale={locale} />, locale);
    await user.click(screen.getByRole("button", { name: t.google }));
    expect(screen.getByText(t.errors.consentRequired)).toBeTruthy();
    expect(server.signInSocial).not.toHaveBeenCalled();
  });

  it("starts Google sign-up with the confirmations in the OAuth state and the landing URLs", async () => {
    const user = userEvent.setup();
    renderSignup(<SignInForm locale={locale} />, locale);
    await user.click(checkbox(t.consent.label));
    await user.click(checkbox(t.age.label));
    await user.click(screen.getByRole("button", { name: t.google }));
    await waitFor(() => expect(server.signInSocial).toHaveBeenCalledTimes(1));
    const landing = `/${locale}/welcome?return=%2Ffr%2Fplan`;
    expect(server.signInSocial).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: landing,
      newUserCallbackURL: landing,
      errorCallbackURL: landing,
      additionalData: { ageConfirmed: true, consentVersion: CURRENT_CONSENT_VERSION },
    });
  });

  it("draws the decorative Google mark without changing the button name, and labels the email submit with submit", () => {
    renderSignup(<SignInForm locale={locale} />, locale);
    const google = screen.getByRole("button", { name: t.google });
    const mark = google.querySelector('svg[aria-hidden="true"]');
    expect(mark).not.toBeNull();
    expect(mark?.getAttribute("focusable")).toBe("false");
    expect(google.textContent).toBe(t.google);
    const submit = screen.getByRole("button", { name: t.submit });
    expect(submit.textContent).toBe(t.submit);
  });
});

describe.each(["fr", "ar", "en"] as const)("FinishSignupGate (%s)", (locale) => {
  const t = copy(locale);
  const content = <p>account features</p>;

  it("renders the account features for a user who consented to the current notice", () => {
    renderSignup(
      <FinishSignupGate consentVersion={CURRENT_CONSENT_VERSION}>{content}</FinishSignupGate>,
      locale,
    );
    expect(screen.getByText("account features")).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("holds a user created without consent behind an unticked box", () => {
    renderSignup(<FinishSignupGate consentVersion={null}>{content}</FinishSignupGate>, locale);
    expect(screen.getByRole("heading", { name: t.gate.titleNew })).toBeTruthy();
    expect(checkbox(t.consent.label).checked).toBe(false);
    expect(screen.queryByText("account features")).toBeNull();
  });

  it("tells a user who agreed to an older notice that it changed, with a link to it", () => {
    renderSignup(
      <FinishSignupGate consentVersion="2026-01-01">{content}</FinishSignupGate>,
      locale,
    );
    expect(screen.getByRole("heading", { name: t.gate.titleChanged })).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: new RegExp(escapeRegExp(t.consent.privacyLink)) })
        .getAttribute("href"),
    ).toBe(`/${locale}/privacy`);
  });

  it("refuses to continue while the box is unticked", async () => {
    const user = userEvent.setup();
    renderSignup(<FinishSignupGate consentVersion={null}>{content}</FinishSignupGate>, locale);
    await user.click(screen.getByRole("button", { name: t.gate.submit }));
    expect(screen.getByText(t.gate.required)).toBeTruthy();
    expect(server.acceptCurrentConsent).not.toHaveBeenCalled();
  });

  it("unlocks the account features once consent is saved", async () => {
    const onAccepted = vi.fn();
    const user = userEvent.setup();
    renderSignup(
      <FinishSignupGate consentVersion="2026-01-01" onAccepted={onAccepted}>
        {content}
      </FinishSignupGate>,
      locale,
    );
    await user.click(checkbox(t.consent.label));
    await user.click(screen.getByRole("button", { name: t.gate.submit }));
    expect(await screen.findByText("account features")).toBeTruthy();
    expect(server.acceptCurrentConsent).toHaveBeenCalledTimes(1);
    expect(onAccepted).toHaveBeenCalledTimes(1);
  });

  it("stays closed and says so when the session is gone", async () => {
    server.acceptCurrentConsent.mockResolvedValue({ ok: false, error: "unauthenticated" });
    const user = userEvent.setup();
    renderSignup(<FinishSignupGate consentVersion={null}>{content}</FinishSignupGate>, locale);
    await user.click(checkbox(t.consent.label));
    await user.click(screen.getByRole("button", { name: t.gate.submit }));
    expect(await screen.findByText(t.gate.signedOut)).toBeTruthy();
    expect(screen.queryByText("account features")).toBeNull();
  });
});
