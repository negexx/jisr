import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

import { promoteApproved } from "../../../scripts/import/promote";
import type { StagedRecord } from "../../../scripts/import/staging";
import {
  appendLedger,
  dedupeRecords,
  ledgerFile,
  parseCsv,
  pruneOrphanUnits,
  pruneStaged,
  READ_SOURCE,
  readReviewState,
  reviewCsv,
  reviewFile,
  stageFile,
  writeStaged,
} from "../../../scripts/import/staging";

let root: string;
let stagingDir: string;
let dataDir: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "jisr-import-"));
  stagingDir = path.join(root, "staging");
  dataDir = path.join(root, "data");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function channel(infoKind: string): StagedRecord {
  return {
    collection: "application-channels",
    id: "xx-test-channel",
    data: {
      slug: "xx-test-channel",
      name: "Test channel",
      country: "FR",
      kind: "national_portal",
      url: "https://example.org/",
      accountRequired: null,
      summary: { fr: { text: "Canal de test", status: "draft" } },
      source: "main",
      info_kind: infoKind,
      sources: { main: { url: "https://example.org/", last_verified_at: null } },
    },
    review: {
      kind: "application-channels",
      slug: "xx-test-channel",
      name: "Test channel",
      institution: "",
      city: "",
      field: "",
      confidence: "",
      officialUrl: "",
      todo: "",
    },
  };
}

const KEY = "application-channels/xx-test-channel";

describe("promoteApproved", () => {
  it("stamps the review date, drops _review and removes the staged file", async () => {
    await writeStaged([channel("official")], { overwrite: false, stagingDir, dataDir });
    const result = await promoteApproved({
      approved: new Set([KEY]),
      date: "2026-10-01",
      stagingDir,
      dataDir,
    });
    expect(result.promoted).toEqual([KEY]);
    const promoted = parse(
      readFileSync(path.join(dataDir, "application-channels", "xx-test-channel.yaml"), "utf8"),
    );
    expect(promoted.sources.main.last_verified_at).toBe("2026-10-01");
    expect(promoted._review).toBeUndefined();
    expect(existsSync(stageFile("application-channels", "xx-test-channel", stagingDir))).toBe(
      false,
    );
  });

  it("refuses a record that still carries the unread placeholder and keeps it staged", async () => {
    await writeStaged([channel(READ_SOURCE)], { overwrite: false, stagingDir, dataDir });
    const result = await promoteApproved({
      approved: new Set([KEY]),
      date: "2026-10-01",
      stagingDir,
      dataDir,
    });
    expect(result.promoted).toEqual([]);
    expect(result.skipped[0]?.reason).toMatch(/still invalid at info_kind/);
    expect(existsSync(stageFile("application-channels", "xx-test-channel", stagingDir))).toBe(true);
    expect(existsSync(path.join(dataDir, "application-channels"))).toBe(false);
  });

  it("rejects keys that could leave the data dir or are malformed", async () => {
    const result = await promoteApproved({
      approved: new Set(["../src/evil", "programs/a/b", "nonsense", "programs/Bad_Slug"]),
      date: "2026-10-01",
      stagingDir,
      dataDir,
    });
    expect(result.promoted).toEqual([]);
    expect(result.skipped).toHaveLength(4);
    expect(existsSync(path.join(root, "src"))).toBe(false);
  });

  it("never overwrites a record already in data/", async () => {
    await writeStaged([channel("official")], { overwrite: false, stagingDir, dataDir });
    const existing = path.join(dataDir, "application-channels", "xx-test-channel.yaml");
    await mkdir(path.dirname(existing), { recursive: true });
    await writeFile(existing, "keep: me\n");
    const result = await promoteApproved({
      approved: new Set([KEY]),
      date: "2026-10-01",
      stagingDir,
      dataDir,
    });
    expect(result.skipped[0]?.reason).toMatch(/already in/);
    expect(readFileSync(existing, "utf8")).toBe("keep: me\n");
  });
});

