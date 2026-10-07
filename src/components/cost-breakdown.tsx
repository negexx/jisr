// Shared, no "use client": needs the namespaces costBreakdown, domain.cost and domain.budgetFit plus SourceBadge's. The caller passes `monthsLabel` already formatted (Latin digits): numbers are never formatted inside a message.
import { CircleAlert, CircleHelp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { lazy, Suspense, useId } from "react";

import type { CostCategory, CostEstimate, CostLine } from "@/domain/types";
import { formatMoneyRange } from "@/lib/format";
import type { DataText } from "@/lib/snapshot/text";
import { DISCLOSURE_SUMMARY_CLASS, DisclosureChevron } from "./disclosure-chevron";
import type { NumbeoPlace } from "./numbeo-link";
import { SourceBadge } from "./source-badge";

type Variant = "compact" | "full";

const CATEGORIES_WITH_NOTE: readonly CostCategory[] = ["housing", "food"];
const COUNTED_PERS = ["month", "semester", "year"] as const;
// The city list behind the link is a lazy chunk: only a card or page with a missing living line pays for it.
const NumbeoLink = lazy(() =>
  import("./numbeo-link").then((module) => ({ default: module.NumbeoLink })),
);
const LIVING_CATEGORIES: readonly CostCategory[] = ["housing", "food", "transport"];

function isCountedPer(per: CostLine["per"]): per is (typeof COUNTED_PERS)[number] {
  return per !== null && (COUNTED_PERS as readonly string[]).includes(per);
}

function LineRow({
  line,
  noteId,
  textOf,
  variant,
}: {
  line: CostLine;
  noteId: string;
  textOf: ((key: string) => DataText | undefined) | undefined;
  variant: Variant;
}) {
  const locale = useLocale();
  const t = useTranslations("costBreakdown");
  const tCost = useTranslations("domain.cost");
  const amount = line.status === "ok" ? line.firstYear : null;
  const fact = line.status === "ok" ? line.fact : null;
  const basisKey = fact?.info_kind === "estimate" ? fact.basis : undefined;
  const basisText = basisKey === undefined ? undefined : textOf?.(basisKey)?.text;

  return (
    <li
      data-testid="cost-row"
      data-category={line.category}
      data-status={amount === null ? "missing" : "ok"}
      className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 py-3 @md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1.7fr)]"
    >
      <p className="text-base font-medium">
        {tCost(`category.${line.category}`)}
        {CATEGORIES_WITH_NOTE.includes(line.category) ? (
          <a
            href={`#${noteId}`}
            className="flex min-h-11 w-fit items-center text-sm font-normal text-primary underline underline-offset-4 md:min-h-8"
          >
            {t("seeNote")}
          </a>
        ) : null}
      </p>
      {amount === null ? (
        <p
          data-testid="cost-missing"
          className="col-span-2 flex items-start gap-2 text-base text-muted-foreground @md:col-span-2"
        >
          <CircleHelp aria-hidden="true" className="mt-[0.2rem] size-4 shrink-0" />
          <span>{tCost("missingLine")}</span>
        </p>
      ) : (
        <>
          <div className="flex flex-col text-end @md:text-start">
            <p data-testid="cost-amount" className="text-base font-medium tabular-nums">
              <bdi dir="ltr">
                {formatMoneyRange(amount.min, amount.max, amount.currency, locale)}
              </bdi>
            </p>
            {isCountedPer(line.per) ? (
              <small className="text-sm text-muted-foreground">
                {t("counted", { per: tCost(`per.${line.per}`) })}
              </small>
            ) : null}
            {line.scope === null ? null : (
              <small className="text-sm text-muted-foreground">
                {tCost(`scope.${line.scope}`)}
              </small>
            )}
          </div>
          {fact === null ? null : (
            <div className="col-span-2 @md:col-span-1">
              <SourceBadge
                meta={fact}
                variant={variant === "full" && basisText !== undefined ? "full" : "compact"}
                {...(basisText === undefined ? {} : { basisText })}
              />
            </div>
          )}
        </>
      )}
    </li>
  );
}

