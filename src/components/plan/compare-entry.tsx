import { useTranslations } from "next-intl";

import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// One saved program has nothing to compare yet: say what unlocks it. With two or more, the way in.
// Nothing at all when the list is empty (the plan page then shows its own empty state).
export function CompareEntry({ count }: { count: number }) {
  const t = useTranslations("plan.compare");
  if (count < 1) return null;
  if (count === 1) {
    return <p className="max-w-prose text-sm text-muted-foreground">{t("hint")}</p>;
  }
  return (
    <Link
      href="/compare"
      prefetch={false}
      className={cn(
        buttonVariants({ variant: "outline" }),
        "h-auto min-h-12 whitespace-normal py-2 text-center sm:w-auto sm:self-start",
      )}
    >
      {t("action")}
    </Link>
  );
}
