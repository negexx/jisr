import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type AuditRow,
  auditCsv,
  batchStatuses,
  drawBatch,
  drawSample,
  findPrepared,
  parseAudit,
  sampleSheet,
  sampleSize,
} from "../../../scripts/import/audit";
import { promoteApproved } from "../../../scripts/import/promote";
import { ledgerFile, parseCsv, stageFile, toYaml } from "../../../scripts/import/staging";

const keys = (n: number) => Array.from({ length: n }, (_, i) => `programs/p-${i}`);

describe("audit sample", () => {
  it("is 10% with a floor of 10, and never more than the batch", () => {
    expect(sampleSize(200)).toBe(20);
    expect(sampleSize(60)).toBe(10);
    expect(sampleSize(7)).toBe(7);
    expect(sampleSize(101)).toBe(11);
  });
  it("is deterministic per seed and differs between seeds", () => {
    const a = drawSample(keys(100), "aa11");
    expect([...a].sort()).toEqual([...drawSample(keys(100), "aa11")].sort());
    expect([...a].sort()).not.toEqual([...drawSample(keys(100), "bb22")].sort());
    expect(a.size).toBe(10);
  });
  it("only draws records not yet in a batch", () => {
    const first = drawBatch({ preparedKeys: keys(30), existing: [], seed: "s1", batchIndex: 1 });
    expect(first).toHaveLength(30);
    const second = drawBatch({
      preparedKeys: keys(35),
      existing: first,
      seed: "s2",
      batchIndex: 2,
    });
    expect(second.map((r) => r.key)).toEqual(keys(35).slice(30).sort());
    expect(second.every((r) => r.batch === "b2-s2")).toBe(true);
    expect(
      drawBatch({
        preparedKeys: keys(35),
        existing: [...first, ...second],
        seed: "s3",
        batchIndex: 3,
      }),
    ).toEqual([]);
  });
  it("round-trips through csv", () => {
    const rows = drawBatch({ preparedKeys: keys(12), existing: [], seed: "ab12", batchIndex: 1 });
    expect(parseAudit(auditCsv(rows))).toEqual(rows);
  });
});

describe("batchStatuses", () => {
  const row = (over: Partial<AuditRow>): AuditRow => ({
    key: "programs/a",
    batch: "b1",
    inSample: true,
    audited: "",
    outcome: "",
    notes: "",
    ...over,
  });
  it("passes only when every sampled record is confirmed ok and none is wrong", () => {
    expect(batchStatuses([row({}), row({ key: "programs/b", inSample: false })])[0]).toMatchObject({
      pass: false,
      pending: 1,
    });
    expect(
      batchStatuses([
        row({ audited: "y", outcome: "ok" }),
        row({ key: "programs/b", inSample: false }),
      ])[0],
    ).toMatchObject({ pass: true, confirmed: 1 });
    expect(
      batchStatuses([
        row({ audited: "y", outcome: "ok" }),
        row({ key: "programs/c", audited: "y", outcome: "wrong" }),
      ])[0],
    ).toMatchObject({ pass: false, wrong: 1 });
  });
  it("needs a read mark, not just an outcome, and never passes an empty sample", () => {
    expect(batchStatuses([row({ outcome: "ok" })])[0]?.pass).toBe(false);
    expect(batchStatuses([row({ inSample: false })])[0]?.pass).toBe(false);
  });
});

