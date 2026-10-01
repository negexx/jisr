"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";

import { Button } from "@/components/ui/button";

import { displayNumber } from "./display-number";

// Hundreds of programmes can match: render a page at a time and let the student ask for more, instead
// of putting every card in the document at once.
export const PAGE_SIZE = 20;

export function PagedList({
  items,
  locale,
}: {
  items: readonly ReactNode[];
  locale: Parameters<typeof displayNumber>[1];
}) {
  const t = useTranslations("matches.groups");
  const [shown, setShown] = useState(PAGE_SIZE);
  const left = items.length - shown;
  return (
    <>
      <ul className="flex flex-col gap-4">{items.slice(0, shown)}</ul>
      {left > 0 ? (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() => setShown((n) => n + PAGE_SIZE)}
        >
          {t("more", { count: displayNumber(left, locale) })}
        </Button>
      ) : null}
    </>
  );
}
