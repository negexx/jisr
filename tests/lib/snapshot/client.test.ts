import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Manifest } from "@/data-schema/snapshot";
import {
  createDigest,
  createSnapshotClient,
  type Digest,
  type SnapshotBundle,
} from "@/lib/snapshot/client";
import { SnapshotError } from "@/lib/snapshot/errors";
import { shardsForMatches, shardsForProfileForm } from "@/lib/snapshot/plan";

import { E2E_PROFILE, E2E_SLUGS } from "../../fixtures/e2e/profiles";
import { forbidConsole } from "../profile/no-console";
import {
  buildSnapshot,
  buildVariant,
  createFakeServer,
  E2E_DATA_DIR,
  EMPTY_DATA_DIR,
  entryFor,
  type FakeServer,
  MANIFEST_URL,
  readManifest,
  readShardJson,
  removeTempDirs,
  shardUrl,
} from "./fixture";

forbidConsole();

const PROGRAMS_CS = "programs.XB.xx-test-field-cs";
const OK_SUMMARY = `programs/${E2E_SLUGS.ok}#summary`;
const FRONLY_SUMMARY = `programs/${E2E_SLUGS.frOnly}#summary`;

let base = "";
let v2 = "";
let v3 = "";
let empty = "";
let baseManifest: Manifest;
let v2Manifest: Manifest;

function variantEdits(tag: string) {
  return [
    {
      file: "programs/xx-test-prog-ok.yaml",
      from: "name: XX Test Programme OK",
      to: `name: XX Test Programme OK ${tag}`,
    },
    {
      file: "programs/xx-test-prog-foundation.yaml",
      from: "name: XX Test Programme Foundation",
      to: `name: XX Test Programme Foundation ${tag}`,
    },
  ];
}

beforeAll(() => {
  base = buildSnapshot(E2E_DATA_DIR);
  v2 = buildVariant(variantEdits("v2"));
  v3 = buildVariant(variantEdits("v3"));
  empty = buildSnapshot(EMPTY_DATA_DIR);
  baseManifest = readManifest(base);
  v2Manifest = readManifest(v2);
}, 300_000);

afterAll(removeTempDirs);

const matchesPlan = (manifest: Manifest) => shardsForMatches(E2E_PROFILE, manifest);

function clientFor(server: FakeServer, digest: Digest | null = createDigest()) {
  return createSnapshotClient({ baseUrl: "/snapshots", fetch: server.fetch, digest });
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the promise to reject");
}

async function snapshotError(promise: Promise<unknown>): Promise<SnapshotError> {
  const error = await rejection(promise);
  if (!(error instanceof SnapshotError)) throw new Error(`expected a SnapshotError: ${error}`);
  return error;
}

function withShards(manifest: Manifest, shards: Manifest["shards"]): Manifest {
  return { ...manifest, shards };
}

function expectBundleFrom(bundle: SnapshotBundle, dir: string, manifest: Manifest): void {
  expect(bundle.snapshotVersion).toBe(manifest.snapshotVersion);
  expect(bundle.core).toEqual(readShardJson(dir, manifest, "core"));
  expect(bundle.routes).toEqual(readShardJson(dir, manifest, "routes.XA"));
  const read = (names: string[]) => names.map((name) => readShardJson(dir, manifest, name));
  expect(bundle.programs).toEqual(
    read([
      "programs.XB.xx-test-field-cs",
      "programs.XB.xx-test-field-eng",
      "programs.XC.xx-test-field-cs",
    ]),
  );
  expect(bundle.institutions).toEqual(read(["institutions.XB", "institutions.XC"]));
  expect(bundle.costProfiles).toEqual(read(["costs.XB", "costs.XC"]));
  expect(bundle.scholarships).toEqual(read(["scholarships.XB", "scholarships.XC"]));
}

