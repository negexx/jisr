// Shared, no "use client": needs the namespaces sourceBadge, externalLink, domain.infoKind and domain.freshness (a client tree passes them through pickMessages); the only client part is FreshnessMark, which gets its strings as props.
import { Calculator, ChevronDown, Info, ShieldCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { FactMeta } from "@/data-schema/resolved";
import type { FactRef } from "@/domain/types";
import { formatDate } from "@/lib/format";
import { ExternalLink, sourceHostname } from "./external-link";
import { FreshnessMark } from "./freshness-mark";

type Kind = FactMeta["info_kind"];

// Three treatments that differ in icon, label and shape (filled, dashed, plain), so colour never carries the difference.
const KIND_STYLE: Record<Kind, { icon: ReactNode; pill: string }> = {
  official: {
    icon: (
      <ShieldCheck
        aria-hidden="true"
        data-testid="source-kind-icon-official"
        className="size-4 shrink-0"
      />
    ),
    pill: "bg-kind-official text-primary-foreground",
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

export function SourceBadge({
  meta,
  variant = "compact",
  label,
  basisText,
}: {
  meta: FactMeta | FactRef;
  variant?: "compact" | "full";
  label?: string;
  basisText?: string;
}) {
  const locale = useLocale();
  const t = useTranslations("sourceBadge");
  const tKind = useTranslations("domain.infoKind");
  const tFreshness = useTranslations("domain.freshness");
  const kind = meta.info_kind;
  const style = KIND_STYLE[kind];
  const hostname = sourceHostname(meta.source_url);
  const full = variant === "full";
  const groupProps = label === undefined ? {} : { role: "group", "aria-label": label };

  return (
    <div
      {...groupProps}
      data-slot="source-badge"
      data-variant={variant}
      className="flex flex-col gap-1.5"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span
          data-kind={kind}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-medium ${style.pill}`}
        >
          {style.icon}
          {tKind(`${kind}.label`)}
        </span>
        <bdi className="text-muted-foreground">
          <time dateTime={meta.last_verified_at}>
            {tFreshness("verifiedOn", { date: formatDate(meta.last_verified_at, locale) })}
          </time>
        </bdi>
        <ExternalLink href={meta.source_url} className="min-h-11 py-1 text-sm md:min-h-8">
          {full ? undefined : (
            <>
              {t("source")}
              {hostname === null ? null : (
                <span className="sr-only">
                  <bdi dir="ltr">{hostname}</bdi>
                </span>
              )}
            </>
          )}
        </ExternalLink>
        <FreshnessMark
          meta={meta}
          labels={{ aging: tFreshness("aging"), stale: tFreshness("stale") }}
        />
      </div>
      {full ? (
        <p className="max-w-prose text-sm text-muted-foreground">{tKind(`${kind}.meaning`)}</p>
      ) : null}
      {full && kind === "estimate" && basisText !== undefined ? (
        <details className="group max-w-prose text-sm">
          <summary className="inline-flex min-h-11 cursor-pointer items-center gap-1 text-primary md:min-h-8">
            <span className="underline underline-offset-4">{t("howWeEstimated")}</span>
            <ChevronDown
              aria-hidden="true"
              className="size-4 shrink-0 transition-transform group-open:rotate-180"
            />
          </summary>
          <p className="pb-1 text-muted-foreground">{basisText}</p>
        </details>
      ) : null}
    </div>
  );
}