describe("writeStaged", () => {
  it("refuses text that was decoded with the wrong character set", async () => {
    const record = channel("official");
    record.data.name = "Hochschule \u0096 staatlich anerkannt";
    await expect(writeStaged([record], { overwrite: false, stagingDir, dataDir })).rejects.toThrow(
      /control characters/,
    );
  });

  it("keeps an existing staged file unless overwrite is asked, and reports rewrites", async () => {
    await writeStaged([channel("official")], { overwrite: false, stagingDir, dataDir });
    const again = await writeStaged([channel(READ_SOURCE)], {
      overwrite: false,
      stagingDir,
      dataDir,
    });
    expect(again).toMatchObject({ written: 0, skipped: 1 });
    const forced = await writeStaged([channel(READ_SOURCE)], {
      overwrite: true,
      stagingDir,
      dataDir,
    });
    expect([...forced.rewritten]).toEqual([KEY]);
  });

  it("does not re-stage a record that is already in data/", async () => {
    const existing = path.join(dataDir, "application-channels", "xx-test-channel.yaml");
    await mkdir(path.dirname(existing), { recursive: true });
    await writeFile(existing, "x: 1\n");
    const result = await writeStaged([channel("official")], {
      overwrite: true,
      stagingDir,
      dataDir,
    });
    expect(result).toMatchObject({ written: 0, inData: 1 });
  });
});

describe("review sheet", () => {
  it("reads approvals from a sheet saved by a spreadsheet (BOM, ; separator, no final newline)", () => {
    const text = "﻿approved;kind;slug;name\r\ny;programs;p-1;Licence\r\n;programs;p-2;BUT";
    const rows = parseCsv(text);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ approved: "y", slug: "p-1" });
    expect(rows[1]).toMatchObject({ approved: "", slug: "p-2", name: "BUT" });
  });

  it("warns when the approved column is missing", async () => {
    await mkdir(stagingDir, { recursive: true });
    await writeFile(reviewFile(stagingDir), "kind,slug\nprograms,p-1\n");
    const state = await readReviewState(stagingDir);
    expect(state.warning).toMatch(/no "approved" column/);
    expect(state.approved.size).toBe(0);
  });

  it("round-trips approvals through reviewCsv", async () => {
    await mkdir(stagingDir, { recursive: true });
    const row = channel("official").review;
    await writeFile(reviewFile(stagingDir), reviewCsv([row], new Set([KEY])));
    expect([...(await readReviewState(stagingDir)).approved]).toEqual([KEY]);
  });
});

describe("stable source ids", () => {
  const withSource = (slug: string, sourceId: string, infoKind = "official") => {
    const record = channel(infoKind);
    record.id = slug;
    record.data.slug = slug;
    record.review.slug = slug;
    record.sourceId = sourceId;
    return record;
  };

  it("refuses two records of one run that share an id or a source id", async () => {
    await expect(
      writeStaged([withSource("a", "s:1"), withSource("a", "s:2")], {
        overwrite: false,
        stagingDir,
        dataDir,
      }),
    ).rejects.toThrow(/share the id/);
    await expect(
      writeStaged([withSource("a", "s:1"), withSource("b", "s:1")], {
        overwrite: false,
        stagingDir,
        dataDir,
      }),
    ).rejects.toThrow(/share the source id/);
  });

  it("stores the source id in the staged file", async () => {
    await writeStaged([withSource("xx-test-channel", "ba:73208836")], {
      overwrite: false,
      stagingDir,
      dataDir,
    });
    const text = readFileSync(
      stageFile("application-channels", "xx-test-channel", stagingDir),
      "utf8",
    );
    expect(text).toMatch(/^ {2}sourceId: ba:73208836$/m);
  });

  it("removes the superseded unapproved file when a record's slug changed", async () => {
    await writeStaged([withSource("old-slug", "ba:1")], { overwrite: false, stagingDir, dataDir });
    const result = await writeStaged([withSource("new-slug", "ba:1")], {
      overwrite: false,
      stagingDir,
      dataDir,
    });
    expect(result.removedStale).toEqual(["application-channels/old-slug"]);
    expect(existsSync(stageFile("application-channels", "old-slug", stagingDir))).toBe(false);
    expect(existsSync(stageFile("application-channels", "new-slug", stagingDir))).toBe(true);
  });

  it("keeps an approved superseded file and reports it", async () => {
    await writeStaged([withSource("old-slug", "ba:1")], { overwrite: false, stagingDir, dataDir });
    const result = await writeStaged([withSource("new-slug", "ba:1")], {
      overwrite: false,
      stagingDir,
      dataDir,
      approved: new Set(["application-channels/old-slug"]),
    });
    expect(result.keptApprovedStale).toEqual(["application-channels/old-slug"]);
    expect(existsSync(stageFile("application-channels", "old-slug", stagingDir))).toBe(true);
  });

  it("does not re-stage a promoted record whose slug changed since", async () => {
    await appendLedger(
      [
        {
          collection: "application-channels",
          sourceId: "ba:1",
          slug: "promoted-slug",
          date: "2026-10-01",
        },
      ],
      stagingDir,
    );
    const result = await writeStaged([withSource("renamed-slug", "ba:1")], {
      overwrite: false,
      stagingDir,
      dataDir,
    });
    expect(result).toMatchObject({ written: 0, inData: 1 });
    expect(existsSync(stageFile("application-channels", "renamed-slug", stagingDir))).toBe(false);
  });

  it("writes a ledger row when a record is promoted", async () => {
    await writeStaged([withSource("xx-test-channel", "ba:42")], {
      overwrite: false,
      stagingDir,
      dataDir,
    });
    await promoteApproved({ approved: new Set([KEY]), date: "2026-10-01", stagingDir, dataDir });
    const ledger = parseCsv(readFileSync(ledgerFile(stagingDir), "utf8"));
    expect(ledger).toEqual([
      {
        collection: "application-channels",
        sourceId: "ba:42",
        slug: "xx-test-channel",
        date: "2026-10-01",
        level: "human",
        batch: "",
      },
    ]);
  });
});

