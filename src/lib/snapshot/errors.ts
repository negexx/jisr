export type SnapshotErrorKind = "network" | "integrity" | "format" | "version_changed_twice";

const MESSAGES: Record<SnapshotErrorKind, string> = {
  network: "Snapshot data could not be fetched",
  integrity: "Snapshot shard failed its integrity check",
  format: "Snapshot data does not match the expected format",
  version_changed_twice: "Snapshot version changed twice while loading",
};

// Messages are fixed per kind: never a response body, a parse error (V8 quotes the input) or
// anything derived from the profile. `shard` names the manifest entry for debugging.
export class SnapshotError extends Error {
  readonly kind: SnapshotErrorKind;
  readonly shard: string | undefined;

  constructor(kind: SnapshotErrorKind, shard?: string) {
    super(MESSAGES[kind]);
    this.name = "SnapshotError";
    this.kind = kind;
    this.shard = shard;
  }
}
