"use client";

import { type RefObject, useState } from "react";

import { FinishSetupButton } from "@/components/auth/finish-setup-button";
import type { ClearDataCopy } from "@/components/clear-data-button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { loadAccountSync } from "@/lib/account-cache";
import { useSessionHint } from "@/lib/auth/session-hint";
import { clearAllLocalData } from "@/lib/local-data";

type Props = {
  copy: ClearDataCopy;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo: RefObject<HTMLElement | null>;
};

type Status = "idle" | "working" | "failed" | "signedOut" | "consentRequired";

export function ClearDataDialog({ copy, open, onOpenChange, returnFocusTo }: Props) {
  const hint = useSessionHint();
  const [status, setStatus] = useState<Status>("idle");
  // Signed in, the account's rows are cleared too (one session-checked action); signed out this is
  // exactly the device-only clear it always was.
  const account = hint ? copy.signedIn : undefined;
  const shown = account ?? copy;

  function changeOpen(next: boolean): void {
    if (!next) setStatus("idle");
    onOpenChange(next);
  }

  function clearAccount(): void {
    setStatus("working");
    loadAccountSync()
      .then(({ clearAccountEverywhere }) => clearAccountEverywhere())
      .then(
        (outcome) => {
          if (outcome === "cleared") changeOpen(false);
          else if (outcome === "signed_out") setStatus("signedOut");
          else if (outcome === "consent_required") setStatus("consentRequired");
          else setStatus("failed");
        },
        () => setStatus("failed"),
      );
  }

  const message =
    status === "failed"
      ? copy.signedIn?.failed
      : status === "signedOut"
        ? copy.signedIn?.signedOut
        : status === "consentRequired"
          ? copy.signedIn?.consentRequired
          : null;

  return (
    <AlertDialog open={open} onOpenChange={changeOpen}>
      {/* There is no Radix trigger to hand focus back to, so return it to the button explicitly. */}
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusTo.current?.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{shown.title}</AlertDialogTitle>
          <AlertDialogDescription>{shown.description}</AlertDialogDescription>
        </AlertDialogHeader>
        {message ? (
          <p role="alert" className="text-base font-medium text-destructive">
            {message}
          </p>
        ) : null}
        {status === "consentRequired" && account !== undefined ? (
          <div>
            <FinishSetupButton label={account.finishSetup} onNavigate={() => changeOpen(false)} />
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>{copy.cancel}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={status === "working"}
            onClick={(event) => {
              // Stay open until the data is gone, then close.
              event.preventDefault();
              if (account !== undefined) {
                clearAccount();
                return;
              }
              clearAllLocalData();
              changeOpen(false);
            }}
          >
            {status === "working" && account !== undefined ? account.working : shown.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
