import type { ReactNode } from "react";

import type { ReportCopy } from "./report-context";

// The one look of the button, whether the signed-out trigger or the full button draws it, so
// nothing moves when the lazy chunk takes over. The accessible name is the visible label, then (for
// screen readers only) the fact it reports and the source's host: "Report outdated info: tuition
// fees example.org". It starts with the visible label, so voice control still finds it.
export function ReportTrigger({
  label,
  context,
  hostname,
  disabled = false,
  onClick,
}: {
  label: string;
  // The separator and the fact, already joined (a no-break space before the colon in French).
  context: string;
  hostname: string | null;
  disabled?: boolean;
  onClick: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="min-h-11 rounded-sm py-1 text-sm text-primary underline underline-offset-4 hover:no-underline disabled:text-muted-foreground disabled:no-underline md:min-h-8"
    >
      {label}
      <span className="sr-only">
        {context} {hostname === null ? null : <bdi dir="ltr">{hostname}</bdi>}
      </span>
    </button>
  );
}

export const REPORT_WRAPPER_CLASS = "inline-flex flex-wrap items-center gap-x-2";

// The fact part of the accessible name, from the lookup the page built (reportCopyFrom): first
// "<kind>:<path head>" (a cost line's category after "lines."), then the kind, then "other".
export function reportContext(
  copy: Pick<ReportCopy, "nameSeparator" | "factLabels">,
  record: string,
  path: string,
): string {
  const kind = record.split("/")[0] ?? "";
  const labels = copy.factLabels;
  const lookup = `${kind}:${path.split(".")[kind === "cost-profiles" ? 1 : 0]}`;
  return copy.nameSeparator + (labels[lookup] ?? labels[kind] ?? labels.other ?? "");
}
