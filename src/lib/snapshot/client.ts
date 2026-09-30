import type {
  CoreShard,
  CostsShard,
  InstitutionsShard,
  Manifest,
  ProgramsShard,
  RoutesShard,
  ScholarshipsShard,
  Shard,
  TextShard,
} from "@/data-schema/snapshot";
import type { AppLocale } from "@/i18n/routing";

import { SnapshotError } from "./errors";
import { checkShardShape, parseManifest, programShardsIn } from "./manifest";
import type { ShardPlan } from "./plan";
import { shardNames } from "./shard-names";
import { createTextLookup, type TextLookup } from "./text";

export type Digest = (bytes: ArrayBuffer) => Promise<string>;
type ManifestEntry = Manifest["shards"][string];

// Most plans depend on the manifest (which shards exist), so a plan may be a function of it: the
// client then re-plans against the new manifest when it has to rebuild after a version change.
export type ShardPlanner = (manifest: Manifest) => ShardPlan;
export type PlanInput = ShardPlan | ShardPlanner;

export type SnapshotBundle = {
  snapshotVersion: string;
  core: CoreShard | undefined;
  routes: RoutesShard | undefined;
  programs: ProgramsShard[];
  institutions: InstitutionsShard[];
  costProfiles: CostsShard[];
  scholarships: ScholarshipsShard[];
  text: TextLookup;
  hasPrograms: boolean;
};

export type SnapshotClient = {
  load(plan: PlanInput, locale: AppLocale, signal?: AbortSignal): Promise<SnapshotBundle>;
};

export type SnapshotClientOptions = {
  baseUrl: string;
  fetch: typeof fetch;
  digest: Digest | null;
};

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Returns null where crypto.subtle is missing (insecure context such as plain-http LAN testing):
// the client then checks byte length and structure only.
export function createDigest(
  source: { subtle?: SubtleCrypto } | undefined = globalThis.crypto,
): Digest | null {
  const subtle = source?.subtle;
  if (subtle === undefined) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("Snapshot SHA-256 check disabled: crypto.subtle is unavailable here.");
    }
    return null;
  }
  return async (bytes) => toHex(await subtle.digest("SHA-256", bytes));
}

// Rejects with the signal's reason as soon as it aborts; the shared promise itself keeps running
// so another caller waiting on the same shard is not affected.
function abortable<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) return promise;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function isShardUnavailable(error: unknown): error is SnapshotError {
  return error instanceof SnapshotError && error.kind === "network" && error.shard !== undefined;
}

function assembleBundle(manifest: Manifest, shards: readonly Shard[], locale: AppLocale) {
  const bundle: Omit<SnapshotBundle, "text"> = {
    snapshotVersion: manifest.snapshotVersion,
    core: undefined,
    routes: undefined,
    programs: [],
    institutions: [],
    costProfiles: [],
    scholarships: [],
    hasPrograms: programShardsIn(manifest).length > 0,
  };
  const texts: TextShard[] = [];
  for (const shard of shards) {
    switch (shard.kind) {
      case "core":
        bundle.core = shard;
        break;
      case "routes":
        bundle.routes ??= shard;
        break;
      case "programs":
        bundle.programs.push(shard);
        break;
      case "institutions":
        bundle.institutions.push(shard);
        break;
      case "costs":
        bundle.costProfiles.push(shard);
        break;
      case "scholarships":
        bundle.scholarships.push(shard);
        break;
      case "text":
        texts.push(shard);
        break;
    }
  }
  return { ...bundle, text: createTextLookup(texts, locale) };
}

