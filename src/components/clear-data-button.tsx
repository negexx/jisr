"use client";

import { lazy, Suspense, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

// Shown instead while this browser is signed in; absent while accounts are off.
export type SignedInClearCopy = {
  title: string;
  description: string;
  confirm: string;
  working: string;
  failed: string;
  signedOut: string;
  consentRequired: string;
  finishSetup: string;
};

export type ClearDataCopy = {
  trigger: string;
  title: string;
  description: string;
  cancel: string;
  confirm: string;
  signedIn?: SignedInClearCopy | undefined;
};

// The dialog (Radix AlertDialog, about 13 KB gzipped) loads on the first click, so no page pays for
// it up front.
const ClearDataDialog = lazy(() =>
  import("@/components/clear-data-dialog").then((module) => ({ default: module.ClearDataDialog })),
);

export function ClearDataButton({ copy }: { copy: ClearDataCopy }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [requested, setRequested] = useState(false);
  return (
    <>
      <Button
        ref={buttonRef}
        variant="outline"
        aria-haspopup="dialog"
        onClick={() => {
          setRequested(true);
          setOpen(true);
        }}
      >
        {copy.trigger}
      </Button>
      {requested ? (
        <Suspense fallback={null}>
          <ClearDataDialog
            copy={copy}
            open={open}
            onOpenChange={setOpen}
            returnFocusTo={buttonRef}
          />
        </Suspense>
      ) : null}
    </>
  );
}
