import type { SnapshotBundle } from "@/lib/snapshot/client";

import type { PickerItem } from "./compare-picker";

// Every saved slug as a picker row, in saved order: a program found in the loaded shards with its
// official name and place, anything else as a "no longer in our data" row. This reads plain bundle
// data, so the picker is available before the (heavier) comparison module has loaded.
export function pickerItems(bundle: SnapshotBundle, slugs: readonly string[]): PickerItem[] {
  const programs = new Map(
    bundle.programs.flatMap((shard) => shard.programs).map((program) => [program.slug, program]),
  );
  const institutions = new Map(
    bundle.institutions.flatMap((shard) => shard.institutions).map((i) => [i.slug, i]),
  );
  return slugs.map((slug): PickerItem => {
    const program = programs.get(slug);
    if (program === undefined) return { kind: "missing", slug };
    const institution = institutions.get(program.institution);
    return {
      kind: "program",
      slug,
      name: program.name,
      institutionName: institution?.name ?? program.institution,
      cityName: institution?.city.name ?? program.city,
    };
  });
}
