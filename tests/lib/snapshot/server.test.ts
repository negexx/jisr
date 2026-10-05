import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Manifest, shardNames } from "@/data-schema/snapshot";
import { scholarshipsForProgram } from "@/domain/scholarships";
import { SnapshotError } from "@/lib/snapshot/errors";
import { loadProgramPageData, programStaticParams, readBuildSnapshot } from "@/lib/snapshot/server";

import { E2E_PROFILE, E2E_SCHOLARSHIP_SLUGS, E2E_SLUGS } from "../../fixtures/e2e/profiles";
import {
  buildSnapshot,
  buildVariant,
  copySnapshot,
  E2E_DATA_DIR,
  EMPTY_DATA_DIR,
  readManifest,
  removeTempDirs,
} from "./fixture";

let base = "";
let empty = "";
let manifest: Manifest;

beforeAll(() => {
  base = buildSnapshot(E2E_DATA_DIR);
  empty = buildSnapshot(EMPTY_DATA_DIR);
  manifest = readManifest(base);
}, 180_000);

afterAll(removeTempDirs);

describe("readBuildSnapshot", () => {
  it("reads and validates the manifest, memoised per directory", async () => {
    const snapshot = await readBuildSnapshot(base);
    expect(snapshot.manifest).toEqual(manifest);
    expect(await readBuildSnapshot(base)).toBe(snapshot);
  });

  it("verifies shards when read", async () => {
    const snapshot = await readBuildSnapshot(base);
    const core = await snapshot.shard("core");
    expect(core.kind).toBe("core");
  });

  it("rejects an invalid manifest as a format error", async () => {
    const dir = copySnapshot(base);
    writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify({ ...manifest, formatVersion: 2 }),
    );
    await expect(readBuildSnapshot(dir)).rejects.toMatchObject({ kind: "format" });
  });
});

describe("programStaticParams", () => {
  it("lists every fixture program slug, sorted and unique", async () => {
    expect(await programStaticParams(base)).toEqual(
      Object.values(E2E_SLUGS)
        .sort()
        .map((slug) => ({ slug })),
    );
  });

  it("returns [] for an empty catalogue", async () => {
    expect(await programStaticParams(empty)).toEqual([]);
  });
});

