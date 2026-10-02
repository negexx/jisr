import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

// A saved program the current data no longer lists: nothing can be computed for it, and the only
// useful action is to drop it (which also forgets its ticks).
export function MissingProgram({ slug, onRemove }: { slug: string; onRemove: () => void }) {
  const t = useTranslations("plan");
  return (
    <EmptyState
      focusTarget
      title={t("missing.title")}
      description={
        <>
          <p>{t("missing.description")}</p>
          <p className="mt-2 text-sm">
            <bdi dir="ltr">{slug}</bdi>
          </p>
        </>
      }
      action={
        <Button type="button" variant="outline" onClick={onRemove}>
          {t("program.remove")}
        </Button>
      }
    />
  );
}
