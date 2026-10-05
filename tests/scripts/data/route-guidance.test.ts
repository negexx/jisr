import path from "node:path";
import { canonicalJson } from "@scripts/data/canonical-json";
import type { LoadResult } from "@scripts/data/load-data";
import { loadData } from "@scripts/data/load-data";
import { resolveCatalog } from "@scripts/data/resolve";
import { buildShards } from "@scripts/data/shard";
import { validateData } from "@scripts/data/validate";
import { describe, expect, it } from "vitest";

const NOW = "2026-09-29";
const ROUTE = "admission-routes/xx-test-route-xa-xb.yaml";
const base = loadData(path.join(process.cwd(), "tests/fixtures/data/valid-minimal"));

type Raw = Record<string, unknown>;

function withGuidance(source: string, extraSources: Raw = {}): LoadResult {
  const files = base.files.map((f) => {
    if (f.file !== ROUTE) return f;
    const raw = structuredClone(f.raw) as Raw;
    raw.guidance = [
      {
        id: "xx-test-aid",
        source,
        info_kind: "guidance",
        note: {
          fr: { text: "Aide test", status: "draft" },
          en: { text: "Test aid", status: "draft" },
        },
      },
    ];
    raw.sources = {
      ...(raw.sources as Raw),
      ...extraSources,
    };
    return { ...f, raw };
  });
  return { ...base, files };
}

const AID_SOURCE = { aid: { url: "https://example.org/aid", last_verified_at: "2026-09-02" } };

describe("route guidance in the data pipeline", () => {
  it("validates guidance whose source key exists, with no warning (the source counts as used)", () => {
    const result = validateData(withGuidance("aid", AID_SOURCE), { now: NOW });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("rejects guidance that names a source key the route does not declare", () => {
    const { errors } = validateData(withGuidance("missing"), { now: NOW });
    expect(errors).toContainEqual(
      expect.objectContaining({
        file: ROUTE,
        message: expect.stringContaining('unknown source key "missing"'),
      }),
    );
  });

  it("lists the guidance as a stable fact in the freshness report", () => {
    const { freshness } = validateData(withGuidance("aid", AID_SOURCE), { now: NOW });
    expect(freshness).toContainEqual(
      expect.objectContaining({ file: ROUTE, path: "guidance.xx-test-aid", class: "stable" }),
    );
  });

  it("resolves guidance to a text key and a stable guidance fact", () => {
    const { catalog } = validateData(withGuidance("aid", AID_SOURCE), { now: NOW });
    const route = resolveCatalog(catalog).routes[0];
    expect(route?.value.guidance).toEqual([
      {
        id: "xx-test-aid",
        note: "admission-routes/xx-test-route-xa-xb#guidance.xx-test-aid.note",
        fact: {
          source_url: "https://example.org/aid",
          info_kind: "guidance",
          last_verified_at: "2026-09-02",
          class: "stable",
        },
      },
    ]);
    expect([...(route?.texts.keys() ?? [])]).toContain(
      "admission-routes/xx-test-route-xa-xb#guidance.xx-test-aid.note",
    );
  });

  it("leaves a route without guidance exactly as before (no empty field in the snapshot)", () => {
    const { catalog } = validateData(base, { now: NOW });
    const route = resolveCatalog(catalog).routes[0];
    expect(route?.value).not.toHaveProperty("guidance");
    expect(canonicalJson(route?.value)).not.toContain("guidance");
  });

  it("ships the note in the routes text shards", () => {
    const { catalog } = validateData(withGuidance("aid", AID_SOURCE), { now: NOW });
    const shards = buildShards(resolveCatalog(catalog));
    const en = shards.find((s) => s.name === "text.en.routes.XA");
    expect(en?.shard.kind === "text" ? Object.keys(en.shard.entries) : []).toContain(
      "admission-routes/xx-test-route-xa-xb#guidance.xx-test-aid.note",
    );
  });
});
