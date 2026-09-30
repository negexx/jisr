"use client";

import { useTranslations } from "next-intl";
import { lazy, Suspense, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

// The dialog (Radix AlertDialog) loads on the first click, so no page pays for it up front.
const ClearDataDialog = lazy(() =>
  import("@/components/clear-data-dialog").then((module) => ({ default: module.ClearDataDialog })),
);

export function ClearDataButton() {
  const t = useTranslations("clearData");
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
        {t("trigger")}
      </Button>
      {requested ? (
        <Suspense fallback={null}>
          <ClearDataDialog open={open} onOpenChange={setOpen} returnFocusTo={buttonRef} />
        </Suspense>
      ) : null}
    </>
  );
}
