"use client";

import { Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { DISCLOSURE_SUMMARY_CLASS, DisclosureChevron } from "@/components/disclosure-chevron";
import { displayNumber } from "@/components/matches/display-number";
import { cn } from "@/lib/utils";

export type SwitcherItem =
  | {
      kind: "program";
      slug: string;
      name: string;
      institutionName: string;
      cityName: string;
      done: number;
      total: number;
    }
  | { kind: "missing"; slug: string };

// Tailwind's `lg`: from here the list is an always-open rail and the summary is hidden.
const RAIL_QUERY = "(min-width: 64rem)";

// The same list serves both layouts: below `lg` it sits in a native disclosure, from `lg` the
// disclosure is held open and its summary hidden. The open state is set from the media query rather
// than CSS alone, because styling a closed <details> open is not supported everywhere.
export function ProgramSwitcher({
  items,
  activeSlug,
  onSelect,
}: {
  items: readonly SwitcherItem[];
  activeSlug: string;
  onSelect: (slug: string) => void;
}) {
  const t = useTranslations("plan.switcher");
  const locale = useLocale();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const railRef = useRef(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(RAIL_QUERY);
    const sync = () => {
      railRef.current = query.matches;
      if (detailsRef.current !== null) detailsRef.current.open = query.matches;
    };
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const active = items.find((item) => item.slug === activeSlug) ?? items[0];

  function select(slug: string) {
    onSelect(slug);
    if (railRef.current) return;
    // The button that had focus is about to be hidden: keep focus on the control that stays.
    if (detailsRef.current !== null) detailsRef.current.open = false;
    summaryRef.current?.focus();
  }

  function progress(item: Extract<SwitcherItem, { kind: "program" }>): string {
    return t("progress", {
      done: displayNumber(item.done, locale),
      total: displayNumber(item.total, locale),
    });
  }

  return (
    <nav aria-label={t("label")}>
      <details ref={detailsRef} className="group">
        <summary
          ref={summaryRef}
          className={cn(
            DISCLOSURE_SUMMARY_CLASS,
            "w-full gap-1.5 rounded-xl border border-border bg-card px-4 py-2 lg:hidden",
          )}
        >
          <span className="me-1.5 flex min-w-0 flex-1 flex-col text-foreground">
            <span className="text-sm text-muted-foreground">{t("showing")}</span>
            <span className="text-base font-semibold">
              <bdi>{active?.kind === "program" ? active.name : (active?.slug ?? "")}</bdi>
            </span>
            {active?.kind === "program" ? (
              <span className="text-sm text-muted-foreground">{progress(active)}</span>
            ) : null}
          </span>
          <span className="shrink-0 text-sm font-medium underline underline-offset-4">
            {t("change")}
          </span>
          <DisclosureChevron />
        </summary>
        <ul className="mt-2 flex flex-col gap-2 lg:mt-0">
          {items.map((item) => {
            const isActive = item.slug === active?.slug;
            return (
              <li key={item.slug}>
                <button
                  type="button"
                  aria-current={isActive ? "true" : undefined}
                  onClick={() => select(item.slug)}
                  className={cn(
                    "flex min-h-12 w-full items-start gap-3 rounded-xl border px-4 py-3 text-start transition-colors hover:bg-muted",
                    isActive ? "border-primary bg-accent" : "border-border bg-card",
                  )}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-base font-medium">
                      <bdi dir={item.kind === "missing" ? "ltr" : undefined}>
                        {item.kind === "program" ? item.name : item.slug}
                      </bdi>
                    </span>
                    {item.kind === "program" ? (
                      <>
                        <span className="text-sm text-muted-foreground">
                          <bdi>{item.institutionName}</bdi>
                          <span aria-hidden="true"> · </span>
                          <bdi>{item.cityName}</bdi>
                        </span>
                        <span className="text-sm text-muted-foreground">{progress(item)}</span>
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">{t("missing")}</span>
                    )}
                  </span>
                  {isActive ? (
                    <Check aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </details>
    </nav>
  );
}
