// Shared, no "use client": needs the namespaces domain.status and matchStatusBadge. The only place a match group becomes an icon, colour and wording.
import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { MatchGroup } from "@/lib/journey/matches-view";
import { cn } from "@/lib/utils";

const GROUP_STYLE: Record<MatchGroup, { icon: ReactNode; tone: string }> = {
  ok: {
    icon: (
      <CircleCheck
        aria-hidden="true"
        data-testid="match-status-icon-ok"
        className="size-4 shrink-0 text-status-ok"
      />
    ),
    tone: "border-status-ok-border bg-status-ok-bg text-status-ok-fg",
  },
  check: {
    icon: (
      <TriangleAlert
        aria-hidden="true"
        data-testid="match-status-icon-check"
        className="size-4 shrink-0 text-status-check"
      />
    ),
    tone: "border-status-check-border bg-status-check-bg text-status-check-fg",
  },
  foundation: {
    icon: (
      <TriangleAlert
        aria-hidden="true"
        data-testid="match-status-icon-foundation"
        className="size-4 shrink-0 text-status-check"
      />
    ),
    tone: "border-status-check-border bg-status-check-bg text-status-check-fg",
  },
  failed: {
    icon: (
      <CircleX
        aria-hidden="true"
        data-testid="match-status-icon-failed"
        className="size-4 shrink-0 text-status-fail"
      />
    ),
    tone: "border-status-fail-border bg-status-fail-bg text-status-fail-fg",
  },
};

export function MatchStatusBadge({
  group,
  size = "md",
}: {
  group: MatchGroup;
  size?: "sm" | "md";
}) {
  const tStatus = useTranslations("domain.status");
  const tBadge = useTranslations("matchStatusBadge");
  const { icon, tone } = GROUP_STYLE[group];
  const text = {
    ok: () => tStatus("satisfied"),
    check: () => tStatus("check"),
    foundation: () => tBadge("foundation"),
    failed: () => tStatus("not_satisfied"),
  }[group]();

  return (
    <span
      data-group={group}
      data-size={size}
      className={cn(
        "inline-flex w-fit items-start gap-2 rounded-md border font-medium shadow-sm",
        size === "sm" ? "px-2 py-0.5 text-sm" : "px-3 py-1.5 text-base",
        tone,
      )}
    >
      <span className={size === "sm" ? "mt-[0.2rem]" : "mt-[0.25rem]"}>{icon}</span>
      <span>{text}</span>
    </span>
  );
}