describe("promotion gate for assistant-prepared records", () => {
  let root: string;
  let stagingDir: string;
  let dataDir: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "jisr-audit-"));
    stagingDir = path.join(root, "staging");
    dataDir = path.join(root, "data");
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  async function stageChannel(slug: string, preparedBy: boolean) {
    const file = stageFile("application-channels", slug, stagingDir);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(
      file,
      toYaml({
        slug,
        name: "Test channel",
        country: "FR",
        kind: "national_portal",
        url: "https://example.org/",
        accountRequired: null,
        summary: { fr: { text: "Canal de test", status: "draft" } },
        source: "page",
        info_kind: "official",
        sources: { page: { url: "https://example.org/", last_verified_at: null } },
        _review: {
          sourceId: `x:${slug}`,
          ...(preparedBy ? { preparedBy: "assistant", preparedAt: "2026-10-02" } : {}),
        },
      }),
    );
  }
  const audit = (batchOk: boolean, inSample: boolean, key: string): AuditRow[] => [
    {
      key,
      batch: "b1-ab",
      inSample,
      audited: batchOk ? "y" : "",
      outcome: batchOk ? "ok" : "",
      notes: "",
    },
    {
      key: "application-channels/sampled",
      batch: "b1-ab",
      inSample: true,
      audited: batchOk ? "y" : "",
      outcome: batchOk ? "ok" : "",
      notes: "",
    },
  ];

  it("blocks an assistant-prepared record whose audit sample has not passed", async () => {
    await stageChannel("a", true);
    const result = await promoteApproved({
      approved: new Set(["application-channels/a"]),
      date: "2026-10-02",
      stagingDir,
      dataDir,
      audit: audit(false, false, "application-channels/a"),
    });
    expect(result.promoted).toEqual([]);
    expect(result.skipped[0]?.reason).toMatch(/audit sample has not passed/);
    expect(existsSync(stageFile("application-channels", "a", stagingDir))).toBe(true);
  });

  it("blocks an assistant-prepared record that is in no audit batch at all", async () => {
    await stageChannel("a", true);
    const result = await promoteApproved({
      approved: new Set(["application-channels/a"]),
      date: "2026-10-02",
      stagingDir,
      dataDir,
      audit: [],
    });
    expect(result.promoted).toEqual([]);
  });

  it("promotes it once the sample passed, recording the audited-sample level, and a sampled one as human", async () => {
    await stageChannel("a", true);
    await stageChannel("sampled", true);
    const rows = audit(true, false, "application-channels/a");
    const result = await promoteApproved({
      approved: new Set(["application-channels/a", "application-channels/sampled"]),
      date: "2026-10-02",
      stagingDir,
      dataDir,
      audit: rows,
    });
    expect(result.promoted.sort()).toEqual([
      "application-channels/a",
      "application-channels/sampled",
    ]);
    const ledger = parseCsv(readFileSync(ledgerFile(stagingDir), "utf8"));
    expect(Object.fromEntries(ledger.map((r) => [r.slug, r.level]))).toEqual({
      a: "audited-sample",
      sampled: "human",
    });
    expect(ledger.every((r) => r.batch === "b1-ab")).toBe(true);
  });

  it("records every record of a batch whose sample the owner waived as owner-waived, never as read", async () => {
    await stageChannel("a", true);
    await stageChannel("sampled", true);
    const rows = audit(true, false, "application-channels/a").map((r) =>
      r.inSample ? { ...r, outcome: "waived" } : r,
    );
    expect(batchStatuses(rows)[0]).toMatchObject({ waived: 1, confirmed: 0, pass: true });
    await promoteApproved({
      approved: new Set(["application-channels/a", "application-channels/sampled"]),
      date: "2026-10-02",
      stagingDir,
      dataDir,
      audit: rows,
    });
    const ledger = parseCsv(readFileSync(ledgerFile(stagingDir), "utf8"));
    expect(ledger.map((r) => r.level)).toEqual(["owner-waived", "owner-waived"]);
  });

  it("replaces a promoted record only with a staged revision, the flag and a passed audit", async () => {
    await stageChannel("a", true);
    const staged = stageFile("application-channels", "a", stagingDir);
    const text = readFileSync(staged, "utf8").replace("sourceId:", "revises: true\n  sourceId:");
    await writeFile(staged, text);
    await mkdir(path.join(dataDir, "application-channels"), { recursive: true });
    const target = path.join(dataDir, "application-channels", "a.yaml");
    await writeFile(target, "old: record\n");
    const base = {
      approved: new Set(["application-channels/a"]),
      date: "2026-10-02",
      stagingDir,
      dataDir,
      audit: audit(true, true, "application-channels/a"),
    };
    const refused = await promoteApproved(base);
    expect(refused.skipped[0]?.reason).toMatch(/never overwritten/);
    expect(readFileSync(target, "utf8")).toBe("old: record\n");
    const done = await promoteApproved({ ...base, replaceRevisions: true });
    expect(done.promoted).toEqual(["application-channels/a"]);
    expect(readFileSync(target, "utf8")).toContain("Test channel");
  });

  it("never replaces a record with a staged file that is not a revision", async () => {
    await stageChannel("a", true);
    await mkdir(path.join(dataDir, "application-channels"), { recursive: true });
    const target = path.join(dataDir, "application-channels", "a.yaml");
    await writeFile(target, "old: record\n");
    const result = await promoteApproved({
      approved: new Set(["application-channels/a"]),
      date: "2026-10-02",
      stagingDir,
      dataDir,
      audit: audit(true, true, "application-channels/a"),
      replaceRevisions: true,
    });
    expect(result.promoted).toEqual([]);
    expect(readFileSync(target, "utf8")).toBe("old: record\n");
  });

  it("leaves records the assistant did not prepare to the normal approval path", async () => {
    await stageChannel("manual", false);
    const result = await promoteApproved({
      approved: new Set(["application-channels/manual"]),
      date: "2026-10-02",
      stagingDir,
      dataDir,
    });
    expect(result.promoted).toEqual(["application-channels/manual"]);
    expect(parseCsv(readFileSync(ledgerFile(stagingDir), "utf8"))[0]).toMatchObject({
      level: "human",
      batch: "",
    });
  });

  it("finds prepared records by their _review marker", async () => {
    await stageChannel("a", true);
    await stageChannel("manual", false);
    expect(await findPrepared(stagingDir)).toEqual(["application-channels/a"]);
  });
});

