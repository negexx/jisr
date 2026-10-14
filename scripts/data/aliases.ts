import type { Issue } from "./load-data";

// A record that can carry former slugs (programs and institutions). The alias map is one namespace
// across those collections: a former slug is a global id, so the checks look at every live id.
export type AliasRow = { file: string; slug: string; formerSlugs: readonly string[] };
export type LiveId = { id: string; file: string };

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function edgesOf(rows: readonly AliasRow[]): Map<string, string> {
  const edges = new Map<string, string>();
  for (const { slug, formerSlugs } of rows) {
    for (const former of formerSlugs) {
      if (!edges.has(former)) edges.set(former, slug);
    }
  }
  return edges;
}

function cycleOf(edges: ReadonlyMap<string, string>, start: string): string[] | null {
  const path = [start];
  const seen = new Set<string>([start]);
  let current = edges.get(start);
  while (current !== undefined) {
    if (seen.has(current)) return path.slice(path.indexOf(current));
    path.push(current);
    seen.add(current);
    current = edges.get(current);
  }
  return null;
}

function cycleMessage(cycle: readonly string[]): string {
  const first = cycle.reduce((best, node) => (byText(node, best) < 0 ? node : best));
  const at = cycle.indexOf(first);
  return `alias cycle: ${[...cycle.slice(at), ...cycle.slice(0, at), first].join(" -> ")}`;
}

export function checkAliases(rows: readonly AliasRow[], liveIds: readonly LiveId[]): Issue[] {
  const sorted = [...rows].sort((a, b) => byText(a.file, b.file) || byText(a.slug, b.slug));
  const live = new Map(liveIds.map(({ id, file }) => [id, file]));
  const owner = new Map<string, string>();
  for (const { file, slug } of sorted) {
    if (!live.has(slug)) live.set(slug, file);
    if (!owner.has(slug)) owner.set(slug, file);
  }

  const issues: Issue[] = [];
  const claimed = new Map<string, string>();
  for (const { file, formerSlugs } of sorted) {
    for (const [index, former] of formerSlugs.entries()) {
      const path = `formerSlugs.${index}`;
      const liveFile = live.get(former);
      if (liveFile !== undefined) {
        issues.push({
          file,
          path,
          message: `alias collision: former slug "${former}" is already a live slug (${liveFile})`,
        });
      }
      const other = claimed.get(former);
      if (other !== undefined) {
        issues.push({
          file,
          path,
          message: `duplicate former slug "${former}" (also in ${other})`,
        });
      } else {
        claimed.set(former, file);
      }
    }
  }

  const edges = edgesOf(sorted);
  const seenCycles = new Set<string>();
  for (const start of [...edges.keys()].sort(byText)) {
    const cycle = cycleOf(edges, start);
    if (cycle === null) continue;
    const message = cycleMessage(cycle);
    if (seenCycles.has(message)) continue;
    seenCycles.add(message);
    const firstNode = message.slice("alias cycle: ".length).split(" -> ")[0] ?? start;
    issues.push({ file: owner.get(firstNode) ?? "", path: "", message });
  }

  return issues.sort(
    (a, b) => byText(a.file, b.file) || byText(a.path, b.path) || byText(a.message, b.message),
  );
}

// The published map is flat: a former slug pointing at a target that was itself renamed resolves to
// the final slug in one lookup. Cycles never reach this point (checkAliases rejects them first).
export function aliasMapOf(rows: readonly AliasRow[]): Record<string, string> {
  const edges = edgesOf(rows);
  const map: Record<string, string> = {};
  for (const [from, to] of edges) {
    let target = to;
    const seen = new Set<string>([from]);
    while (edges.has(target)) {
      if (seen.has(target)) {
        target = to;
        break;
      }
      seen.add(target);
      target = edges.get(target) as string;
    }
    map[from] = target;
  }
  return Object.fromEntries(Object.entries(map).sort(([a], [b]) => byText(a, b)));
}
