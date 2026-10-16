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

// Every program shard is loaded whatever the match filters say, so a filter can only hide a loaded
// program (and count it as hidden), never silently omit it from the page.
export function shardsForMatches(
  profile: { credential: { country: CountryCode } },
  manifest: Manifest,
): ShardPlan {
  const programs = programShardsIn(manifest);
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

// The shards the plan page needs for the saved programs: the same set `shardsForProgram` builds
// for one program, unioned. A program shard the manifest no longer lists is simply absent, and
// the page then shows that saved program as "no longer in our data".
export function shardsForPlan(
  items: ReadonlyArray<{ country: CountryCode; field: Slug }>,
  credentialCountry: CountryCode,
  manifest: Manifest,
): ShardPlan {
  return present(manifest, [
    shardNames.core(),
    shardNames.routes(credentialCountry),
    ...items.flatMap((item) => [
      shardNames.programs(item.country, item.field),
      ...destinationShards(item.country),
    ]),
  ]);
}
