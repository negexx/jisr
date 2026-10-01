import type { Profile } from "@/data-schema/profile";
import type { Program } from "@/data-schema/resolved";
import type { AppLocale } from "@/i18n/routing";
import { createSnapshotClient, type SnapshotBundle } from "@/lib/snapshot/client";
import { shardsForMatches } from "@/lib/snapshot/plan";

import { createFakeServer } from "../snapshot/fixture";

// A real SnapshotBundle, loaded through the client from a snapshot built from a data directory.
export async function loadMatchesBundle(
  snapshotDir: string,
  profile: Profile,
  locale: AppLocale,
): Promise<SnapshotBundle> {
  const server = createFakeServer(snapshotDir);
  const client = createSnapshotClient({ baseUrl: "/snapshots", fetch: server.fetch, digest: null });
  return client.load((manifest) => shardsForMatches(profile, manifest), locale);
}

export function allPrograms(bundle: SnapshotBundle): Program[] {
  return bundle.programs.flatMap((shard) => shard.programs);
}

export function programOf(bundle: SnapshotBundle, slug: string): Program {
  const program = allPrograms(bundle).find((p) => p.slug === slug);
  if (program === undefined) throw new Error(`fixture program ${slug} missing`);
  return program;
}

// The same bundle with its program shards replaced by one shard holding `programs`.
export function withPrograms(bundle: SnapshotBundle, programs: Program[]): SnapshotBundle {
  const [first] = bundle.programs;
  if (first === undefined) throw new Error("bundle has no program shard");
  return { ...bundle, programs: [{ ...first, programs }] };
}
