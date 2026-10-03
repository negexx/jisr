import { MAX_COMPARE, MIN_COMPARE } from "@/lib/constants";

function inOrder(slugs: ReadonlySet<string>, available: readonly string[]): string[] {
  return available.filter((slug) => slugs.has(slug));
}

// `available` is the ordered list of saved slugs that can be compared (found in the data).
// `picked === null` is the default selection: the first MAX_COMPARE of them.
export function effectiveSelection(
  available: readonly string[],
  picked: readonly string[] | null,
): string[] {
  if (picked === null) return available.slice(0, MAX_COMPARE);
  const chosen = inOrder(new Set(picked), available).slice(0, MAX_COMPARE);
  if (chosen.length >= MIN_COMPARE || available.length < MIN_COMPARE) return chosen;
  const topUp = available.filter((slug) => !chosen.includes(slug));
  return inOrder(new Set([...chosen, ...topUp.slice(0, MIN_COMPARE - chosen.length)]), available);
}

// Why a toggle of `slug` is refused, so the picker can say so instead of failing silently.
export function selectionBlock(selected: readonly string[], slug: string): "max" | "min" | null {
  if (selected.includes(slug)) return selected.length <= MIN_COMPARE ? "min" : null;
  return selected.length >= MAX_COMPARE ? "max" : null;
}

export function toggleSelection(
  selected: readonly string[],
  slug: string,
  available: readonly string[],
): string[] {
  if (selectionBlock(selected, slug) !== null) return [...selected];
  const next = new Set(selected);
  if (next.has(slug)) next.delete(slug);
  else next.add(slug);
  return inOrder(next, available);
}
