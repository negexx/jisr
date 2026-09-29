import type { IsoDate } from "./dates";
import { diffDays } from "./dates";

export const STALENESS = {
  volatile: { agingDays: 120, staleDays: 270 },
  stable: { agingDays: 270, staleDays: 545 },
} as const;

export type StalenessClass = keyof typeof STALENESS;
export type Freshness = "fresh" | "aging" | "stale";

// A future last-verified date gives a negative age and reads as fresh; data:check rejects it separately.
export function freshnessOf(cls: StalenessClass, lastVerifiedAt: IsoDate, now: IsoDate): Freshness {
  const age = diffDays(now, lastVerifiedAt);
  const { agingDays, staleDays } = STALENESS[cls];
  if (age >= staleDays) return "stale";
  return age >= agingDays ? "aging" : "fresh";
}
