import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { newestRun, parseArgs, renderSummary, runStage } from "../../../scripts/import/it-stage";
import type { Ateneo } from "../../../scripts/import/sources/mur";

const atenei: Ateneo[] = [
  {
    code: "0201",
    fullName: "Università degli studi di Genova",
    shortName: "Genova",
    statale: true,
    city: "GENOVA",
    region: "Liguria",
  },
];

const candidate = (over = {}) => ({
  portalId: 1625723,
  university: "Università degli Studi di GENOVA",
  name: "Computer Engineering",
  classCode: "L-8",
  classCodes: ["L-8"],
  field: "engineering",
  confidence: "high",
  durationYears: 3,
  url: "https://corsi.unige.it/corsi/12133",
  academicYear: "2026/2027",
  delivery: "conventional",
  ...over,
});

async function fixture(candidates: object = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "it-stage-"));
  const runDir = path.join(root, "run");
  await mkdir(runDir);
  await writeFile(
    path.join(runDir, "candidates.json"),
    JSON.stringify({
      meta: { fetchedAt: "2026-10-08T09:00:00.000Z" },
      newUniversities: [
        {
          university: "Università degli Studi di GENOVA",
          programmes: [candidate()],
          possiblyOurs: [],
        },
      ],
      newProgrammes: [],
      possible: [],
      ...candidates,
    }),
  );
  const dataDir = path.join(root, "data");
  await mkdir(path.join(dataDir, "programs"), { recursive: true });
  await mkdir(path.join(dataDir, "institutions"), { recursive: true });
  const stagingDir = path.join(root, "staging");
  return { root, runDir, dataDir, stagingDir };
}

