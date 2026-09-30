"use client";

import type { RefObject } from "react";
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
import { profileStore } from "@/lib/profile/store";

type Props = {
  copy: ClearDataCopy;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo: RefObject<HTMLElement | null>;
};

export function ClearDataDialog({ copy, open, onOpenChange, returnFocusTo }: Props) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {/* There is no Radix trigger to hand focus back to, so return it to the button explicitly. */}
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusTo.current?.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{copy.cancel}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={(event) => {
              // Stay open until the data is gone, then close.
              event.preventDefault();
              profileStore.clear();
              onOpenChange(false);
            }}
          >
            {copy.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
