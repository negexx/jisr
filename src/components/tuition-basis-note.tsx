// Shared, no "use client": needs the namespace domain.cost (a client tree passes it through pickMessages).
import { useTranslations } from "next-intl";

import type { Tuition } from "@/data-schema/records/program";

export function TuitionBasisNote({ tuition }: { tuition: Tuition }) {
  const t = useTranslations("domain.cost");
  if (tuition.basis !== "income_based") return null;
  return (
    <small data-testid="tuition-basis" className="block text-sm text-muted-foreground">
      {t("incomeBased")}
    </small>
  );
}
