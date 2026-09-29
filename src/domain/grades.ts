import type { Slug } from "@/data-schema/primitives";
import type { GradeValue } from "@/data-schema/profile";
import type { GradeConversion } from "@/data-schema/resolved";

export type GradeConversionResult =
  | { kind: "same_scale"; value: GradeValue }
  | { kind: "converted"; value: GradeValue; via: GradeConversion }
  | { kind: "no_conversion" };

// Absorbs binary float error (e.g. 1.13 * 100 = 112.99999999999999) so it cannot flip a truncation.
const FLOAT_GUARD_DECIMALS = 9;

function truncateTo(x: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.trunc(Number((x * factor).toFixed(FLOAT_GUARD_DECIMALS))) / factor;
}

function applyConversion(conversion: GradeConversion["conversion"], v: number): number | null {
  switch (conversion.method) {
    case "identity":
      return v;
    case "linear": {
      const { fromMin, fromMax, toMin, toMax } = conversion.params;
      if (fromMax === fromMin) return null;
      return toMin + ((v - fromMin) * (toMax - toMin)) / (fromMax - fromMin);
    }
    case "modified_bavarian": {
      const { nMax, nMin, truncateDecimals } = conversion.params;
      if (nMax === nMin) return null;
      const x = 1 + (3 * (nMax - v)) / (nMax - nMin);
      return truncateDecimals === null ? x : truncateTo(x, truncateDecimals);
    }
    default: {
      const unreachable: never = conversion;
      return unreachable;
    }
  }
}

export function convertGrade(
  grade: GradeValue,
  toScale: Slug,
  conversions: readonly GradeConversion[],
): GradeConversionResult {
  if (grade.scale === toScale) return { kind: "same_scale", value: grade };

  const via = conversions.find((c) => c.from === grade.scale && c.to === toScale);
  if (!via) return { kind: "no_conversion" };

  const value = applyConversion(via.conversion, grade.value);
  if (value === null || !Number.isFinite(value)) return { kind: "no_conversion" };

  return { kind: "converted", value: { scale: toScale, value }, via };
}
