import { afterAll, beforeAll } from "vitest";

import type { CoreShard } from "@/data-schema/snapshot";
import { isRecord } from "@/lib/guards";
import type { FormState } from "@/lib/profile/form/state";

import { credentialType } from "../../../fixtures/domain/builders";
import {
  buildSnapshot,
  E2E_DATA_DIR,
  readManifest,
  readShardJson,
  removeTempDirs,
} from "../../snapshot/fixture";
import { coreShard } from "../core-fixture";

function isCoreShard(value: unknown): value is CoreShard {
  return isRecord(value) && value.kind === "core";
}

// The core shard of the real data:build output for the T2 fixture, read once per test file.
export function withRealCore(): () => CoreShard {
  let core: CoreShard | undefined;
  beforeAll(() => {
    const dir = buildSnapshot(E2E_DATA_DIR);
    const shard = readShardJson(dir, readManifest(dir), "core");
    if (!isCoreShard(shard)) throw new Error("core shard has the wrong kind");
    core = shard;
  });
  afterAll(removeTempDirs);
  return () => {
    if (core === undefined) throw new Error("real core is not loaded yet");
    return core;
  };
}

// Two origin countries (XA and XB) and a German certificate, on top of the synthetic core.
export function multiOriginCore(): CoreShard {
  const base = coreShard();
  return {
    ...base,
    credentialTypes: [
      credentialType(),
      credentialType({
        slug: "xx-test-cred-b",
        country: "XB",
        gradingScale: "xx-test-scale-100",
        tracks: [{ slug: "xx-test-track-b", name: "XX B", gloss: null, subjects: [] }],
      }),
    ],
    languageCertificates: [
      ...base.languageCertificates,
      { slug: "xx-test-cert-de", name: "XX German", language: "de", url: "https://example.org/de" },
    ],
  };
}

export function edited(form: FormState, change: (draft: FormState) => void): FormState {
  const copy = structuredClone(form);
  change(copy);
  return copy;
}

// Valid against the synthetic `coreShard()`.
export function validForm(): FormState {
  return {
    nationality: "XA",
    credential: {
      country: "XA",
      type: "xx-test-cred",
      track: "xx-test-track-sci",
      status: "obtained",
      overall: "14,5",
      subjects: [{ subject: "xx-test-math", grade: "15" }],
    },
    priorHigherEducationYears: "0",
    languages: [
      { language: "fr", level: "B2", certificate: "xx-test-cert-fr" },
      { language: "en", level: "unknown", certificate: "" },
    ],
  };
}

export function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no item at index ${index}`);
  return item;
}
