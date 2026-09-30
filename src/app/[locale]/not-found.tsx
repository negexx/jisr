import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

// Rendered inside the [locale] layout (header, footer, locale set by the layout) for notFound() and for
// program slugs that were not generated at build time.
export default function NotFound() {
  const t = useTranslations("notFound");
  return (
    <section className="flex max-w-prose flex-col gap-4 text-start">
      <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
      <p className="text-lg text-muted-foreground">{t("description")}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
        <Button asChild variant="outline" className="w-full sm:w-auto">
          <Link href="/">{t("home")}</Link>
        </Button>
        <Button asChild className="w-full sm:w-auto">
          <Link href="/profile">
            {t("profile")}
            <ArrowRight data-icon="inline-end" aria-hidden="true" className="rtl:rotate-180" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
