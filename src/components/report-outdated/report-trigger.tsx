import type { ReactNode } from "react";

// The one look of the button, whether the signed-out trigger or the full button draws it, so
// nothing moves when the lazy chunk takes over. `hostname` names the source in the accessible name.
export function ReportTrigger({
  label,
  hostname,
  disabled = false,
  onClick,
}: {
  label: string;
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
      {hostname === null ? null : (
        <span className="sr-only">
          {" "}
          <bdi dir="ltr">{hostname}</bdi>
        </span>
      )}
    </button>
  );
}

export const REPORT_WRAPPER_CLASS = "inline-flex flex-wrap items-center gap-x-2";
