// Shared, no "use client": the match card (client island) and the program header (server component) both read the same `savedProgram` strings and hand them to the button as props.
import { useLocale, useTranslations } from "next-intl";

import { displayNumber } from "@/components/matches/display-number";
import type { SaveCopy } from "@/components/save-program-button";
import { MAX_SAVED_PROGRAMS } from "@/lib/constants";

export function useSaveCopy(): SaveCopy {
  const t = useTranslations("savedProgram");
  const locale = useLocale();
  return {
    save: t("save"),
    saved: t("saved"),
    announceSaved: t("announceSaved"),
    announceRemoved: t("announceRemoved"),
    failed: t("failed"),
    full: t("full", { max: displayNumber(MAX_SAVED_PROGRAMS, locale) }),
  };
}
