import type { ReactNode } from "react";

import { SourceBadge } from "@/components/source-badge";
import type { IsoDate } from "@/data-schema/dates";
import type { InfoKind } from "@/data-schema/primitives";
import type { FactMeta } from "@/data-schema/resolved";
import type { StalenessClass } from "@/data-schema/staleness";

export function Fact({
  kind,
  source,
  verified,
  freshness = "stable",
  basis,
  children,
}: {
  kind: InfoKind;
  source: string;
  verified: IsoDate;
  freshness?: StalenessClass;
  basis?: string;
  children: ReactNode;
}) {
  const meta: FactMeta = {
    source_url: source,
    info_kind: kind,
    last_verified_at: verified,
    class: freshness,
  };

  return (
    <div
      data-slot="mdx-fact"
      data-kind={kind}
      className="mt-4 rounded-xl border border-border bg-secondary px-4 py-3"
    >
      <div className="max-w-prose text-base text-foreground">{children}</div>
      <div className="mt-2">
        <SourceBadge meta={meta} basisText={basis} />
      </div>
    </div>
  );
}