describe("happy path", () => {
  it("loads a consistent matches bundle from one manifest", async () => {
    const server = createFakeServer(base);
    const bundle = await clientFor(server).load(matchesPlan, "en");
    expectBundleFrom(bundle, base, baseManifest);
    expect(bundle.hasPrograms).toBe(true);
    expect(bundle.text(OK_SUMMARY)).toEqual({
      text: "Complete matching test programme",
      note: "none",
    });
    expect(server.countOf(MANIFEST_URL)).toBe(1);
  });

  it("accepts a precomputed plan", async () => {
    const server = createFakeServer(base);
    const bundle = await clientFor(server).load(shardsForProfileForm(), "fr");
    expect(bundle.core).toEqual(readShardJson(base, baseManifest, "core"));
    expect(bundle.programs).toEqual([]);
    expect(bundle.routes).toBeUndefined();
    expect(server.requests.map((r) => r.url).sort()).toEqual(
      [MANIFEST_URL, shardUrl(baseManifest, "core"), shardUrl(baseManifest, "text.fr.core")].sort(),
    );
  });

  it("requests the manifest with cache: no-cache", async () => {
    const server = createFakeServer(base);
    await clientFor(server).load(shardsForProfileForm(), "fr");
    const manifestRequest = server.requests.find((r) => r.url === MANIFEST_URL);
    expect(manifestRequest?.init?.cache).toBe("no-cache");
  });

  it("reports hasPrograms false for an empty catalogue", async () => {
    const server = createFakeServer(empty);
    const bundle = await clientFor(server).load(matchesPlan, "fr");
    expect(bundle.hasPrograms).toBe(false);
    expect(bundle.programs).toEqual([]);
    expect(bundle.core?.kind).toBe("core");
  });
});

describe("privacy", () => {
  it("requests only the manifest and content-hashed shard files, with no body or query", async () => {
    const server = createFakeServer(base);
    await clientFor(server).load(matchesPlan, "ar");
    expect(server.requests.length).toBeGreaterThan(1);
    for (const { url, init } of server.requests) {
      expect(url).toMatch(/^\/snapshots\/(manifest\.json|s\/[A-Za-z0-9.-]+\.[0-9a-f]{12}\.json)$/);
      expect(url).not.toContain("?");
      expect(init?.body).toBeUndefined();
      expect(init?.method ?? "GET").toBe("GET");
    }
  });
});

describe("text shards", () => {
  it("treats a text shard missing from the manifest as empty text", async () => {
    const shards = { ...baseManifest.shards };
    delete shards[`text.en.${PROGRAMS_CS}`];
    const server = createFakeServer(base);
    server.queueManifest(withShards(baseManifest, shards));
    const bundle = await clientFor(server).load(matchesPlan, "en");
    expect(bundle.text(OK_SUMMARY)).toBeUndefined();
    expect(bundle.programs).toHaveLength(3);
  });

  it("never requests text shards for structural shards without text", async () => {
    const server = createFakeServer(base);
    await clientFor(server).load(matchesPlan, "fr");
    expect(server.requests.some((r) => r.url.includes("text.fr.institutions"))).toBe(false);
    expect(server.requests.some((r) => r.url.includes("text.en."))).toBe(false);
  });

  it.each([
    ["fr", FRONLY_SUMMARY, "none"],
    ["en", FRONLY_SUMMARY, "french_fallback"],
    ["ar", FRONLY_SUMMARY, "french_fallback"],
    ["en", OK_SUMMARY, "none"],
    ["ar", OK_SUMMARY, "machine_translated"],
  ] as const)("in %s, %s has note %s", async (locale, key, note) => {
    const bundle = await clientFor(createFakeServer(base)).load(matchesPlan, locale);
    expect(bundle.text(key)?.note).toBe(note);
  });
});

