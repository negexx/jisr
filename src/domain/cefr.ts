import type { Cefr } from "@/data-schema/primitives";

export const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"] as const satisfies readonly Cefr[];

export function cefrAtLeast(level: Cefr, min: Cefr): boolean {
  return CEFR_ORDER.indexOf(level) >= CEFR_ORDER.indexOf(min);
}
