"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";

import { CONTROL_CLASS } from "@/components/profile/field";
import { AlertIcon } from "@/components/profile/icons";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/i18n/routing";
import { authCallbackUrls, RETURN_PARAM } from "@/lib/auth/callback-urls";
import { CURRENT_CONSENT_VERSION } from "@/lib/auth/consent";
import { looksLikeEmail } from "@/lib/auth/email-shape";
import { useSessionHint } from "@/lib/auth/session-hint";
import { requestSignInLink } from "@/lib/server/signup";
import { cn } from "@/lib/utils";

import { ConfirmationCheckbox, PrivacyNoticeLink } from "./confirmation-checkbox";

type FieldErrors = { email?: string; consent?: string; age?: string };

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "failed"; message: string };

function readLocation(): { returnPath: string | null; error: string | null } {
  const params = new URLSearchParams(window.location.search);
  return { returnPath: params.get(RETURN_PARAM), error: params.get("error") };
}

export function SignInForm({ locale }: { locale: AppLocale }) {
  const t = useTranslations("signup");
  const signedIn = useSessionHint();
  const ids = useId();
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [linkError, setLinkError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const consentRef = useRef<HTMLInputElement>(null);
  const ageRef = useRef<HTMLInputElement>(null);

  // The static page cannot read the query string on the server, so a landing error is shown after
  // mount.
  useEffect(() => {
    const { error } = readLocation();
    if (error !== null && error !== "") setLinkError(error);
  }, []);

  const emailId = `${ids}-email`;
  const busy = status.kind === "sending";

  function confirmationErrors(): FieldErrors {
    return {
      ...(consent ? {} : { consent: t("errors.consentRequired") }),
      ...(ageConfirmed ? {} : { age: t("errors.ageRequired") }),
    };
  }

  function focusFirst(found: FieldErrors): void {
    if (found.email !== undefined) emailRef.current?.focus();
    else if (found.consent !== undefined) consentRef.current?.focus();
    else if (found.age !== undefined) ageRef.current?.focus();
  }

  function block(found: FieldErrors): boolean {
    setErrors(found);
    if (Object.keys(found).length === 0) return false;
    focusFirst(found);
    return true;
  }

  async function sendLink(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const found: FieldErrors = {
      ...(looksLikeEmail(email) ? {} : { email: t("errors.emailInvalid") }),
      ...confirmationErrors(),
    };
    if (block(found)) return;
    setStatus({ kind: "sending" });
    try {
      const result = await requestSignInLink({
        email,
        consent,
        ageConfirmed,
        locale,
        returnPath: readLocation().returnPath,
      });
      if (result.ok) {
        setStatus({ kind: "sent", email: email.trim() });
        return;
      }
      if (result.error === "invalid_email") {
        setStatus({ kind: "idle" });
        block({ email: t("errors.emailInvalid") });
        return;
      }
      if (result.error === "confirmation_required") {
        setStatus({ kind: "idle" });
        block(confirmationErrors());
        return;
      }
      setStatus({ kind: "failed", message: failureMessage(result.error) });
    } catch {
      setStatus({ kind: "failed", message: t("errors.failed") });
    }
  }

  function failureMessage(code: string): string {
    if (code === "cooldown") return t("errors.cooldown");
    if (code === "accounts_disabled" || code === "ACCOUNTS_DISABLED") return t("errors.disabled");
    return t("errors.failed");
  }

  // Google returns to the same landing. The confirmations ride the OAuth state (additionalData),
  // which the server reads back on the callback; without them a new Google account is refused.
  // The auth client is loaded on this click only, so the page itself fetches nothing.
  async function continueWithGoogle(): Promise<void> {
    if (block(confirmationErrors())) return;
    setStatus({ kind: "sending" });
    try {
      const { authClient } = await import("@/lib/auth/client");
      const { error } = await authClient.signIn.social({
        provider: "google",
        ...authCallbackUrls(locale, readLocation().returnPath),
        additionalData: { ageConfirmed: true, consentVersion: CURRENT_CONSENT_VERSION },
      });
      if (error) setStatus({ kind: "failed", message: failureMessage(error.code ?? "") });
    } catch {
      setStatus({ kind: "failed", message: t("errors.failed") });
    }
  }

  if (status.kind === "sent") {
    return (
      <section aria-live="polite" className="flex max-w-prose flex-col gap-4 text-start">
        <h2 className="text-xl font-semibold">{t("sent.title")}</h2>
        <p className="text-base">{t("sent.body", { email: status.email })}</p>
        <div>
          <Button type="button" variant="outline" onClick={() => setStatus({ kind: "idle" })}>
            {t("sent.again")}
          </Button>
        </div>
      </section>
    );
  }

  const notice =
    status.kind === "failed" ? status.message : linkError === null ? null : t("errors.linkFailed");

  return (
    <div className="flex max-w-xl flex-col gap-6 text-start">
      <div role="alert" className="empty:hidden">
        {notice === null ? null : (
          <p className="flex items-start gap-2 rounded-lg border-2 border-destructive bg-destructive-bg p-4 text-base font-medium text-destructive">
            <AlertIcon className="mt-1 size-4 shrink-0" />
            <span>{notice}</span>
          </p>
        )}
      </div>

      <Button
        type="button"
        className="w-full"
        disabled={busy}
        aria-disabled={busy}
        onClick={continueWithGoogle}
      >
        {t("google")}
      </Button>

      <div className="flex items-center gap-3 text-sm text-muted-foreground" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span>{t("orEmail")}</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form noValidate onSubmit={sendLink} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={emailId} className="text-base font-medium">
            {t("email.label")}
            <span className="font-normal text-muted-foreground"> ({t("required")})</span>
          </label>
          <p id={`${emailId}-hint`} className="text-sm text-muted-foreground">
            {t("email.hint")}
          </p>
          <input
            ref={emailRef}
            id={emailId}
            type="email"
            inputMode="email"
            autoComplete="email"
            dir="ltr"
            value={email}
            required
            aria-invalid={errors.email === undefined ? undefined : true}
            aria-describedby={cn(
              `${emailId}-hint`,
              errors.email === undefined ? "" : `${emailId}-error`,
            )}
            onChange={(event) => setEmail(event.target.value)}
            className={cn(CONTROL_CLASS, "text-start")}
          />
          {errors.email === undefined ? null : (
            <p
              id={`${emailId}-error`}
              className="flex items-start gap-2 text-base font-medium text-destructive"
            >
              <AlertIcon className="mt-1 size-4 shrink-0" />
              <span>{errors.email}</span>
            </p>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <ConfirmationCheckbox
            id={`${ids}-consent`}
            inputRef={consentRef}
            label={t("consent.label")}
            hint={<PrivacyNoticeLink />}
            error={errors.consent}
            checked={consent}
            onChange={setConsent}
          />
          <ConfirmationCheckbox
            id={`${ids}-age`}
            inputRef={ageRef}
            label={t("age.label")}
            hint={t(signedIn ? "age.hintSignedIn" : "age.hint")}
            error={errors.age}
            checked={ageConfirmed}
            onChange={setAgeConfirmed}
          />
        </div>

        <div>
          <Button type="submit" disabled={busy} aria-disabled={busy}>
            {busy ? t("sending") : t("submit")}
          </Button>
        </div>
      </form>
    </div>
  );
}
