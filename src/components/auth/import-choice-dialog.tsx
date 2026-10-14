"use client";

import { useTranslations } from "next-intl";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Long labels (French, Arabic) wrap on a phone instead of overflowing the button.
const WRAPPING = "h-auto min-h-11 w-full whitespace-normal py-2 text-center";

type Props = { onKeep: () => void; onReplace: () => void };

// The account already holds data and this device has its own: never a silent overwrite, so the
// student chooses. Closing the dialog any other way (Escape) keeps the account's data, which is
// the choice that deletes nothing; this device's data is then offered again at the next sign-in.
export function ImportChoiceDialog({ onKeep, onReplace }: Props) {
  const t = useTranslations("welcome.import");
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) onKeep();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("description")}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <AlertDialogCancel className={WRAPPING} aria-describedby="import-keep-hint">
              {t("keep")}
            </AlertDialogCancel>
            <p id="import-keep-hint" className="text-sm text-muted-foreground">
              {t("keepHint")}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <AlertDialogAction
              variant="destructive"
              className={WRAPPING}
              aria-describedby="import-replace-hint"
              onClick={(event) => {
                // Radix would close the dialog, which reads as "keep": the landing moves on instead.
                event.preventDefault();
                onReplace();
              }}
            >
              {t("replace")}
            </AlertDialogAction>
            <p id="import-replace-hint" className="text-sm text-muted-foreground">
              {t("replaceHint")}
            </p>
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
