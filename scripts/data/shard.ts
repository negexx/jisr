import { LOCALES } from "@/data-schema/primitives";
import type { Shard } from "@/data-schema/snapshot";
import { shardNames } from "@/data-schema/snapshot";

import type { Resolved, ResolvedCatalog, TextBag } from "./resolve";
import { textEntries } from "./text";

export type NamedShard = { name: string; shard: Shard };

type Structural = NamedShard & { texts: TextBag };

function mergeTexts(items: readonly Resolved<unknown>[]): TextBag {
  const merged: TextBag = new Map();
  for (const item of items) {
    for (const [key, value] of item.texts) merged.set(key, value);
  }
  return merged;
}

function groupBy<T>(
  items: readonly Resolved<T>[],
  keyOf: (value: T) => readonly string[],
): Map<string, Resolved<T>[]> {
  const groups = new Map<string, Resolved<T>[]>();
  for (const item of items) {
    for (const key of new Set(keyOf(item.value))) {
      const group = groups.get(key);
      if (group === undefined) groups.set(key, [item]);
      else group.push(item);
    }
  }
  return groups;
}

function structuralShards(resolved: ResolvedCatalog): Structural[] {
  const shards: Structural[] = [];
  const values = <T>(items: readonly Resolved<T>[]): T[] => items.map((item) => item.value);

  shards.push({
    name: shardNames.core(),
    texts: mergeTexts([
      ...resolved.countries,
      ...resolved.fields,
      ...resolved.subjects,
      ...resolved.credentialTypes,
      ...resolved.applicationChannels,
    ]),
    shard: {
      kind: "core",
      countries: values(resolved.countries),
      fields: values(resolved.fields),
      subjects: values(resolved.subjects),
      languageCertificates: values(resolved.languageCertificates),
      gradingScales: values(resolved.gradingScales),
      gradeConversions: values(resolved.gradeConversions),
      credentialTypes: values(resolved.credentialTypes),
      applicationChannels: values(resolved.applicationChannels),
    },
  });

  for (const [origin, group] of groupBy(resolved.routes, (r) => [r.origin])) {
    shards.push({
      name: shardNames.routes(origin),
      texts: mergeTexts(group),
      shard: { kind: "routes", origin, routes: values(group) },
    });
  }
  for (const [destination, group] of groupBy(resolved.institutions, (i) => [i.country])) {
    shards.push({
      name: shardNames.institutions(destination),
      texts: mergeTexts(group),
      shard: { kind: "institutions", destination, institutions: values(group) },
    });
  }
  for (const [destination, group] of groupBy(resolved.costProfiles, (c) => [c.country])) {
    shards.push({
      name: shardNames.costs(destination),
      texts: mergeTexts(group),
      shard: { kind: "costs", destination, profiles: values(group) },
    });
  }
  for (const group of groupBy(resolved.programs, (p) => [`${p.country}.${p.field}`]).values()) {
    const first = group[0];
    if (first === undefined) continue;
    const { country: destination, field } = first.value;
    shards.push({
      name: shardNames.programs(destination, field),
      texts: mergeTexts(group),
      shard: { kind: "programs", destination, field, programs: values(group) },
    });
  }
  for (const [destination, group] of groupBy(resolved.scholarships, (s) => s.destinations)) {
    shards.push({
      name: shardNames.scholarships(destination),
      texts: mergeTexts(group),
      shard: { kind: "scholarships", destination, scholarships: values(group) },
    });
  }
  return shards;
}

export function buildShards(resolved: ResolvedCatalog): NamedShard[] {
  const structural = structuralShards(resolved);
  const shards: NamedShard[] = structural.map(({ name, shard }) => ({ name, shard }));
  for (const { name, texts } of structural) {
    for (const locale of LOCALES) {
      const entries = textEntries(texts, locale);
      if (Object.keys(entries).length === 0) continue;
      shards.push({
        name: shardNames.text(locale, name),
        shard: { kind: "text", locale, shard: name, entries },
      });
    }
  }
  return shards.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
