import type { IsoDate } from "@/data-schema/dates";
import type { Budget } from "@/data-schema/profile";
import type { CostAmount, LivingCostCategory } from "@/data-schema/records/cost-profile";
import type { CostProfile, Program, ResolvedFact } from "@/data-schema/resolved";
import { toFactRef } from "./facts";
import { tuitionBounds } from "./tuition";
import type { BudgetFit, CostEstimate, CostLine } from "./types";

export const ACADEMIC_YEAR_MONTHS = 10;

export type CostInput = {
  program: Program;
  costProfiles: readonly CostProfile[];
  budget: Budget | null;
  now: IsoDate;
};

const LIVING_CATEGORIES: readonly LivingCostCategory[] = [
  "housing",
  "food",
  "transport",
  "insurance",
  "application_visa",
  "setup",
];

type Total = { min: number; max: number; currency: string };

function tuitionLine(program: Program, now: IsoDate): CostLine {
  const fact = toFactRef(`programs/${program.slug}`, "tuition", program.tuition, now);
  const tuition = program.tuition.value;
  if (tuition === null) {
    return {
      category: "tuition",
      status: "missing",
      firstYear: null,
      per: null,
      scope: "program",
      fact,
    };
  }
  const k = tuition.period === "semester" ? 2 : 1;
  const bounds = tuitionBounds(tuition);
  return {
    category: "tuition",
    status: "ok",
    firstYear: { min: bounds.min * k, max: bounds.max * k, currency: tuition.currency },
    per: tuition.period,
    scope: "program",
    fact,
    ...(tuition.basis === "income_based" ? { incomeBased: true as const } : {}),
  };
}

function livingLine(
  category: LivingCostCategory,
  cityProfile: CostProfile | undefined,
  countryProfile: CostProfile | undefined,
  now: IsoDate,
): CostLine {
  const candidates = [
    { scope: "city" as const, profile: cityProfile },
    { scope: "country" as const, profile: countryProfile },
  ];

  for (const { scope, profile } of candidates) {
    const line: ResolvedFact<CostAmount> | undefined = profile?.lines[category];
    const amount = line?.value;
    if (profile === undefined || line === undefined || amount === null || amount === undefined) {
      continue;
    }
    const k = amount.per === "month" ? ACADEMIC_YEAR_MONTHS : 1;
    return {
      category,
      status: "ok",
      firstYear: { min: amount.min * k, max: amount.max * k, currency: amount.currency },
      per: amount.per,
      scope,
      fact: toFactRef(`cost-profiles/${profile.slug}`, `lines.${category}`, line, now),
    };
  }

  for (const { scope, profile } of candidates) {
    const line = profile?.lines[category];
    if (profile !== undefined && line !== undefined) {
      return {
        category,
        status: "missing",
        firstYear: null,
        per: null,
        scope,
        fact: toFactRef(`cost-profiles/${profile.slug}`, `lines.${category}`, line, now),
      };
    }
  }
  return { category, status: "missing", firstYear: null, per: null, scope: null, fact: null };
}

function sumPerCurrency(lines: readonly CostLine[]): Total[] {
  const totals: Total[] = [];
  for (const line of lines) {
    if (line.firstYear === null) continue;
    const { min, max, currency } = line.firstYear;
    const index = totals.findIndex((t) => t.currency === currency);
    const existing = totals[index];
    if (existing === undefined) {
      totals.push({ min, max, currency });
    } else {
      totals[index] = { min: existing.min + min, max: existing.max + max, currency };
    }
  }
  return totals;
}

function budgetFitOf(
  budget: Budget | null,
  complete: boolean,
  totals: readonly Total[],
): BudgetFit {
  const [total] = totals;
  if (budget === null || !complete || totals.length !== 1 || total === undefined) return "unknown";
  if (total.currency !== budget.currency) return "unknown";
  const annualBudget = budget.amountMinor * (budget.period === "month" ? ACADEMIC_YEAR_MONTHS : 1);
  if (total.max <= annualBudget) return "within";
  if (total.min > annualBudget) return "above";
  return "straddles";
}

export function estimateCost(input: CostInput): CostEstimate {
  const { program, costProfiles, budget, now } = input;
  const cityProfile = costProfiles.find(
    (p) => p.country === program.country && p.city === program.city,
  );
  const countryProfile = costProfiles.find((p) => p.country === program.country && p.city === null);

  const lines: CostLine[] = [
    tuitionLine(program, now),
    ...LIVING_CATEGORIES.map((category) => livingLine(category, cityProfile, countryProfile, now)),
  ];
  const totals = sumPerCurrency(lines);
  const complete = lines.every((l) => l.status === "ok");

  return {
    programSlug: program.slug,
    lines,
    totals,
    complete,
    budgetFit: budgetFitOf(budget, complete, totals),
    academicYearMonths: ACADEMIC_YEAR_MONTHS,
  };
}