describe("version pinning", () => {
  it("refetches the manifest once on a shard 404 and fails with network when unchanged", async () => {
    const server = createFakeServer(base);
    server.override(shardUrl(baseManifest, PROGRAMS_CS), () => new Response(null, { status: 404 }));
    const error = await snapshotError(clientFor(server).load(matchesPlan, "fr"));
    expect(error.kind).toBe("network");
    expect(server.countOf(MANIFEST_URL)).toBe(2);
  });

  it("treats a rejected shard fetch like a 404", async () => {
    const server = createFakeServer(base);
    server.override(shardUrl(baseManifest, "core"), () => Promise.reject(new TypeError("offline")));
    const error = await snapshotError(clientFor(server).load(matchesPlan, "fr"));
    expect(error.kind).toBe("network");
    expect(server.countOf(MANIFEST_URL)).toBe(2);
  });

  it("rebuilds the whole bundle from the new version when the version changed", async () => {
    const server = createFakeServer(v2);
    server.queueManifest(baseManifest);
    const bundle = await clientFor(server).load(matchesPlan, "fr");

    expect(bundle.snapshotVersion).not.toBe(baseManifest.snapshotVersion);
    expectBundleFrom(bundle, v2, v2Manifest);
    const names = bundle.programs.flatMap((shard) => shard.programs.map((p) => p.name));
    expect(names).toContain("XX Test Programme OK v2");
    expect(names).toContain("XX Test Programme Foundation v2");
    expect(server.countOf(MANIFEST_URL)).toBe(2);

    const secondManifest = server.requests.map((r) => r.url).lastIndexOf(MANIFEST_URL);
    const v2Files = new Set(Object.values(v2Manifest.shards).map((s) => `/snapshots/${s.file}`));
    for (const { url } of server.requests.slice(secondManifest + 1)) {
      expect(v2Files.has(url)).toBe(true);
    }
  });

  it("fails with version_changed_twice when the rebuilt version is replaced again, then recovers", async () => {
    const server = createFakeServer(v3);
    server.queueManifest(baseManifest, v2Manifest);
    const client = clientFor(server);
    const error = await snapshotError(client.load(matchesPlan, "fr"));
    expect(error.kind).toBe("version_changed_twice");
    expect(server.countOf(MANIFEST_URL)).toBe(3);

    const retried = await client.load(matchesPlan, "fr");
    expectBundleFrom(retried, v3, readManifest(v3));
  });
});

describe("session manifest", () => {
  it("never moves back to a manifest fetched before the one already adopted", async () => {
    const v3Manifest = readManifest(v3);
    const server = createFakeServer(v3);
    let releaseOld: () => void = () => {};
    let manifestRequests = 0;
    server.override(MANIFEST_URL, () => {
      manifestRequests += 1;
      if (manifestRequests === 1) return new Response(JSON.stringify(baseManifest));
      // Load A's refetch is slow and returns v2; load B's later refetch returns v3 at once.
      if (manifestRequests === 2) {
        return new Promise<Response>((resolve) => {
          releaseOld = () => resolve(new Response(JSON.stringify(v2Manifest)));
        });
      }
      return new Response(JSON.stringify(v3Manifest));
    });
    // Hold A's rebuild from v2 so the session state can be observed while it is pending.
    let releaseV2: () => void = () => {};
    const heldV2 = new Promise<Response>((resolve) => {
      releaseV2 = () => resolve(new Response(null, { status: 404 }));
    });
    const v2Only = Object.entries(v2Manifest.shards)
      .filter(([name, entry]) => v3Manifest.shards[name]?.file !== entry.file)
      .map(([name]) => shardUrl(v2Manifest, name));
    for (const url of v2Only) server.override(url, () => heldV2);

    const client = clientFor(server);
    const loadA = client.load(matchesPlan, "fr");
    const loadB = client.load(matchesPlan, "fr");
    expect((await loadB).snapshotVersion).toBe(v3Manifest.snapshotVersion);

    releaseOld();
    await vi.waitFor(() => {
      expect(server.requests.some((r) => v2Only.includes(r.url))).toBe(true);
    });
    const before = server.requests.length;
    const loadC = await Promise.race([
      client.load(matchesPlan, "fr"),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 200)),
    ]);
    expect(loadC?.snapshotVersion).toBe(v3Manifest.snapshotVersion);
    expect(server.requests.length).toBe(before);

    releaseV2();
    expect((await snapshotError(loadA)).kind).toBe("version_changed_twice");
  });
});

