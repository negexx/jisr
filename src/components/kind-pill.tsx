import { Calculator, Info, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import type { InfoKind } from "@/data-schema/primitives";

// The single kind -> icon + pill-treatment mapping. SourceBadge's fact pills and the home
// trust-band legend both render through KindPill, so the two can never drift apart.
export type FactKind = InfoKind;

const KIND_PILL: Record<FactKind, { icon: ReactNode; pill: string }> = {
  official: {
    icon: (
      <ShieldCheck
        aria-hidden="true"
        data-testid="source-kind-icon-official"
        className="size-4 shrink-0"
      />
    ),
    pill: "bg-kind-official text-kind-official-bg",
  },
  estimate: {
    icon: (
      <Calculator
        aria-hidden="true"
        data-testid="source-kind-icon-estimate"
        className="size-4 shrink-0"
      />
    ),
    pill: "border border-dashed border-kind-estimate bg-kind-estimate-bg text-kind-estimate",
  },
  guidance: {
    icon: (
      <Info
        aria-hidden="true"
        data-testid="source-kind-icon-guidance"
        className="size-4 shrink-0"
      />
    ),
    pill: "border border-kind-guidance/40 bg-kind-guidance-bg text-kind-guidance",
  },
};

export function KindPill({ kind, children }: { kind: FactKind; children: ReactNode }) {
  const { icon, pill } = KIND_PILL[kind];
  return (
    <span
      data-kind={kind}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-medium shadow-sm ${pill}`}
    >
      {icon}
      {children}
    </span>
  );
}
