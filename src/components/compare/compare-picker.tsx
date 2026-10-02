"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useLayoutEffect, useRef } from "react";

import { DISCLOSURE_SUMMARY_CLASS, DisclosureChevron } from "@/components/disclosure-chevron";
import { displayNumber } from "@/components/matches/display-number";
import { MAX_COMPARE, MIN_COMPARE } from "@/lib/constants";
import { selectionBlock } from "@/lib/journey/compare-selection";
import { cn } from "@/lib/utils";

export type PickerItem =
  | { kind: "program"; slug: string; name: string; institutionName: string; cityName: string }
  | { kind: "missing"; slug: string };

// Tailwind's `md` breakpoint: from here the list starts open, below it starts closed.
const OPEN_QUERY = "(min-width: 48rem)";

// The saved programs as native checkboxes inside a native disclosure. The open state is set from the
// media query rather than CSS alone, in a layout effect, so a desktop never paints it closed for a
// frame (the component renders on the client only, after the snapshot has loaded).
export function ComparePicker({
  items,
  selected,
  onToggle,
  idle = false,
}: {
  items: readonly PickerItem[];
  // Slugs being compared, in saved order.
  selected: readonly string[];
  onToggle: (slug: string) => void;
  // Nothing can be compared yet (fewer than two saved programs are in the data): the list is the
  // only thing worth showing, so it opens on a phone too, claims no selection and offers no choice.
  idle?: boolean;
}) {
  const t = useTranslations("compare.picker");
  const locale = useLocale();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const statusId = useId();

  useLayoutEffect(() => {
    if (typeof window.matchMedia !== "function") {
      if (idle && detailsRef.current !== null) detailsRef.current.open = true;
      return;
    }
    const query = window.matchMedia(OPEN_QUERY);
    const sync = () => {
      if (detailsRef.current !== null) detailsRef.current.open = idle || query.matches;
    };
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [idle]);

  const total = displayNumber(items.length, locale);
  const chosen = displayNumber(selected.length, locale);
  // Why a box is disabled: at the maximum the unticked ones wait for a free place, at the minimum the
  // ticked ones stay.
  const blockText = idle
    ? null
    : selected.length >= MAX_COMPARE
      ? t("limit", { max: displayNumber(MAX_COMPARE, locale) })
      : selected.length <= MIN_COMPARE
        ? t("minimum", { min: displayNumber(MIN_COMPARE, locale) })
        : null;

  return (
    <details ref={detailsRef} data-slot="compare-picker" className="group">
      <summary
        className={cn(
          DISCLOSURE_SUMMARY_CLASS,
          "min-h-12 w-full gap-1.5 rounded-xl border border-border bg-card px-4 py-2",
        )}
      >
        {idle ? (
          <span className="me-1.5 min-w-0 flex-1 text-base font-semibold text-foreground">
            {t("change")}
          </span>
        ) : (
          <>
            <span className="me-1.5 min-w-0 flex-1 text-base font-semibold text-foreground">
              {t("summary", { selected: chosen, total })}
            </span>
            <span className="shrink-0 text-sm font-medium underline underline-offset-4">
              {t("change")}
            </span>
          </>
        )}
        <DisclosureChevron />
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          {t("hint", {
            min: displayNumber(MIN_COMPARE, locale),
            max: displayNumber(MAX_COMPARE, locale),
          })}
        </p>
        {blockText === null ? null : (
          <p id={statusId} className="text-base">
            {blockText}
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {items.map((item) => {
            const missing = item.kind === "missing";
            const blocked = !missing && !idle && selectionBlock(selected, item.slug) !== null;
            const checked = !idle && selected.includes(item.slug);
            return (
              <li key={item.slug} data-slug={item.slug}>
                <label
                  className={cn(
                    "flex min-h-12 items-start gap-3 rounded-xl border px-4 py-3 transition-colors",
                    missing
                      ? "cursor-not-allowed border-border bg-muted text-muted-foreground"
                      : blocked
                        ? "cursor-not-allowed border-border bg-card"
                        : "cursor-pointer border-border bg-card hover:bg-muted",
                    checked && "border-primary bg-accent",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={missing || blocked || idle}
                    aria-describedby={blocked && blockText !== null ? statusId : undefined}
                    onChange={() => onToggle(item.slug)}
                    className="mt-0.5 size-6 shrink-0 accent-primary disabled:cursor-not-allowed"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    {item.kind === "program" ? (
                      <>
                        <span className="text-base font-medium text-foreground">
                          <bdi>{item.name}</bdi>
                        </span>
                        <span className="text-sm text-muted-foreground">
                          <bdi>{item.institutionName}</bdi>
                          <span aria-hidden="true"> · </span>
                          <bdi>{item.cityName}</bdi>
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-base font-medium">
                          <bdi dir="ltr">{item.slug}</bdi>
                        </span>
                        <span className="text-sm">{t("missing")}</span>
                      </>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}