describe("sampleSheet", () => {
  it("shows each claimed value with its quote, link and the preparer's caveats", () => {
    const sheet = sampleSheet([
      {
        key: "programs/p",
        row: {
          key: "programs/p",
          batch: "b1",
          inSample: true,
          audited: "",
          outcome: "",
          notes: "",
        },
        record: {
          name: "Applied CS",
          durationYears: { value: 3, source: "programme", info_kind: "official" },
          tuition: { value: null, source: "programme", info_kind: "official" },
          _review: {
            institution: "Uni X",
            evidence: [
              { fact: "durationYears", url: "https://u.example/p", quote: "six semesters" },
            ],
            notes: "tuition is last year's tariff",
            rejected: ["intakes: the quote does not state the year 2027"],
          },
        },
      },
    ]);
    expect(sheet).toContain("**durationYears**: `3`");
    expect(sheet).toContain('"six semesters" — https://u.example/p');
    expect(sheet).toContain("tuition is last year's tariff");
    expect(sheet).toContain("intakes: the quote does not state the year 2027");
    expect(sheet).not.toContain("**tuition**");
  });
});

describe("sampleSheet documents", () => {
  it("shows the documents with their quotes", () => {
    const sheet = sampleSheet([
      {
        key: "programs/p",
        row: {
          key: "programs/p",
          batch: "b1",
          inSample: true,
          audited: "",
          outcome: "",
          notes: "",
        },
        record: {
          name: "Applied CS",
          documents: {
            value: [{ slug: "cv", name: { fr: { text: "CV", status: "draft" } } }],
            source: "programme",
            info_kind: "official",
          },
          _review: {
            evidence: [
              { fact: "documents", url: "https://u.example/p", quote: "a CV and a passport" },
            ],
          },
        },
      },
    ]);
    expect(sheet).toContain("**documents**");
    expect(sheet).toContain('"a CV and a passport" — https://u.example/p');
  });
});
