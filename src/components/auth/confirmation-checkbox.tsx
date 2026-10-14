"use client";

import { useTranslations } from "next-intl";
import type { ReactNode, Ref } from "react";

import { AlertIcon } from "@/components/profile/icons";
import { Link } from "@/i18n/navigation";

// The consent and age confirmations. Always rendered unticked by their parent's state, never
// pre-ticked: the student ticks each box themselves (.claude/rules/auth.md). The whole row is the tap
// target, as in the profile form's choice rows.
export function ConfirmationCheckbox({
  id,
  label,
  hint,
  error,
  checked,
  onChange,
  inputRef,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error: string | undefined;
  checked: boolean;
  onChange: (checked: boolean) => void;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const t = useTranslations("signup");
  const hintId = hint === undefined ? undefined : `${id}-hint`;
  const errorId = error === undefined ? undefined : `${id}-error`;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-input bg-background px-3 py-3 text-base has-checked:border-primary has-checked:bg-accent"
      >
        <input
          ref={inputRef}
          id={id}
          type="checkbox"
          checked={checked}
          required
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-primary"
        />
        <span>
          {label}
          <span className="font-normal text-muted-foreground"> ({t("required")})</span>
        </span>
      </label>
      {hint === undefined ? null : (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error === undefined ? null : (
        <p id={errorId} className="flex items-start gap-2 text-base font-medium text-destructive">
          <AlertIcon className="mt-1 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

// Opens in a new tab so the half-filled form survives reading the notice; never prefetched, so the
// sign-in page fetches nothing until the student asks.
export function PrivacyNoticeLink() {
  const t = useTranslations("signup.consent");
  const tLink = useTranslations("externalLink");
  return (
    <Link
      href="/privacy"
      prefetch={false}
      target="_blank"
      rel="noopener"
      className="font-medium text-primary underline underline-offset-4 hover:no-underline"
    >
      {t("privacyLink")}
      <span className="sr-only"> {tLink("opensInNewTab")}</span>
    </Link>
  );
}
