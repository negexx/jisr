import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

import { promoteApproved } from "../../../scripts/import/promote";
import type { StagedRecord } from "../../../scripts/import/staging";
import {
  parseCsv,
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
