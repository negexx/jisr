// Shared, no "use client": needs the namespaces of compare-cells plus compare.rows, compare.differences and compare.cells. The same DOM in every direction and at every width: stacked by topic on a phone (each cell wears its program's name), one column per program from `md`.
import { Diff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";

import { Link } from "@/i18n/navigation";
import { COMPARE_ROWS, type CompareRowId } from "@/lib/journey/compare-rows";
import type { CompareProgram, CompareView } from "@/lib/journey/compare-view";
import { cn } from "@/lib/utils";

import { CELLS } from "./compare-cells";

// Literal class names so Tailwind can see them; two to four programs are ever compared.
function columnsFrom(count: number): string {
  if (count >= 4) return "md:grid-cols-4";
  if (count === 3) return "md:grid-cols-3";
  return "md:grid-cols-2";
}

export function DifferencesSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const t = useTranslations("compare.differences");
  return (
    <label className="flex min-h-12 w-fit cursor-pointer items-center gap-3 text-base">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="size-6 shrink-0 cursor-pointer accent-primary"
      />
      <span>{t("label")}</span>
    </label>
  );
}

function DiffersMarker() {
  const t = useTranslations("compare.differences");
  // Icon and word, in neutral tones: a difference is not good or bad, and never relies on colour.
  return (
    <span
      data-slot="differs-marker"
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-0.5 text-sm font-medium"
    >
      <Diff aria-hidden="true" className="size-4 shrink-0" />
      {t("marker")}
    </span>
  );
}

function ProgramHeads({
  programs,
  columns,
}: {
  programs: readonly CompareProgram[];
  columns: string;
}) {
  const t = useTranslations("compare.cells");
  return (
    <div className="bg-background md:sticky md:top-0 md:z-10 md:border-b md:border-border md:py-3">
      <ul
        data-slot="compare-heads"
        aria-label={t("programLabel")}
        className={cn("grid gap-2 md:gap-6", columns)}
      >
        {programs.map((program) => (
          <li key={program.slug} className="flex min-w-0 flex-col">
            <Link
              href={`/programs/${program.slug}`}
              prefetch={false}
              className="inline-flex min-h-11 w-fit items-center text-lg font-semibold text-primary underline-offset-4 hover:underline md:min-h-8"
            >
              <bdi>{program.name}</bdi>
            </Link>
            <p className="text-sm text-muted-foreground">
              <bdi>{program.institutionName}</bdi>
              <span aria-hidden="true"> · </span>
              <bdi>{program.cityName}</bdi>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CompareRow({
  id,
  differs,
  programs,
  columns,
  budgetProvided,
}: {
  id: CompareRowId;
  differs: boolean;
  programs: readonly CompareProgram[];
  columns: string;
  budgetProvided: boolean;
}) {
  const t = useTranslations("compare");
  const headingId = useId();
  const Cell = CELLS[id];
  return (
    <section
      data-row={id}
      aria-labelledby={headingId}
      className="flex flex-col gap-3 border-t border-border pt-5"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id={headingId} className="text-lg font-semibold">
          {t(`rows.${id}`)}
        </h2>
        {differs ? <DiffersMarker /> : null}
      </div>
      <ul className={cn("grid gap-4 md:gap-6", columns)}>
        {programs.map((program) => (
          <li
            key={program.slug}
            data-slug={program.slug}
            className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card p-4"
          >
            <p
              data-slot="cell-label"
              className="text-sm font-medium text-muted-foreground md:sr-only"
            >
              <bdi>{program.name}</bdi>
            </p>
            <Cell program={program} budgetProvided={budgetProvided} />
          </li>
        ))}
      </ul>
      {id === "scholarships" ? (
        <p className="max-w-prose text-sm text-muted-foreground">{t("scholarships.caveat")}</p>
      ) : null}
    </section>
  );
}

export function CompareGrid({
  view,
  onlyDifferences,
  budgetProvided,
}: {
  view: CompareView;
  onlyDifferences: boolean;
  budgetProvided: boolean;
}) {
  const t = useTranslations("compare.differences");
  const columns = columnsFrom(view.programs.length);
  const rows = COMPARE_ROWS.filter((id) => !onlyDifferences || view.differs[id]);
  return (
    <div data-slot="compare-grid" className="flex flex-col gap-6">
      <ProgramHeads programs={view.programs} columns={columns} />
      {rows.length === 0 ? (
        <p className="max-w-prose text-base">{t("allSame")}</p>
      ) : (
        rows.map((id) => (
          <CompareRow
            key={id}
            id={id}
            differs={view.differs[id]}
            programs={view.programs}
            columns={columns}
            budgetProvided={budgetProvided}
          />
        ))
      )}
    </div>
  );
}
