"use client";

import { useSyncExternalStore } from "react";

export type MatchesCounts = { ok: number; check: number; failed: number };

// The band's status summary renders in the page band, a separate client island from the matches list,
// so the two cannot pass props. Instead the island publishes its counts here and the summary
// subscribes: one snapshot load per page, so a shard-404 recovery reads the manifest once, not once
// per island.
let current: MatchesCounts | null = null;
const listeners = new Set<() => void>();

function isSame(a: MatchesCounts | null, b: MatchesCounts | null): boolean {
  if (a === null || b === null) return a === b;
  return a.ok === b.ok && a.check === b.check && a.failed === b.failed;
}

export function publishMatchesCounts(next: MatchesCounts | null): void {
  if (isSame(current, next)) return;
  current = next;
  for (const listener of listeners) listener();
}

// The foundation year folds into the amber "to check" count; the sections below keep it distinct.
export function foldMatchesCounts(counts: {
  ok: number;
  check: number;
  foundation: number;
  failed: number;
}): MatchesCounts {
  return { ok: counts.ok, check: counts.check + counts.foundation, failed: counts.failed };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): MatchesCounts | null {
  return current;
}

// The server holds no counts (the island has not run), so the static HTML carries none.
function getServerSnapshot(): MatchesCounts | null {
  return null;
}

export function useMatchesCounts(): MatchesCounts | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
