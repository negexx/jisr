import type { IsoDate } from "@/data-schema/dates";
import type { FactMeta } from "@/data-schema/resolved";
import { freshnessOf } from "@/data-schema/staleness";
import type { FactRef, ReasonCode, RuleOutcome } from "./types";

export function toFactRef(record: string, path: string, meta: FactMeta, now: IsoDate): FactRef {
  const ref: FactRef = {
    record,
    path,
    source_url: meta.source_url,
    last_verified_at: meta.last_verified_at,
    info_kind: meta.info_kind,
    class: meta.class,
    freshness: freshnessOf(meta.class, meta.last_verified_at, now),
  };
  if (meta.basis !== undefined) ref.basis = meta.basis;
  return ref;
}

export function isDecisive(meta: FactMeta, now: IsoDate): boolean {
  return (
    meta.info_kind === "official" && freshnessOf(meta.class, meta.last_verified_at, now) !== "stale"
  );
}

export function downgrade(
  outcome: RuleOutcome,
  code: ReasonCode,
  facts: readonly FactRef[],
): { outcome: RuleOutcome; code: ReasonCode } {
  if (outcome === "unknown") return { outcome, code };
  if (facts.some((f) => f.freshness === "stale")) {
    return { outcome: "unknown", code: "stale_source" };
  }
  if (facts.some((f) => f.info_kind !== "official")) {
    return { outcome: "unknown", code: "non_official_source" };
  }
  return { outcome, code };
}