function TotalRows({ cost }: { cost: CostEstimate }) {
  const locale = useLocale();
  const t = useTranslations("costBreakdown");
  const tCost = useTranslations("domain.cost");
  const several = cost.totals.length > 1;

  return (
    <div className="flex flex-col gap-2">
      {cost.totals.map((total) => (
        <p
          key={total.currency}
          data-testid="cost-total"
          data-currency={total.currency}
          className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
        >
          <span className="text-base font-medium">{t("total")}</span>
          {several ? (
            <bdi className="text-base font-medium text-muted-foreground">{total.currency}</bdi>
          ) : null}
          <span className="rounded-full border border-dashed border-kind-estimate bg-kind-estimate-bg px-2.5 py-0.5 text-sm font-medium text-kind-estimate">
            {tCost("estimateTag")}
          </span>
          <span className="text-lg font-semibold tabular-nums">
            <bdi dir="ltr">{formatMoneyRange(total.min, total.max, total.currency, locale)}</bdi>
          </span>
        </p>
      ))}
      {cost.complete ? null : (
        <p data-testid="cost-partial" className="flex items-start gap-2 text-base">
          <CircleAlert aria-hidden="true" className="mt-[0.2rem] size-4 shrink-0" />
          <span>{tCost("partialTotal")}</span>
        </p>
      )}
    </div>
  );
}

export function CostBreakdown({
  cost,
  budgetProvided,
  monthsLabel,
  textOf,
  variant = "full",
  caption,
  numbeoPlace,
}: {
  cost: CostEstimate;
  budgetProvided: boolean;
  monthsLabel: string;
  textOf?: (key: string) => DataText | undefined;
  variant?: Variant;
  caption?: string;
  // Offered only when a living-cost line (housing, food, transport) has no figure.
  numbeoPlace?: NumbeoPlace | null;
}) {
  const tCost = useTranslations("domain.cost");
  const tFit = useTranslations("domain.budgetFit");
  const t = useTranslations("costBreakdown");
  const noteId = `${useId()}-months-note`;
  const compact = variant === "compact";
  const hasTotal = cost.totals.length > 0;
  const livingLineMissing = cost.lines.some(
    (line) => line.status === "missing" && LIVING_CATEGORIES.includes(line.category),
  );
  const numbeo =
    numbeoPlace !== null && numbeoPlace !== undefined && livingLineMissing ? (
      <Suspense fallback={null}>
        <NumbeoLink place={numbeoPlace} />
      </Suspense>
    ) : null;

  const lines = (
    <ul className="divide-y divide-border">
      {cost.lines.map((line) => (
        <LineRow
          key={line.category}
          line={line}
          noteId={noteId}
          textOf={textOf}
          variant={variant}
        />
      ))}
    </ul>
  );

  return (
    <section
      data-slot="cost-breakdown"
      data-variant={variant}
      aria-label={caption}
      className="@container flex flex-col gap-2"
    >
      {compact ? (
        <>
          {hasTotal ? (
            <TotalRows cost={cost} />
          ) : (
            <p data-testid="cost-none" className="flex items-start gap-2 text-base">
              <CircleHelp aria-hidden="true" className="mt-[0.2rem] size-4 shrink-0" />
              <span>{tCost("missingLine")}</span>
            </p>
          )}
          {budgetProvided ? <p className="text-base leading-snug">{tFit(cost.budgetFit)}</p> : null}
          <p id={noteId} className="text-sm leading-snug text-muted-foreground">
            {tCost("tenMonthNote", { months: monthsLabel })}
          </p>
          <details>
            <summary className={DISCLOSURE_SUMMARY_CLASS}>
              <DisclosureChevron />
              <span className="text-base underline underline-offset-4">{t("seeLines")}</span>
            </summary>
            {lines}
            {numbeo}
          </details>
        </>
      ) : (
        <>
          {lines}
          {hasTotal ? <TotalRows cost={cost} /> : null}
          {numbeo}
          <p id={noteId} className="text-sm text-muted-foreground">
            {tCost("tenMonthNote", { months: monthsLabel })}
          </p>
          {budgetProvided ? <p className="text-base">{tFit(cost.budgetFit)}</p> : null}
        </>
      )}
    </section>
  );
}
