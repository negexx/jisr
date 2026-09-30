import { compareIso, type IsoDate } from "@/data-schema/dates";
import type { FactMeta } from "@/data-schema/resolved";
import { type Freshness, freshnessOf } from "@/data-schema/staleness";
import type { FactRef } from "@/domain/types";

export type FactLike = FactMeta | FactRef;

const SEVERITY: Record<Freshness, number> = { fresh: 0, aging: 1, stale: 2 };

// Always recomputed from `now`: a FactRef's stored freshness was computed at its own `now`, which
// for a page built earlier is not the visitor's today.
export function freshnessOfFact(meta: FactLike, now: IsoDate): Freshness {
  return freshnessOf(meta.class, meta.last_verified_at, now);
}

export function worstFreshness(facts: readonly FactLike[], now: IsoDate): Freshness {
  let worst: Freshness = "fresh";
  for (const fact of facts) {
    const freshness = freshnessOfFact(fact, now);
    if (SEVERITY[freshness] > SEVERITY[worst]) worst = freshness;
  }
  return worst;
}

export function oldestVerified(facts: readonly FactLike[]): IsoDate | null {
  let oldest: IsoDate | null = null;
  for (const fact of facts) {
    if (oldest === null || compareIso(fact.last_verified_at, oldest) < 0) {
      oldest = fact.last_verified_at;
    }
  }
  return oldest;
}
