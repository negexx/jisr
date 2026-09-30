import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// The few glyphs this page needs, drawn once (same 24px stroke set as lucide-react) so the form does
// not carry the icon library's runtime.
type IconProps = { className?: string; "data-icon"?: "inline-start" | "inline-end" };

function Icon({ className, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      data-icon={rest["data-icon"]}
    >
      {children}
    </svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" />
    </Icon>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12h14M12 5v14" />
    </Icon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 11v6M14 11v6M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </Icon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

// Points forward (towards the end of the line) and mirrors by itself in Arabic.
export function ArrowIcon({
  direction,
  className,
  ...rest
}: IconProps & { direction: "back" | "forward" }) {
  return (
    <Icon {...rest} className={cn("rtl:rotate-180", className)}>
      {direction === "forward" ? (
        <path d="M5 12h14m-7-7 7 7-7 7" />
      ) : (
        <path d="M19 12H5m7 7-7-7 7-7" />
      )}
    </Icon>
  );
}