describe("runStage", () => {
  it("stages the selected candidates and the review sheet, and never overwrites", async () => {
    const f = await fixture();
    const base = {
      ids: [1625723],
      runDir: f.runDir,
      atenei,
      websites: new Map<string, string>(),
      dataDir: f.dataDir,
      stagingDir: f.stagingDir,
      dryRun: false,
    };
    const first = await runStage(base);
    expect(first.staged).toEqual(["it-genova-genova-computer-engineering-l8"]);
    expect(first.written).toBe(2); // the institution and the programme
    const yaml = await readFile(
      path.join(f.stagingDir, "programs", "it-genova-genova-computer-engineering-l8.yaml"),
      "utf8",
    );
    expect(yaml).toContain("officialUrl: https://corsi.unige.it/corsi/12133");
    expect(yaml).toContain("TODO_read_source");
    expect(yaml).toContain("fetched 2026-10-08");
    const sheet = await readFile(path.join(f.stagingDir, "REVIEW.csv"), "utf8");
    expect(sheet).toContain("it-genova-genova-computer-engineering-l8");
    const second = await runStage(base);
    expect(second.written).toBe(0);
    expect(second.skipped).toBe(2);
  });

  it("reports the university it resolved for every selected candidate", async () => {
    const f = await fixture();
    const result = await runStage({
      ids: [1625723],
      runDir: f.runDir,
      atenei,
      websites: new Map(),
      dataDir: f.dataDir,
      stagingDir: f.stagingDir,
      dryRun: true,
    });
    expect(result.resolutions).toEqual([
      {
        portalId: 1625723,
        portal: "Università degli Studi di GENOVA",
        mur: "Università degli studi di Genova",
      },
    ]);
  });

  it("selects candidates from newProgrammes too", async () => {
    const f = await fixture({
      newUniversities: [],
      newProgrammes: [candidate({ portalId: 5, name: "Physics Engineering" })],
    });
    const result = await runStage({
      ids: [5],
      runDir: f.runDir,
      atenei,
      websites: new Map(),
      dataDir: f.dataDir,
      stagingDir: f.stagingDir,
      dryRun: true,
    });
    expect(result.staged).toEqual(["it-genova-genova-physics-engineering-l8"]);
  });

  it("writes nothing on a dry run", async () => {
    const f = await fixture();
    const result = await runStage({
      ids: [1625723],
      runDir: f.runDir,
      atenei,
      websites: new Map(),
      dataDir: f.dataDir,
      stagingDir: f.stagingDir,
      dryRun: true,
    });
    expect(result.staged).toHaveLength(1);
    await expect(readFile(path.join(f.stagingDir, "REVIEW.csv"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(f.stagingDir, "programs", "x.yaml"), "utf8")).rejects.toThrow();
  });

  it("stops on an id that is not a candidate, and reports a refused university", async () => {
    const f = await fixture();
    await expect(
      runStage({
        ids: [1],
        runDir: f.runDir,
        atenei,
        websites: new Map(),
        dataDir: f.dataDir,
        stagingDir: f.stagingDir,
        dryRun: false,
      }),
    ).rejects.toThrow(/not a candidate.*1/);
    const noAteneo = await runStage({
      ids: [1625723],
      runDir: f.runDir,
      atenei: [],
      websites: new Map(),
      dataDir: f.dataDir,
      stagingDir: f.stagingDir,
      dryRun: false,
    });
    expect(noAteneo.staged).toEqual([]);
    expect(noAteneo.refused).toHaveLength(1);
    expect(noAteneo.resolutions).toEqual([
      { portalId: 1625723, portal: "Università degli Studi di GENOVA", mur: null },
    ]);
  });

  it("writes nothing at all when any selected candidate is refused", async () => {
    const f = await fixture({
      newProgrammes: [candidate({ portalId: 9, university: "Università di Trento" })],
    });
    const result = await runStage({
      ids: [1625723, 9],
      runDir: f.runDir,
      atenei,
      websites: new Map(),
      dataDir: f.dataDir,
      stagingDir: f.stagingDir,
      dryRun: false,
    });
    expect(result.refused.map((r) => r.portalId)).toEqual([9]);
    expect(result.staged).toEqual([]);
    expect(result.written).toBe(0);
    await expect(readFile(path.join(f.stagingDir, "REVIEW.csv"), "utf8")).rejects.toThrow();
  });

  it("rejects a candidates.json of another shape", async () => {
    const f = await fixture();
    await writeFile(
      path.join(f.runDir, "candidates.json"),
      JSON.stringify({ newProgrammes: [{}] }),
    );
    await expect(
      runStage({
        ids: [1],
        runDir: f.runDir,
        atenei,
        websites: new Map(),
        dataDir: f.dataDir,
        stagingDir: f.stagingDir,
        dryRun: true,
      }),
    ).rejects.toThrow(/candidates\.json/);
  });
});

describe("parseArgs", () => {
  it("needs --ids and reads positive integers", () => {
    expect(() => parseArgs([])).toThrow(/--ids is required/);
    expect(parseArgs(["--ids", "1625723,7"])).toEqual({
      ids: [1625723, 7],
      run: null,
      dryRun: false,
    });
    expect(parseArgs(["--ids", "7", "--run", "some/dir", "--dry-run"])).toEqual({
      ids: [7],
      run: "some/dir",
      dryRun: true,
    });
  });
  it("throws on unknown, value-less, repeated flags and bad ids", () => {
    expect(() => parseArgs(["--ids", "1", "--overwrite"])).toThrow(/unknown flag --overwrite/);
    expect(() => parseArgs(["--ids"])).toThrow(/--ids needs a value/);
    expect(() => parseArgs(["--ids", "--dry-run"])).toThrow(/--ids needs a value/);
    expect(() => parseArgs(["--ids", "1", "--run"])).toThrow(/--run needs a value/);
    expect(() => parseArgs(["--ids", "1", "--ids", "2"])).toThrow(/--ids given twice/);
    expect(() => parseArgs(["--ids", "1", "--dry-run", "--dry-run"])).toThrow(/given twice/);
    for (const bad of ["0", "-3", "1.5", "abc", "1,,2", "1,x", ""]) {
      expect(() => parseArgs(["--ids", bad])).toThrow(/positive integers|needs a value/);
    }
    expect(() => parseArgs(["--ids", "1,1"])).toThrow(/twice/);
  });
});

describe("newestRun", () => {
  it("picks the newest directory that holds candidates.json", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "it-stage-runs-"));
    for (const day of ["2026-10-07", "2026-10-08", "2026-10-09"]) {
      await mkdir(path.join(root, day));
    }
    await writeFile(path.join(root, "2026-10-07", "candidates.json"), "{}");
    await writeFile(path.join(root, "2026-10-08", "candidates.json"), "{}");
    // 2026-10-09 has no candidates.json: skipped
    expect(await newestRun(root)).toBe(path.join(root, "2026-10-08"));
  });
  it("throws when there is no run", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "it-stage-runs-"));
    await expect(newestRun(root)).rejects.toThrow(/no discovery run/);
    await expect(newestRun(path.join(root, "missing"))).rejects.toThrow(/no discovery run/);
  });
});

describe("renderSummary", () => {
  it("shows each resolution, the staged slugs, the refusals and the counts", () => {
    const text = renderSummary(
      {
        staged: ["a-b"],
        refused: [{ portalId: 9, reason: "no MUR university matches X" }],
        written: 2,
        skipped: 1,
        inData: 0,
        resolutions: [
          { portalId: 1, portal: "Univ GENOVA", mur: "Università degli studi di Genova" },
          { portalId: 9, portal: "X", mur: null },
        ],
      },
      { dryRun: false, reviewSheet: "data-staging/REVIEW.csv" },
    );
    expect(text).toContain("1: Univ GENOVA -> Università degli studi di Genova");
    expect(text).toContain("9: X -> REFUSED");
    expect(text).toContain("a-b");
    expect(text).toContain("no MUR university matches X");
    expect(text).toContain(
      "2 written, 1 kept (already staged, never overwritten), 0 already in data/",
    );
    expect(text).toContain("review sheet: data-staging/REVIEW.csv");
  });
  it("says a dry run wrote nothing", () => {
    const text = renderSummary(
      { staged: [], refused: [], written: 0, skipped: 0, inData: 0, resolutions: [] },
      { dryRun: true, reviewSheet: "x" },
    );
    expect(text).toContain("dry run");
    expect(text).not.toContain("review sheet:");
  });
});
