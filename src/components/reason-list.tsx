// Shared, no "use client": needs the namespaces reasonList, domain.reason and domain.textNote plus SourceBadge's. Reason texts arrive as message keys with plain string arguments (see ReasonView); the only numbers shown are the counts of the collapsed summary, formatted here as strings.
import { Check, CircleHelp, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { FactRef, ReasonCode, RuleOutcome } from "@/domain/types";
import { intlLocale } from "@/lib/format";
import { formatNumber, type ReasonView } from "@/lib/journey/reasons";
import { DISCLOSURE_SUMMARY_CLASS, DisclosureChevron } from "./disclosure-chevron";
import { LocalizedDataText } from "./localized-data-text";
import { SourceBadge } from "./source-badge";

// The outcome of one requirement. This is not the match status: the group-level status keeps its own mapping in MatchStatusBadge.
const OUTCOME_ICON: Record<RuleOutcome, ReactNode> = {
  pass: (
    <Check
      aria-hidden="true"
      data-testid="reason-icon-pass"
      className="size-4 shrink-0 text-status-ok"
    />
  ),
  fail: (
    <X
      aria-hidden="true"
      data-testid="reason-icon-fail"
      className="size-4 shrink-0 text-status-fail"
    />
  ),
  unknown: (
    <CircleHelp
      aria-hidden="true"
      data-testid="reason-icon-unknown"
      className="size-4 shrink-0 text-status-check"
    />
  ),
};

// Most severe first: the summary of a collapsed list leads with what needs attention.
const OUTCOME_ORDER: readonly RuleOutcome[] = ["fail", "unknown", "pass"];

function distinctFacts(facts: readonly FactRef[]): FactRef[] {
  const seen = new Set<string>();
  const distinct: FactRef[] = [];
  for (const fact of facts) {
    const id = `${fact.source_url}|${fact.last_verified_at}|${fact.info_kind}`;
    if (seen.has(id)) continue;
    seen.add(id);
    distinct.push(fact);
  }
  return distinct;
}

function useReasonText() {
  // The key comes from the domain (ReasonView), not from a literal, so the typed catalogue cannot check it; the reason tests render every code in every locale.
  return useTranslations() as unknown as (key: string, params?: ReasonView["params"]) => string;
}

function SourcesDetails({ facts }: { facts: readonly FactRef[] }) {
  const t = useTranslations("reasonList");
  return (
    <details className="text-sm">
      <summary className={DISCLOSURE_SUMMARY_CLASS}>
        <DisclosureChevron />
        <span className="underline underline-offset-4">{t("sources")}</span>
      </summary>
      <ul className="flex flex-col gap-2 pb-1">
        {facts.map((fact) => (
          <li key={`${fact.source_url}|${fact.last_verified_at}|${fact.info_kind}`}>
            <SourceBadge meta={fact} variant="compact" />
          </li>
        ))}
      </ul>
    </details>
  );
}

function ReasonItem({
  reason,
  perItemSources,
  bodyHidden,
}: {
  reason: ReasonView;
  perItemSources: boolean;
  bodyHidden: boolean;
}) {
  const tReason = useReasonText();
  const facts = perItemSources ? distinctFacts(reason.facts) : [];

  return (
    <li data-outcome={reason.outcome} data-code={reason.code} className="flex flex-col gap-2 py-3">
      <div className="flex flex-col gap-1">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-sm font-medium text-muted-foreground">
            {OUTCOME_ICON[reason.outcome]}
            {tReason(`domain.reason.outcome.${reason.outcome}`)}
          </span>
          <span className="text-base font-medium">{tReason(reason.kindKey, reason.params)}</span>
        </p>
        {bodyHidden ? null : (
          <p className="max-w-prose text-base">{tReason(reason.key, reason.params)}</p>
        )}
        {reason.note === null ? null : (
          <p data-testid="reason-note" className="max-w-prose text-base text-muted-foreground">
            <LocalizedDataText value={{ text: reason.note.text, note: reason.note.textNote }} />
          </p>
        )}
      </div>
      {facts.length === 0 ? null : <SourcesDetails facts={facts} />}
    </li>
  );
}

function WhySummary({ hidden }: { hidden: readonly ReasonView[] }) {
  const locale = useLocale();
  const t = useTranslations("reasonList");
  const tReason = useReasonText();
  const parts = OUTCOME_ORDER.flatMap((outcome) => {
    const count = hidden.filter((reason) => reason.outcome === outcome).length;
    if (count === 0) return [];
    return t("count", {
      outcome: tReason(`domain.reason.outcome.${outcome}`),
      count: formatNumber(count, locale) ?? String(count),
    });
  });
  const counts = new Intl.ListFormat(intlLocale(locale), { type: "unit", style: "short" }).format(
    parts,
  );
  return <span>{t("whySummary", { counts })}</span>;
}

export function ReasonList({
  reasons,
  heading,
  headingLevel = 3,
  showSources = true,
  sources = "per-item",
  collapseFrom,
  compact = false,
  bodyHiddenFor = [],
}: {
  reasons: ReasonView[];
  heading?: string;
  headingLevel?: 3 | 4;
  showSources?: boolean;
  // "grouped": one deduped Sources disclosure after the list instead of one per reason.
  sources?: "per-item" | "grouped";
  // From this many reasons up, only the first stays open and the rest folds into a "Why?" disclosure.
  collapseFrom?: number;
  // Reasons that appear met show only their outcome and label, not the repeated sentence.
  compact?: boolean;
  // Reasons of these codes show their outcome and label but not their sentence (the caller already says it).
  bodyHiddenFor?: readonly ReasonCode[];
}) {
  const Heading = headingLevel === 3 ? "h3" : "h4";
  const collapsed = collapseFrom !== undefined && reasons.length >= collapseFrom;
  const open = collapsed ? reasons.slice(0, 1) : reasons;
  const folded = collapsed ? reasons.slice(1) : [];
  const perItemSources = showSources && sources === "per-item";
  const groupedFacts =
    showSources && sources === "grouped" ? distinctFacts(reasons.flatMap((r) => r.facts)) : [];

  const items = (list: readonly ReasonView[], offset: number) =>
    list.map((reason, index) => (
      <ReasonItem
        // A reason has no id: the code and the position are stable for one rendered list.
        key={`${reason.code}-${reason.kind}-${offset + index}`}
        reason={reason}
        perItemSources={perItemSources}
        bodyHidden={(compact && reason.outcome === "pass") || bodyHiddenFor.includes(reason.code)}
      />
    ));

  return (
    <div data-slot="reason-list" className="flex flex-col">
      {heading === undefined ? null : (
        <Heading className="text-base font-semibold">{heading}</Heading>
      )}
      <ul className="divide-y divide-border">{items(open, 0)}</ul>
      {folded.length === 0 ? null : (
        <details data-slot="why" className="border-t border-border">
          <summary className={DISCLOSURE_SUMMARY_CLASS}>
            <DisclosureChevron />
            <span className="underline underline-offset-4">
              <WhySummary hidden={folded} />
            </span>
          </summary>
          <ul className="divide-y divide-border">{items(folded, open.length)}</ul>
        </details>
      )}
      {groupedFacts.length === 0 ? null : <SourcesDetails facts={groupedFacts} />}
    </div>
  );
}
