import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { type Manifest, ManifestSchema } from "@/data-schema/snapshot";

export const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const BUILD_SCRIPT = path.join(ROOT, "scripts", "data", "build.ts");
export const E2E_DATA_DIR = path.join(ROOT, "tests", "fixtures", "data", "e2e-journey");
export const EMPTY_DATA_DIR = path.join(ROOT, "tests", "fixtures", "data", "empty");

const tempDirs: string[] = [];

export function tempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

export function removeTempDirs(): void {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
}

// Same approach as tests/domain/pipeline.test.ts: run the real data:build CLI on a fixture dir.
export function buildSnapshot(dataDir: string): string {
  const outDir = tempDir("jisr-snapshot-");
  const run = spawnSync(
    process.execPath,
    ["--import", "tsx", BUILD_SCRIPT, "--data-dir", dataDir, "--out-dir", outDir],
    { cwd: ROOT, encoding: "utf8", timeout: 120_000 },
  );
  if (run.status !== 0) {
    throw new Error(`data:build failed (status ${run.status})\n${run.stdout}\n${run.stderr}`);
  }
  return outDir;
}

export type Edit = { file: string; from: string; to: string };

// A copy of the e2e fixture with text edits, so a rebuild yields a different snapshotVersion.
export function buildVariant(edits: readonly Edit[]): string {
  const dataDir = tempDir("jisr-data-");
  cpSync(E2E_DATA_DIR, dataDir, { recursive: true });
  for (const edit of edits) {
    const file = path.join(dataDir, edit.file);
    const source = readFileSync(file, "utf8");
    if (!source.includes(edit.from)) throw new Error(`edit target not found in ${edit.file}`);
    writeFileSync(file, source.replace(edit.from, edit.to));
  }
  return buildSnapshot(dataDir);
}

export function copySnapshot(dir: string): string {
  const copy = tempDir("jisr-snapshot-copy-");
  cpSync(dir, copy, { recursive: true });
  return copy;
}

export function readManifest(dir: string): Manifest {
  return ManifestSchema.parse(JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")));
}

export function readShardJson(dir: string, manifest: Manifest, name: string): unknown {
  const entry = manifest.shards[name];
  if (entry === undefined) throw new Error(`shard ${name} missing from manifest`);
  return JSON.parse(readFileSync(path.join(dir, entry.file), "utf8"));
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// A manifest entry (and file name) that honestly describes `bytes`, so integrity passes.
export function entryFor(name: string, bytes: Uint8Array) {
  const sha256 = sha256Hex(bytes);
  return {
    file: `s/${name}.${sha256.slice(0, 12)}.json`,
    sha256,
    bytes: bytes.length,
    gzipBytes: bytes.length,
  };
}

type Responder = () => Response | Promise<Response>;

export type FakeServer = {
  fetch: typeof fetch;
  requests: Array<{ url: string; init: RequestInit | undefined }>;
  countOf: (url: string) => number;
  setRoot: (dir: string) => void;
  queueManifest: (...manifests: Manifest[]) => void;
  serve: (url: string, body: Uint8Array | string) => void;
  override: (url: string, responder: Responder) => void;
  clearOverride: (url: string) => void;
};

const BASE = "/snapshots/";

// Serves a built snapshot dir under /snapshots, with per-URL overrides and queued manifests.
export function createFakeServer(root: string): FakeServer {
  let currentRoot = root;
  const manifests: Manifest[] = [];
  const overrides = new Map<string, Responder>();
  const requests: FakeServer["requests"] = [];

  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    requests.push({ url, init });
    const override = overrides.get(url);
    if (override !== undefined) return override();
    if (url === `${BASE}manifest.json`) {
      const queued = manifests.shift();
      if (queued !== undefined) return new Response(JSON.stringify(queued));
    }
    if (!url.startsWith(BASE)) return new Response(null, { status: 404 });
    const file = path.join(currentRoot, url.slice(BASE.length));
    if (!existsSync(file)) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(readFileSync(file)));
  };

  return {
    fetch: fetchImpl,
    requests,
    countOf: (url) => requests.filter((request) => request.url === url).length,
    setRoot: (dir) => {
      currentRoot = dir;
    },
    queueManifest: (...queued) => {
      manifests.push(...queued);
    },
    serve: (url, body) => {
      const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
      overrides.set(url, () => new Response(new Uint8Array(bytes)));
    },
    override: (url, responder) => {
      overrides.set(url, responder);
    },
    clearOverride: (url) => {
      overrides.delete(url);
    },
  };
}

export function shardUrl(manifest: Manifest, name: string): string {
  const entry = manifest.shards[name];
  if (entry === undefined) throw new Error(`shard ${name} missing from manifest`);
  return `${BASE}${entry.file}`;
}

export const MANIFEST_URL = `${BASE}manifest.json`;
