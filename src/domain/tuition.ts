import type { Tuition } from "@/data-schema/records/program";

export type TuitionBounds = { min: number; max: number };

// A flat fee is a range whose ends are equal; minor units, same currency and period as the fee.
export function tuitionBounds(tuition: Tuition): TuitionBounds {
  return { min: tuition.amountMinor, max: tuition.maxAmountMinor ?? tuition.amountMinor };
}

export function isTuitionRange(tuition: Tuition): boolean {
  return tuition.maxAmountMinor !== undefined && tuition.maxAmountMinor > tuition.amountMinor;
}