describe("integrity", () => {
  function tampered(name: string, edit: (text: string) => string): Uint8Array {
    const entry = baseManifest.shards[name];
    if (entry === undefined) throw new Error(`no ${name}`);
    const original = JSON.stringify(readShardJson(base, baseManifest, name));
    return new TextEncoder().encode(edit(original));
  }

  it("rejects a byte-length mismatch", async () => {
    const server = createFakeServer(base);
    server.serve(
      shardUrl(baseManifest, PROGRAMS_CS),
      tampered(PROGRAMS_CS, (t) => `${t} `),
    );
    const error = await snapshotError(clientFor(server).load(matchesPlan, "fr"));
    expect(error.kind).toBe("integrity");
    expect(error.shard).toBe(PROGRAMS_CS);
    expect(server.countOf(MANIFEST_URL)).toBe(1);
  });

  it("rejects a sha256 mismatch of the same length", async () => {
    const server = createFakeServer(base);
    const bytes = tampered(PROGRAMS_CS, (t) => t.replace("Programme OK", "Programme OX"));
    expect(bytes.length).toBe(baseManifest.shards[PROGRAMS_CS]?.bytes);
    server.serve(shardUrl(baseManifest, PROGRAMS_CS), bytes);
    const error = await snapshotError(clientFor(server).load(matchesPlan, "fr"));
    expect(error.kind).toBe("integrity");
  });

  it("without a digest still enforces the byte length", async () => {
    const lengthServer = createFakeServer(base);
    lengthServer.serve(
      shardUrl(baseManifest, PROGRAMS_CS),
      tampered(PROGRAMS_CS, (t) => `${t} `),
    );
    const error = await snapshotError(clientFor(lengthServer, null).load(matchesPlan, "fr"));
    expect(error.kind).toBe("integrity");

    const sameLength = createFakeServer(base);
    sameLength.serve(
      shardUrl(baseManifest, PROGRAMS_CS),
      tampered(PROGRAMS_CS, (t) => t.replace("Programme OK", "Programme OX")),
    );
    const bundle = await clientFor(sameLength, null).load(matchesPlan, "fr");
    expect(bundle.programs[0]?.programs.map((p) => p.name)).toContain("XX Test Programme OX");
  });

  it("rejects a shard whose kind does not match its name", async () => {
    const server = createFakeServer(base);
    const core = baseManifest.shards.core;
    if (core === undefined) throw new Error("no core");
    server.queueManifest(withShards(baseManifest, { ...baseManifest.shards, [PROGRAMS_CS]: core }));
    const error = await snapshotError(clientFor(server).load(matchesPlan, "fr"));
    expect(error.kind).toBe("format");
    expect(error.shard).toBe(PROGRAMS_CS);
  });

  it("rejects a shard whose destination does not match its name", async () => {
    const server = createFakeServer(base);
    const xc = baseManifest.shards["institutions.XC"];
    if (xc === undefined) throw new Error("no institutions.XC");
    server.queueManifest(
      withShards(baseManifest, { ...baseManifest.shards, "institutions.XB": xc }),
    );
    const error = await snapshotError(clientFor(server).load(matchesPlan, "fr"));
    expect(error.kind).toBe("format");
    expect(error.shard).toBe("institutions.XB");
  });

  it("rejects a non-JSON body that passes integrity", async () => {
    const server = createFakeServer(base);
    const bytes = new TextEncoder().encode("not json at all");
    const entry = entryFor(PROGRAMS_CS, bytes);
    server.queueManifest(
      withShards(baseManifest, { ...baseManifest.shards, [PROGRAMS_CS]: entry }),
    );
    server.serve(`/snapshots/${entry.file}`, bytes);
    const error = await snapshotError(clientFor(server).load(matchesPlan, "fr"));
    expect(error.kind).toBe("format");
    expect(error.message).not.toContain("not json");
  });

  it("rejects an invalid manifest as a format error", async () => {
    const server = createFakeServer(base);
    server.serve(MANIFEST_URL, JSON.stringify({ ...baseManifest, formatVersion: 3 }));
    const error = await snapshotError(clientFor(server).load(matchesPlan, "fr"));
    expect(error.kind).toBe("format");
  });

  it("fails with network when the manifest itself is unavailable", async () => {
    const server = createFakeServer(base);
    server.override(MANIFEST_URL, () => new Response(null, { status: 503 }));
    const error = await snapshotError(clientFor(server).load(matchesPlan, "fr"));
    expect(error.kind).toBe("network");
  });
});

