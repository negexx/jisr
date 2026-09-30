// Shared, no "use client": needs the namespaces reasonList, domain.reason and domain.textNote plus SourceBadge's. Reason texts arrive as message keys with plain string arguments (see ReasonView), so nothing here formats a number.
import { Check, CircleHelp, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { FactRef, RuleOutcome } from "@/domain/types";
import type { ReasonView } from "@/lib/journey/reasons";
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

function ReasonItem({ reason, showSources }: { reason: ReasonView; showSources: boolean }) {
  // The key comes from the domain (ReasonView), not from a literal, so the typed catalogue cannot check it; the reason tests render every code in every locale.
  const tReason = useTranslations() as unknown as (
    key: string,
    params?: ReasonView["params"],
  ) => string;
  const tList = useTranslations("reasonList");
  const facts = showSources ? distinctFacts(reason.facts) : [];

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
        <p className="max-w-prose text-base">{tReason(reason.key, reason.params)}</p>
        {reason.note === null ? null : (
          <p data-testid="reason-note" className="max-w-prose text-base text-muted-foreground">
            <LocalizedDataText value={{ text: reason.note.text, note: reason.note.textNote }} />
          </p>
        )}
      </div>
      {facts.length === 0 ? null : (
        <details className="group text-sm">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-primary underline underline-offset-4 md:min-h-8">
            {tList("sources")}
          </summary>
          <ul className="flex flex-col gap-2 pb-1">
            {facts.map((fact) => (
              <li key={`${fact.source_url}|${fact.last_verified_at}|${fact.info_kind}`}>
                <SourceBadge meta={fact} variant="compact" />
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

export function ReasonList({
  reasons,
  heading,
  headingLevel = 3,
  showSources = true,
}: {
  reasons: ReasonView[];
  heading?: string;
  headingLevel?: 3 | 4;
  showSources?: boolean;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h4";

  return (
    <div data-slot="reason-list" className="flex flex-col">
      {heading === undefined ? null : (
        <Heading className="text-base font-semibold">{heading}</Heading>
      )}
      <ul className="divide-y divide-border">
        {reasons.map((reason, index) => (
          <ReasonItem
            // A reason has no id: the code and the position are stable for one rendered list.
            key={`${reason.code}-${reason.kind}-${index}`}
            reason={reason}
            showSources={showSources}
          />
        ))}
      </ul>
    </div>
  );
}
