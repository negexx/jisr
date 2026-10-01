// Which source ids each source is responsible for, so a record it stopped producing can be pruned.
// The patterns must not overlap: a source may only ever prune its own records.
export const OWNS: Record<string, (sourceId: string) => boolean> = {
  france: (id) => /^(uai|parcoursup):/.test(id),
  institutions: (id) => /^(hrk:\d+|duo:\w+)$/.test(id),
  netherlands: (id) => /^rio(-unit)?:/.test(id),
  // campus units (hrk:<nr>@<town>) are shared with the DAAD importer: only the orphan sweep removes them
  germany: (id) => /^(ba|ba-provider):/.test(id),
  daad: (id) => /^daad(-academy)?:/.test(id),
};
