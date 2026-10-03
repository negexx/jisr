"use client";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { MIN_COMPARE } from "@/lib/constants";
import { useSaved } from "@/lib/saved/use-saved";

import { displayNumber } from "./display-number";

// Shown only once the saved list is read (nothing on the server) and only with two or more saved
// programs: the same list the nav and the Save buttons already read, so no new storage or code.
export function CompareLink({ locale }: { locale: AppLocale }) {
  const t = useTranslations("matches.compare");
  const { hydrated, items } = useSaved();
  if (!hydrated || items.length < MIN_COMPARE) return null;
  return (
    <Link
      href="/compare"
      prefetch={false}
      className="inline-flex min-h-11 items-center gap-2 self-start text-base font-medium text-primary hover:text-primary/80"
    >
      <span className="underline underline-offset-4">
        {t("link", { count: displayNumber(items.length, locale) })}
      </span>
      <ArrowRight aria-hidden="true" className="size-4 shrink-0 rtl:rotate-180" />
    </Link>
  );
}
