import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

// Rendered inside the [locale] layout only when a page under a valid locale calls notFound() while
// rendering a request. No current route does: every page is generated at build time, and unknown
// paths (/fr/no-such-page), unknown program slugs and unknown first segments are unmatched, so Next
// answers them with src/app/global-not-found.tsx. Next 16.3 does not server-render this boundary
// (it sends a blank error shell and the browser renders it once the JavaScript has loaded), which is
// why unknown paths are left unmatched rather than sent here through a [...rest] catch-all.
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
