// Shared, no "use client": needs the namespaces deadline and domain.intake plus SourceBadge's. Presentational only: upcoming, recurring, closed and unknown are decided by the domain, never here.
import { CalendarClock, CalendarDays, CalendarX2, CircleHelp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import type { IntakeStatus } from "@/domain/types";
import { formatDate, formatMonthDay } from "@/lib/format";
import { SourceBadge } from "./source-badge";

const ICON_CLASS = "size-5 shrink-0 text-muted-foreground";

export function DeadlineStatus({ intake }: { intake: IntakeStatus }) {
  const locale = useLocale();
  const t = useTranslations("domain.intake");
  const tDeadline = useTranslations("deadline");

  const deadline = intake.kind === "upcoming" ? intake.intake.applicationDeadline : null;
  const recurring = intake.kind === "recurring" ? intake.deadline : null;
  const opens = intake.kind === "upcoming" ? intake.intake.applicationOpens : null;
  // An upcoming status always has a deadline; if the data ever disagrees, saying it is unknown is the honest fallback.
  const shown = intake.kind === "upcoming" && deadline === null ? "unknown" : intake.kind;

  return (
    <div data-intake={shown} className="flex flex-col gap-1.5">
      <p className="flex items-start gap-2 text-base font-medium">
        {shown === "upcoming" ? (
          <CalendarDays
            aria-hidden="true"
            data-testid="deadline-icon-upcoming"
            className={ICON_CLASS}
          />
        ) : shown === "recurring" ? (
          <CalendarClock
            aria-hidden="true"
            data-testid="deadline-icon-recurring"
            className={ICON_CLASS}
          />
        ) : shown === "closed" ? (
          <CalendarX2
            aria-hidden="true"
            data-testid="deadline-icon-closed"
            className={ICON_CLASS}
          />
        ) : (
          <CircleHelp
            aria-hidden="true"
            data-testid="deadline-icon-unknown"
            className={ICON_CLASS}
          />
        )}
        {shown === "upcoming" && deadline !== null ? (
          <bdi>
            <time dateTime={deadline}>{t("upcoming", { date: formatDate(deadline, locale) })}</time>
          </bdi>
        ) : recurring !== null ? (
          // a bdi keeps DD/MM in reading order inside right-to-left text; no <time>: the year is not published
          <bdi>{t("recurring", { date: formatMonthDay(recurring) })}</bdi>
        ) : (
          <span>{shown === "closed" ? t("closed") : t("unknown")}</span>
        )}
      </p>
      {shown === "upcoming" && opens !== null ? (
        <p className="ps-7 text-sm text-muted-foreground">
          <bdi>
            <time dateTime={opens}>
              {tDeadline("opensFrom", { date: formatDate(opens, locale) })}
            </time>
          </bdi>
        </p>
      ) : null}
      {/* nothing is published when the deadline is unknown: no badge claiming it was verified (ADR 0005 item 9) */}
      {intake.fact === null || intake.kind === "unknown" ? null : (
        <SourceBadge meta={intake.fact} variant="compact" />
      )}
    </div>
  );
}
