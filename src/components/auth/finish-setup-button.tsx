"use client";

import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { usePathname } from "@/i18n/navigation";
import { type AppLocale, routing } from "@/i18n/routing";
import { finishSetupPath, isAuthPage } from "@/lib/auth/callback-urls";

// Not next-intl's hasLocale: importing it here grows a chunk every guest page loads.
function appLocale(value: string): AppLocale {
  return routing.locales.find((locale) => locale === value) ?? routing.defaultLocale;
}

type Props = Pick<ComponentProps<typeof Button>, "className" | "size" | "variant"> & {
  label: string;
  onNavigate?: () => void;
};

// A signed-in student whose consent is not the current privacy-notice version goes back through
// the post-auth landing, which holds the finish-signup gate and then returns here. A button, not a
// link, so nothing is prefetched. Absent on the sign-in and landing pages: the landing is the gate.
export function FinishSetupButton({ label, onNavigate, ...button }: Props) {
  // The landing URL already carries the locale, so this is Next's router, not the locale-aware one.
  const router = useRouter();
  const pathname = usePathname();
  const locale = appLocale(useLocale());
  if (isAuthPage(pathname)) return null;
  return (
    <Button
      type="button"
      {...button}
      onClick={() => {
        onNavigate?.();
        router.push(finishSetupPath(locale, pathname));
      }}
    >
      {label}
    </Button>
  );
}
