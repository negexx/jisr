// Shared, no "use client": needs the namespaces sourceBadge, externalLink, domain.infoKind and domain.freshness (a client tree passes them through pickMessages); the only client part is FreshnessMark, which gets its strings as props.
import { ChevronDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import type { FactMeta } from "@/data-schema/resolved";
import type { FactRef } from "@/domain/types";
import { formatDate } from "@/lib/format";
import { ExternalLink, sourceHostname } from "./external-link";
import { FreshnessMark } from "./freshness-mark";
import { KindPill } from "./kind-pill";
import type { ReportTarget } from "./report-outdated/report-context";
import { ReportOutdatedSlot } from "./report-outdated/report-outdated-slot";

// Only what freshness is computed from crosses into the client leaf: a FactRef's stored `freshness` was stamped at some other `now` (for a static page, a build-time value) and must never ship.
function factMetaOf(meta: FactMeta | FactRef): FactMeta {
  const fact: FactMeta = {
    source_url: meta.source_url,
    info_kind: meta.info_kind,
    last_verified_at: meta.last_verified_at,
    class: meta.class,
  };
  if (meta.basis !== undefined) fact.basis = meta.basis;
  return fact;
}

export function SourceBadge({
  meta,
  variant = "compact",
  label,
  basisText,
  report,
}: {
  meta: FactMeta | FactRef;
  variant?: "compact" | "full";
  label?: string;
  basisText?: string;
  // Opt-in, journey surfaces only: the fact a signed-in student may report as outdated. `true` takes
  // the record and path from a FactRef; a FactMeta has neither, so its caller names them.
  report?: ReportTarget | true;
}) {
  const locale = useLocale();
  const t = useTranslations("sourceBadge");
  const tKind = useTranslations("domain.infoKind");
  const tFreshness = useTranslations("domain.freshness");
  const kind = meta.info_kind;
  const hostname = sourceHostname(meta.source_url);
  const full = variant === "full";
  const reportTarget = report === true ? ("record" in meta ? meta : undefined) : report;
  const groupProps = label === undefined ? {} : { role: "group", "aria-label": label };

  return (
    <div
      {...groupProps}
      data-slot="source-badge"
      data-variant={variant}
      className="flex flex-col gap-1.5"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <KindPill kind={kind}>{tKind(`${kind}.label`)}</KindPill>
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
          meta={factMetaOf(meta)}
          labels={{
            aging: tFreshness("aging"),
            // The T4 stale text sends people to "the official page": only an official fact may say that.
            stale: kind === "official" ? tFreshness("stale") : t("staleCheckSource"),
          }}
        />
        {reportTarget === undefined ? null : (
          <ReportOutdatedSlot
            record={reportTarget.record}
            path={reportTarget.path}
            sourceUrl={meta.source_url}
            hostname={hostname}
          />
        )}
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