describe("loadProgramPageData", () => {
  it("returns the static data of a known program", async () => {
    const data = await loadProgramPageData(E2E_SLUGS.ok, "en", base);
    if (data === null) throw new Error("expected data");
    expect(data.snapshotVersion).toBe(manifest.snapshotVersion);
    expect(data.program.slug).toBe(E2E_SLUGS.ok);
    expect(data.institution?.slug).toBe("xx-test-inst-pub-b");
    expect(data.applicationChannel?.slug).toBe("xx-test-channel-portal");
    expect(data.core.kind).toBe("core");
    expect(data.costProfiles.map((p) => p.slug)).toEqual(["xx-test-costs-xb"]);
    // No nationality filter on the server: the XZ-only scholarship is still listed.
    // Sorted by slug, the order domain scholarshipsForProgram returns, so server and client agree.
    expect(data.scholarships.map((s) => s.slug)).toEqual(
      Object.values(E2E_SCHOLARSHIP_SLUGS).sort(),
    );
    expect(data.text(`programs/${E2E_SLUGS.ok}#summary`)).toEqual({
      text: "Complete matching test programme",
      note: "none",
    });
  });

  describe("route guidance", () => {
    const withGuidance = () =>
      buildVariant([
        {
          file: "admission-routes/xx-test-route-xa-xb.yaml",
          from: "applicationChannels: [xx-test-channel-portal, xx-test-channel-direct]",
          to: [
            "guidance:",
            "  - id: xx-test-aid",
            "    source: aid",
            "    info_kind: guidance",
            "    note:",
            "      fr: { text: Aide test, status: draft }",
            "      en: { text: Test aid, status: draft }",
            "applicationChannels: [xx-test-channel-portal, xx-test-channel-direct]",
          ].join("\n"),
        },
        {
          file: "admission-routes/xx-test-route-xa-xb.yaml",
          from: "sources:\n",
          to: "sources:\n  aid:\n    url: https://example.org/aid\n    last_verified_at: 2026-09-02\n",
        },
      ]);

    it("lists the guidance of every route into the programme's country, with its text and fact", async () => {
      const dir = await withGuidance();
      const data = await loadProgramPageData(E2E_SLUGS.ok, "en", dir);
      expect(data?.routeGuidance).toHaveLength(1);
      const [item] = data?.routeGuidance ?? [];
      expect(item).toMatchObject({
        origin: "XA",
        id: "xx-test-aid",
        fact: { info_kind: "guidance", source_url: "https://example.org/aid", class: "stable" },
      });
      expect(data?.text(item?.note ?? "")?.text).toBe("Test aid");
      const french = await loadProgramPageData(E2E_SLUGS.ok, "fr", dir);
      expect(french?.text(item?.note ?? "")?.text).toBe("Aide test");
    }, 180_000);

    it("merges the guidance of several origins, ordered by origin then id, each with its own text", async () => {
      const second = [
        "slug: xx-test-route-xz-xb",
        "origin: XZ",
        "credentialType: xx-test-cred",
        "destination: XB",
        "level: bachelor",
        "outcome: check",
        "conditions: []",
        "guidance:",
        "  - id: xx-test-aid-z",
        "    source: aid",
        "    info_kind: guidance",
        "    note:",
        "      fr: { text: Aide Z, status: draft }",
        "      en: { text: Aid Z, status: draft }",
        "applicationChannels: [xx-test-channel-portal]",
        "source: aid",
        "info_kind: official",
        "sources:",
        "  aid:",
        "    url: https://example.org/aid-z",
        "    last_verified_at: 2026-09-03",
        "",
      ].join("\n");
      const dir = buildVariant(
        [
          {
            file: "admission-routes/xx-test-route-xa-xb.yaml",
            from: "applicationChannels: [xx-test-channel-portal, xx-test-channel-direct]",
            to: [
              "guidance:",
              "  - id: xx-test-aid",
              "    source: aid",
              "    info_kind: guidance",
              "    note:",
              "      fr: { text: Aide test, status: draft }",
              "      en: { text: Test aid, status: draft }",
              "applicationChannels: [xx-test-channel-portal, xx-test-channel-direct]",
            ].join("\n"),
          },
          {
            file: "admission-routes/xx-test-route-xa-xb.yaml",
            from: "sources:\n",
            to: "sources:\n  aid:\n    url: https://example.org/aid\n    last_verified_at: 2026-09-02\n",
          },
        ],
        [{ file: "admission-routes/xx-test-route-xz-xb.yaml", content: second }],
      );
      const data = await loadProgramPageData(E2E_SLUGS.ok, "en", dir);
      expect(data?.routeGuidance.map((g) => `${g.origin}/${g.id}`)).toEqual([
        "XA/xx-test-aid",
        "XZ/xx-test-aid-z",
      ]);
      expect(data?.routeGuidance.map((g) => data.text(g.note)?.text)).toEqual([
        "Test aid",
        "Aid Z",
      ]);
    }, 180_000);

    it("has no guidance when no route into the country carries any", async () => {
      expect((await loadProgramPageData(E2E_SLUGS.ok, "en", base))?.routeGuidance).toEqual([]);
    });

    it("ignores guidance of routes into another country", async () => {
      const dir = await withGuidance();
      const data = await loadProgramPageData(E2E_SLUGS.foundation, "en", dir);
      expect(data?.program.country).not.toBe("XB");
      expect(data?.routeGuidance).toEqual([]);
    }, 180_000);
  });

  it("honours a scholarship's institutions list, as domain scholarshipsForProgram does", async () => {
    const restrict = (institution: string) =>
      buildVariant([
        {
          file: "scholarships/xx-test-schol-open.yaml",
          from: "eligibleNationalities: []",
          to: `eligibleNationalities: []\ninstitutions: [${institution}]`,
        },
      ]);
    const slugsFor = async (dir: string) =>
      (await loadProgramPageData(E2E_SLUGS.ok, "en", dir))?.scholarships.map((s) => s.slug);

    expect(await slugsFor(restrict("xx-test-inst-pub-c"))).not.toContain(
      E2E_SCHOLARSHIP_SLUGS.open,
    );
    expect(await slugsFor(restrict("xx-test-inst-pub-b"))).toContain(E2E_SCHOLARSHIP_SLUGS.open);
  }, 180_000);

  // The static page and the client's personal box share one predicate (appliesToProgram): for a
  // student whose nationality passes, both list the same scholarships in the same order.
  describe("parity with domain scholarshipsForProgram", () => {
    const parity = async (dir: string) => {
      const snapshot = await readBuildSnapshot(dir);
      let compared = 0;
      for (const slug of Object.values(E2E_SLUGS)) {
        const data = await loadProgramPageData(slug, "en", dir);
        if (data === null) continue;
        const name = shardNames.scholarships(data.program.country);
        const shard =
          snapshot.manifest.shards[name] === undefined ? null : await snapshot.shard(name);
        const all = shard?.kind === "scholarships" ? shard.scholarships : [];
        for (const nationality of ["XA", "XZ", "XQ"]) {
          const passes = (s: { eligibleNationalities: readonly string[] }) =>
            s.eligibleNationalities.length === 0 || s.eligibleNationalities.includes(nationality);
          const domain = scholarshipsForProgram({ ...E2E_PROFILE, nationality }, data.program, all);
          expect(data.scholarships.filter(passes).map((s) => s.slug)).toEqual(
            domain.map((s) => s.slug),
          );
          compared += 1;
        }
      }
      expect(compared).toBeGreaterThan(0);
    };

    it("agrees for explicit links, open scholarships and a field-restricted one", async () => {
      await parity(base);
      const data = await loadProgramPageData(E2E_SLUGS.ok, "en", base);
      // linked (xa, xz) and fields-matched (open, xa) cases are all present in this programme
      expect(data?.scholarships.map((s) => s.slug)).toEqual(
        Object.values(E2E_SCHOLARSHIP_SLUGS).sort(),
      );
    });

    it("agrees when fields exclude the programme", async () => {
      await parity(
        buildVariant([
          {
            file: "scholarships/xx-test-schol-open.yaml",
            from: "fields: []",
            to: "fields: [xx-test-field-eng]",
          },
        ]),
      );
    }, 180_000);

    it("agrees when institutions exclude or include the programme's institution", async () => {
      for (const institution of ["xx-test-inst-pub-b", "xx-test-inst-pub-c"])
        await parity(
          buildVariant([
            {
              file: "scholarships/xx-test-schol-open.yaml",
              from: "eligibleNationalities: []",
              to: `eligibleNationalities: []
institutions: [${institution}]`,
            },
          ]),
        );
    }, 240_000);
  });

  it("looks up text in the requested locale", async () => {
    const data = await loadProgramPageData(E2E_SLUGS.frOnly, "ar", base);
    expect(data?.text(`programs/${E2E_SLUGS.frOnly}#summary`)?.note).toBe("french_fallback");
  });

  it("returns null for an unknown slug", async () => {
    expect(await loadProgramPageData("xx-test-prog-unknown", "fr", base)).toBeNull();
    expect(await loadProgramPageData(E2E_SLUGS.ok, "fr", empty)).toBeNull();
  });

  it("throws an integrity error on a tampered shard", async () => {
    const dir = copySnapshot(base);
    const entry = manifest.shards["programs.XB.xx-test-field-cs"];
    if (entry === undefined) throw new Error("fixture shard missing");
    const file = path.join(dir, entry.file);
    const source = readFileSync(file, "utf8");
    writeFileSync(file, source.replace("Programme OK", "Programme OX"));
    const error = await loadProgramPageData(E2E_SLUGS.ok, "fr", dir).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SnapshotError);
    expect(error).toMatchObject({ kind: "integrity" });
  });
});
