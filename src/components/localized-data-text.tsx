// Shared, no "use client": needs the namespace domain.textNote. Use it in body text, not inside a heading: the note is a sibling block, so in a heading it would join the heading's name.
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { DataText } from "@/lib/snapshot/text";

export function LocalizedDataText({
  value,
  fallback = null,
}: {
  value: DataText | null | undefined;
  fallback?: ReactNode;
}) {
  const t = useTranslations("domain.textNote");
  if (value === null || value === undefined) return <>{fallback}</>;
  if (value.note === "none") return <>{value.text}</>;

  return (
    <>
      {value.note === "french_fallback" ? (
        <span lang="fr" dir="ltr">
          {value.text}
        </span>
      ) : (
        <span>{value.text}</span>
      )}
      <small className="mt-1 block text-sm text-muted-foreground">{t(value.note)}</small>
    </>
  );
}