describe("cache", () => {
  it("fetches each shard once across sequential loads", async () => {
    const server = createFakeServer(base);
    const client = clientFor(server);
    const first = await client.load(matchesPlan, "fr");
    const second = await client.load(matchesPlan, "fr");
    expect(second).toEqual({ ...first, text: second.text });
    const counts = new Map<string, number>();
    for (const { url } of server.requests) counts.set(url, (counts.get(url) ?? 0) + 1);
    expect([...counts.values()].every((count) => count === 1)).toBe(true);
  });

  it("shares in-flight fetches between concurrent loads", async () => {
    const server = createFakeServer(base);
    const client = clientFor(server);
    await Promise.all([client.load(matchesPlan, "fr"), client.load(matchesPlan, "fr")]);
    const urls = server.requests.map((r) => r.url);
    expect(urls.length).toBe(new Set(urls).size);
  });

  it("does not let a failed load poison a later load", async () => {
    const server = createFakeServer(base);
    const client = clientFor(server);
    const url = shardUrl(baseManifest, PROGRAMS_CS);
    server.override(url, () => new Response(null, { status: 500 }));
    expect((await snapshotError(client.load(matchesPlan, "fr"))).kind).toBe("network");
    server.clearOverride(url);
    expectBundleFrom(await client.load(matchesPlan, "fr"), base, baseManifest);
  });

  it("does not cache a failed manifest", async () => {
    const server = createFakeServer(base);
    const client = clientFor(server);
    server.override(MANIFEST_URL, () => Promise.reject(new TypeError("offline")));
    expect((await snapshotError(client.load(matchesPlan, "fr"))).kind).toBe("network");
    server.clearOverride(MANIFEST_URL);
    expectBundleFrom(await client.load(matchesPlan, "fr"), base, baseManifest);
  });
});

describe("abort", () => {
  it("rejects on abort and leaves no cached failure", async () => {
    const server = createFakeServer(base);
    const client = clientFor(server);
    const url = shardUrl(baseManifest, PROGRAMS_CS);
    let release: (response: Response) => void = () => {};
    server.override(url, () => new Promise<Response>((resolve) => (release = resolve)));

    const controller = new AbortController();
    const pending = client.load(matchesPlan, "fr", controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 20));
    controller.abort();
    const error = await rejection(pending);
    expect(error).toMatchObject({ name: "AbortError" });

    // The abandoned fetch now fails; once it has settled, nothing of it may remain cached.
    release(new Response(null, { status: 500 }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    server.clearOverride(url);
    expectBundleFrom(await client.load(matchesPlan, "fr"), base, baseManifest);
  });

  it("rejects an already-aborted signal without any request", async () => {
    const server = createFakeServer(base);
    const controller = new AbortController();
    controller.abort();
    const error = await rejection(clientFor(server).load(matchesPlan, "fr", controller.signal));
    expect(error).toMatchObject({ name: "AbortError" });
    expect(server.requests).toEqual([]);
  });
});
