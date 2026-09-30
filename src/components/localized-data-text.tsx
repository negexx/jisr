// Shared, no "use client": needs the namespace domain.textNote.

import { useTranslations } from "next-intl";
import { type ReactNode, useId } from "react";

import type { DataText } from "@/lib/snapshot/text";

export function LocalizedDataText({
  value,
  fallback = null,
}: {
  value: DataText | null | undefined;
  fallback?: ReactNode;
}) {
  const t = useTranslations("domain.textNote");
  const noteId = useId();
  if (value === null || value === undefined) return <>{fallback}</>;
  if (value.note === "none") return <>{value.text}</>;

  const note = t(value.note);
  return (
    <>
      {value.note === "french_fallback" ? (
        <span lang="fr" dir="ltr" aria-describedby={noteId}>
          {value.text}
        </span>
      ) : (
        <span aria-describedby={noteId}>{value.text}</span>
      )}
      <small id={noteId} className="mt-1 block text-sm text-muted-foreground">
        {note}
      </small>
    </>
  );
}