describe("pruneStaged", () => {
  const owned = (slug: string, sourceId: string) => {
    const record = channel("official");
    record.id = slug;
    record.data.slug = slug;
    record.review.slug = slug;
    record.sourceId = sourceId;
    return record;
  };

  it("removes unapproved records its source no longer produces and keeps everything else", async () => {
    await writeStaged(
      [
        owned("gone", "daad:1"),
        owned("still-there", "daad:2"),
        owned("other-source", "ba:9"),
        owned("approved-gone", "daad:3"),
      ],
      { overwrite: false, stagingDir, dataDir },
    );
    const result = await pruneStaged({
      owns: (id) => id.startsWith("daad:"),
      produced: new Set(["application-channels|daad:2"]),
      approved: new Set(["application-channels/approved-gone"]),
      stagingDir,
    });
    expect(result.removed).toEqual(["application-channels/gone"]);
    expect(result.keptApproved).toEqual(["application-channels/approved-gone"]);
    const exists = (slug: string) =>
      existsSync(stageFile("application-channels", slug, stagingDir));
    expect([
      exists("gone"),
      exists("still-there"),
      exists("other-source"),
      exists("approved-gone"),
    ]).toEqual([false, true, true, true]);
  });
});

describe("safeguards of pruning and dedupe", () => {
  const rec = (
    collection: string,
    slug: string,
    sourceId: string,
    extra: Record<string, unknown> = {},
  ) => {
    const r = channel("official");
    r.collection = collection;
    r.id = slug;
    r.data = { ...r.data, slug, ...extra };
    r.review = { ...r.review, kind: collection, slug };
    r.sourceId = sourceId;
    return r;
  };

  it("refuses to prune an implausibly large share, so an empty response cannot wipe the queue", async () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      rec("application-channels", `c-${i}`, `daad:${i}`),
    );
    await writeStaged(many, { overwrite: false, stagingDir, dataDir });
    await expect(
      pruneStaged({
        owns: (id) => id.startsWith("daad:"),
        produced: new Set(),
        approved: new Set(),
        stagingDir,
      }),
    ).rejects.toThrow(/refusing to prune 60 of 60/);
    expect(existsSync(stageFile("application-channels", "c-0", stagingDir))).toBe(true);
  });

  it("removes only unreferenced, unapproved campus units", async () => {
    await writeStaged(
      [
        rec("institutions", "unit-used", "hrk:1@town"),
        rec("institutions", "unit-orphan", "hrk:2@town"),
        rec("institutions", "unit-approved", "hrk:3@town"),
        rec("institutions", "main-inst", "hrk:4"),
        { ...rec("programs", "prog-1", "daad:1", { institution: "unit-used" }) },
      ],
      { overwrite: false, stagingDir, dataDir },
    );
    const removed = await pruneOrphanUnits({
      approved: new Set(["institutions/unit-approved"]),
      stagingDir,
    });
    expect(removed).toEqual(["institutions/unit-orphan"]);
    expect(existsSync(stageFile("institutions", "main-inst", stagingDir))).toBe(true);
  });

  it("keeps the first of two records with the same id and source id, and rejects a collision", () => {
    const a = rec("institutions", "same", "hrk:1@town");
    const b = rec("institutions", "same", "hrk:1@town");
    expect(dedupeRecords([a, b])).toHaveLength(1);
    expect(() => dedupeRecords([a, rec("institutions", "same", "daad-academy:x")])).toThrow(
      /different source ids/,
    );
  });
});
