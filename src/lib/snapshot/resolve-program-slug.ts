export type AliasSource = { aliases?: Readonly<Record<string, string>> | undefined };

// Maps a former programme slug to the slug it is published under today; any other slug (live or
// unknown) comes back unchanged, so the caller's existing "not in our data" handling still decides.
// Build time already flattens chains (scripts/data/aliases.ts); the bounded walk keeps a hand-made
// or corrupt map from looping, and a loop resolves nothing.
export function resolveProgramSlug(slug: string, source: AliasSource): string {
  const aliases = source.aliases;
  if (aliases === undefined) return slug;
  const seen = new Set<string>([slug]);
  let current = slug;
  while (Object.hasOwn(aliases, current)) {
    const next = aliases[current];
    if (next === undefined || seen.has(next)) return slug;
    seen.add(next);
    current = next;
  }
  return current;
}
