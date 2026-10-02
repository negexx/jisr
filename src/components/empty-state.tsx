// Shared, no "use client": every string arrives as a prop, so it needs no message namespace.
import { Inbox, Loader, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

const DEFAULT_ICON: Record<"neutral" | "error" | "loading", ReactNode> = {
  neutral: <Inbox aria-hidden="true" className="size-10 text-muted-foreground" />,
  error: <TriangleAlert aria-hidden="true" className="size-10 text-destructive" />,
  loading: <Loader aria-hidden="true" className="size-10 text-muted-foreground" />,
};

export function EmptyState({
  title,
  description,
  action,
  icon,
  tone = "neutral",
  headingLevel = 2,
  focusTarget = false,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  tone?: "neutral" | "error" | "loading";
  headingLevel?: 2 | 3;
  // Makes the heading a programmatic focus target (not a tab stop), for a view that replaces the
  // control that had focus, such as the last item of a list being removed.
  focusTarget?: boolean;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      data-tone={tone}
      className="flex flex-col items-center gap-4 py-10 text-center md:items-start md:text-start"
    >
      {icon ?? DEFAULT_ICON[tone]}
      <div className="flex max-w-prose flex-col gap-2">
        <Heading
          className={focusTarget ? "text-xl font-semibold outline-none" : "text-xl font-semibold"}
          {...(focusTarget ? { tabIndex: -1, "data-slot": "focus-target" } : {})}
        >
          {title}
        </Heading>
        {description === undefined ? null : (
          <div className="text-base text-muted-foreground">{description}</div>
        )}
      </div>
      {action === undefined ? null : <div className="pt-2">{action}</div>}
    </div>
  );
}
