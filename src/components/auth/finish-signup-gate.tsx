"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, type ReactNode, useId, useRef, useState } from "react";

import { AlertIcon } from "@/components/profile/icons";
import { Button } from "@/components/ui/button";
import { hasCurrentConsent } from "@/lib/auth/consent";
import { acceptCurrentConsent } from "@/lib/server/consent";

import { ConfirmationCheckbox, PrivacyNoticeLink } from "./confirmation-checkbox";

type Status = { kind: "idle" } | { kind: "saving" } | { kind: "failed"; message: string };

// Holds every account feature (import, sync, feedback) behind consent to the current privacy
// notice. It wraps account UI only; the guest journey never renders inside it. Age is not asked
// here: no account exists without the age confirmation (the create hook rejects it). A student
// who agreed to an older notice sees "our privacy notice changed" instead of "finish signing up".
// The server re-checks with requireAccountReady() in every account action, so this is the UX
// half of the gate, not the enforcement.
export function FinishSignupGate({
  consentVersion,
  onAccepted,
  children,
}: {
  consentVersion: string | null | undefined;
  onAccepted?: () => void;
  children: ReactNode;
}) {
  const t = useTranslations("signup");
  const id = useId();
  const [accepted, setAccepted] = useState(false);
  const [ticked, setTicked] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const checkboxRef = useRef<HTMLInputElement>(null);

  if (accepted || hasCurrentConsent({ consentVersion })) return children;

  const changed = consentVersion !== null && consentVersion !== undefined;
  const checkboxId = `${id}-consent`;
  const titleId = `${id}-title`;

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!ticked) {
      setError(t("gate.required"));
      checkboxRef.current?.focus();
      return;
    }
    setError(undefined);
    setStatus({ kind: "saving" });
    try {
      const result = await acceptCurrentConsent();
      if (result.ok) {
        setAccepted(true);
        onAccepted?.();
        return;
      }
      setStatus({
        kind: "failed",
        message: result.error === "unauthenticated" ? t("gate.signedOut") : t("errors.disabled"),
      });
    } catch {
      setStatus({ kind: "failed", message: t("gate.failed") });
    }
  }

  return (
    <section aria-labelledby={titleId} className="flex max-w-xl flex-col gap-4 text-start">
      <h2 id={titleId} className="text-xl font-semibold">
        {changed ? t("gate.titleChanged") : t("gate.titleNew")}
      </h2>
      <p className="text-base">{changed ? t("gate.bodyChanged") : t("gate.bodyNew")}</p>
      <div role="alert" className="empty:hidden">
        {status.kind === "failed" ? (
          <p className="flex items-start gap-2 rounded-lg border-2 border-destructive bg-destructive-bg p-4 text-base font-medium text-destructive">
            <AlertIcon className="mt-1 size-4 shrink-0" />
            <span>{status.message}</span>
          </p>
        ) : null}
      </div>
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <ConfirmationCheckbox
          id={checkboxId}
          inputRef={checkboxRef}
          label={t("consent.label")}
          hint={<PrivacyNoticeLink />}
          error={error}
          checked={ticked}
          onChange={setTicked}
        />
        <div>
          <Button type="submit" disabled={status.kind === "saving"}>
            {status.kind === "saving" ? t("gate.sending") : t("gate.submit")}
          </Button>
        </div>
      </form>
    </section>
  );
}