export function createSnapshotClient(options: SnapshotClientOptions): SnapshotClient {
  const { baseUrl, fetch: fetchImpl, digest } = options;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  // One manifest per session: every bundle is resolved from the manifest held here.
  let sessionManifest: Promise<Manifest> | null = null;
  const shardCache = new Map<string, { sha256: string; json: Promise<unknown> }>();

  async function fetchManifest(): Promise<Manifest> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/manifest.json`, { cache: "no-cache" });
    } catch {
      throw new SnapshotError("network");
    }
    if (!response.ok) throw new SnapshotError("network");
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new SnapshotError("format");
    }
    return parseManifest(json);
  }

  function currentManifest(): Promise<Manifest> {
    if (sessionManifest === null) {
      const pending = fetchManifest();
      sessionManifest = pending;
      pending.catch(() => {
        if (sessionManifest === pending) sessionManifest = null;
      });
      return pending;
    }
    return sessionManifest;
  }

  // Refetches are numbered by start order so that a slow, older response cannot replace a newer
  // manifest another load has already adopted: the session manifest only moves forward.
  let refetchCount = 0;
  let adoptedRefetch = 0;

  async function refetchManifest(): Promise<{ manifest: Manifest; order: number }> {
    const order = ++refetchCount;
    return { manifest: await fetchManifest(), order };
  }

  function adoptManifest(next: { manifest: Manifest; order: number }, previous: Manifest): void {
    if (next.order < adoptedRefetch) return;
    adoptedRefetch = next.order;
    sessionManifest = Promise.resolve(next.manifest);
    if (next.manifest.snapshotVersion !== previous.snapshotVersion) shardCache.clear();
  }

  // Resolves to the parsed JSON of bytes whose length and sha256 match `entry`.
  async function fetchVerified(name: string, entry: ManifestEntry): Promise<unknown> {
    let bytes: ArrayBuffer;
    try {
      const response = await fetchImpl(`${baseUrl}/${entry.file}`);
      if (!response.ok) throw new SnapshotError("network", name);
      bytes = await response.arrayBuffer();
    } catch {
      throw new SnapshotError("network", name);
    }
    if (bytes.byteLength !== entry.bytes) throw new SnapshotError("integrity", name);
    if (digest !== null && (await digest(bytes)) !== entry.sha256) {
      throw new SnapshotError("integrity", name);
    }
    try {
      return JSON.parse(decoder.decode(bytes));
    } catch {
      throw new SnapshotError("format", name);
    }
  }

  async function shard(manifest: Manifest, name: string): Promise<Shard> {
    const entry = manifest.shards[name];
    if (entry === undefined) throw new SnapshotError("format", name);
    const key = `${manifest.snapshotVersion}/${entry.file}`;
    let cached = shardCache.get(key);
    if (cached === undefined) {
      const pending = fetchVerified(name, entry);
      cached = { sha256: entry.sha256, json: pending };
      shardCache.set(key, cached);
      // A failure is never cached: the next load retries the fetch.
      pending.catch(() => {
        if (shardCache.get(key)?.json === pending) shardCache.delete(key);
      });
    }
    // The cache is keyed by file, so the entry's hash and the name-specific guard are checked per
    // request: one verified file cannot stand in for another manifest name.
    if (cached.sha256 !== entry.sha256) throw new SnapshotError("integrity", name);
    return checkShardShape(name, await cached.json);
  }

  async function build(
    manifest: Manifest,
    plan: PlanInput,
    locale: AppLocale,
    signal: AbortSignal | undefined,
  ): Promise<SnapshotBundle> {
    const { structural } = typeof plan === "function" ? plan(manifest) : plan;
    const listed = (name: string) => Object.hasOwn(manifest.shards, name);
    const structuralNames = [...new Set(structural)].filter(listed);
    // A text shard missing from the manifest means "no text", not an error.
    const textNames = structuralNames.map((name) => shardNames.text(locale, name)).filter(listed);
    const shards = await abortable(
      Promise.all([...structuralNames, ...textNames].map((name) => shard(manifest, name))),
      signal,
    );
    return assembleBundle(manifest, shards, locale);
  }

  async function load(
    plan: PlanInput,
    locale: AppLocale,
    signal?: AbortSignal,
  ): Promise<SnapshotBundle> {
    signal?.throwIfAborted();
    const first = await abortable(currentManifest(), signal);
    try {
      return await build(first, plan, locale, signal);
    } catch (error) {
      if (!isShardUnavailable(error)) throw error;
    }

    // A missing shard usually means a new snapshot was deployed: re-read the manifest once.
    // This load keeps using the manifest it fetched even if a newer one was adopted meanwhile: a
    // bundle is always built from one manifest.
    const refetched = await abortable(refetchManifest(), signal);
    adoptManifest(refetched, first);
    const second = refetched.manifest;
    if (second.snapshotVersion === first.snapshotVersion) throw new SnapshotError("network");
    try {
      return await build(second, plan, locale, signal);
    } catch (error) {
      if (!isShardUnavailable(error)) throw error;
    }

    // Never mix versions and never loop: report whether the version moved again, keep the latest
    // manifest so a retry starts from it.
    const third = await abortable(refetchManifest(), signal);
    adoptManifest(third, second);
    throw new SnapshotError(
      third.manifest.snapshotVersion === second.snapshotVersion
        ? "network"
        : "version_changed_twice",
    );
  }

  return { load };
}
