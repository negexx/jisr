import type { CountryCode, Slug } from "@/data-schema/primitives";
import type { Manifest } from "@/data-schema/snapshot";

import { programShardsIn } from "./manifest";
import { shardNames } from "./shard-names";

// Structural shard names only; the matching text shards are derived per locale at load time.
export type ShardPlan = { structural: string[] };

function present(manifest: Manifest, names: readonly string[]): ShardPlan {
  const structural = [...new Set(names)].filter((name) => Object.hasOwn(manifest.shards, name));
  return { structural };
}

function destinationShards(destination: CountryCode): string[] {
  return [
    shardNames.institutions(destination),
    shardNames.costs(destination),
    shardNames.scholarships(destination),
  ];
}

export function shardsForProfileForm(): ShardPlan {
  return { structural: [shardNames.core()] };
}

// Every destination is loaded whatever `profile.destinations` says, so programs outside the chosen
// destinations can be counted as hidden instead of silently missing.
export function shardsForMatches(
  profile: { credential: { country: CountryCode }; fields: readonly Slug[] },
  manifest: Manifest,
): ShardPlan {
  const programs = programShardsIn(manifest).filter((p) => profile.fields.includes(p.field));
  const destinations = [...new Set(programs.map((p) => p.destination))];
  return present(manifest, [
    shardNames.core(),
    shardNames.routes(profile.credential.country),
    ...programs.map((p) => p.name),
    ...destinations.flatMap(destinationShards),
  ]);
}

export function shardsForProgram(
  program: { country: CountryCode; field: Slug; slug: Slug },
  credentialCountry: CountryCode | null,
  manifest: Manifest,
): ShardPlan {
  return present(manifest, [
    shardNames.core(),
    ...(credentialCountry === null ? [] : [shardNames.routes(credentialCountry)]),
    shardNames.programs(program.country, program.field),
    ...destinationShards(program.country),
  ]);
}
