import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  newestRun,
  parseArgs,
  renderSummary,
  runStage,
  type StageResult,
} from "../../../scripts/import/it-stage";
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
        institutionSlug: "it-genova-genova",
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
    await expect(
      readFile(
        path.join(f.stagingDir, "programs", "it-genova-genova-computer-engineering-l8.yaml"),
        "utf8",
      ),
    ).rejects.toThrow();
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
      {
        portalId: 1625723,
        portal: "Università degli Studi di GENOVA",
        mur: null,
        institutionSlug: null,
      },
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

const baseResult = (over: Partial<StageResult> = {}): StageResult => ({
  staged: [],
  refused: [],
  written: 0,
  skipped: 0,
  inData: 0,
  removedStale: [],
  keptApprovedStale: [],
  resolutions: [],
  ...over,
});

describe("renderSummary", () => {
  it("shows each resolution, the staged slugs and the counts", () => {
    const text = renderSummary(
      baseResult({
        staged: ["a-b"],
        written: 2,
        skipped: 1,
        resolutions: [
          {
            portalId: 1,
            portal: "Univ GENOVA",
            mur: "Università degli studi di Genova",
            institutionSlug: "it-genova-genova",
          },
        ],
      }),
      { dryRun: false, reviewSheet: "data-staging/REVIEW.csv" },
    );
    expect(text).toContain("1: Univ GENOVA -> Università degli studi di Genova");
    expect(text).toContain("it-genova-genova");
    expect(text).toContain("a-b");
    expect(text).toContain(
      "2 written, 1 kept (already staged, never overwritten), 0 already in data/",
    );
    expect(text).toContain("review sheet: data-staging/REVIEW.csv");
  });
  it("after a refusal prints the refusals and no written counts or review sheet", () => {
    const text = renderSummary(
      baseResult({
        refused: [{ portalId: 9, reason: "no MUR university matches X" }],
        resolutions: [{ portalId: 9, portal: "X", mur: null, institutionSlug: null }],
      }),
      { dryRun: false, reviewSheet: "data-staging/REVIEW.csv" },
    );
    expect(text).toContain("9: X -> REFUSED");
    expect(text).toContain("no MUR university matches X");
    expect(text).toContain("nothing was written");
    expect(text).not.toContain("written,");
    expect(text).not.toContain("review sheet:");
  });
  it("prints superseded and approved-stale staged files", () => {
    const text = renderSummary(
      baseResult({
        removedStale: ["programs/old-slug"],
        keptApprovedStale: ["programs/approved-old"],
      }),
      { dryRun: false, reviewSheet: "x" },
    );
    expect(text).toContain("programs/old-slug");
    expect(text).toContain("WARN programs/approved-old is approved");
  });
  it("says a dry run wrote nothing", () => {
    const text = renderSummary(baseResult(), { dryRun: true, reviewSheet: "x" });
    expect(text).toContain("dry run");
    expect(text).not.toContain("review sheet:");
  });
});

const putProgramme = async (dir: string, slug: string, institution: string) => {
  await mkdir(path.join(dir, "programs"), { recursive: true });
  await writeFile(
    path.join(dir, "programs", `${slug}.yaml`),
    `slug: ${slug}\ninstitution: ${institution}\nlevel: bachelor\n`,
  );
};

const stageOne = async (f: Awaited<ReturnType<typeof fixture>>, dryRun = true) =>
  runStage({
    ids: [1625723],
    runDir: f.runDir,
    atenei,
    websites: new Map(),
    dataDir: f.dataDir,
    stagingDir: f.stagingDir,
    dryRun,
  });

describe("the duplicate guard", () => {
  it("refuses a candidate whose institution and class match a programme already staged", async () => {
    const f = await fixture();
    await putProgramme(
      f.stagingDir,
      "it-genova-genova-ingegneria-informatica-l8",
      "it-genova-genova",
    );
    const r = await stageOne(f, false);
    expect(r.staged).toEqual([]);
    expect(r.written).toBe(0);
    expect(r.refused).toHaveLength(1);
    expect(r.refused[0]?.reason).toContain(
      "possible duplicate of it-genova-genova-ingegneria-informatica-l8",
    );
    expect(r.refused[0]?.reason).toContain("already staged");
    await expect(readFile(path.join(f.stagingDir, "REVIEW.csv"), "utf8")).rejects.toThrow();
  });
  it("refuses it when the match is in data/", async () => {
    const f = await fixture();
    await putProgramme(f.dataDir, "it-genova-genova-ingegneria-informatica-l8", "it-genova-genova");
    const r = await stageOne(f);
    expect(r.refused[0]?.reason).toContain("in data/");
  });
  it("uses the slug of a reused institution, not the formula slug", async () => {
    const f = await fixture();
    await mkdir(path.join(f.dataDir, "institutions"), { recursive: true });
    await writeFile(
      path.join(f.dataDir, "institutions", "it-unige-genova.yaml"),
      "slug: it-unige-genova\nname: Università degli studi di Genova\n",
    );
    await putProgramme(f.dataDir, "it-unige-genova-ingegneria-l8", "it-unige-genova");
    const r = await stageOne(f);
    expect(r.refused[0]?.reason).toContain("it-unige-genova-ingegneria-l8");
    expect(r.resolutions[0]?.institutionSlug).toBe("it-unige-genova");
  });
  it("does not refuse another class at the same institution or another institution", async () => {
    const f = await fixture();
    await putProgramme(f.stagingDir, "it-genova-genova-informatica-l31", "it-genova-genova");
    await putProgramme(f.dataDir, "it-padova-padova-ingegneria-l8", "it-padova-padova");
    const r = await stageOne(f);
    expect(r.refused).toEqual([]);
    expect(r.staged).toEqual(["it-genova-genova-computer-engineering-l8"]);
  });
  it("does not refuse the candidate's own slug already staged by an earlier run", async () => {
    const f = await fixture();
    await putProgramme(
      f.stagingDir,
      "it-genova-genova-computer-engineering-l8",
      "it-genova-genova",
    );
    const r = await stageOne(f);
    expect(r.refused).toEqual([]);
  });
});

describe("the duplicate guard, idempotence and classes", () => {
  const three = (over = {}) => [
    candidate({
      portalId: 11,
      name: "Management A",
      classCode: "L-9",
      classCodes: ["L-9"],
      field: "engineering",
      ...over,
    }),
    candidate({
      portalId: 12,
      name: "Management B",
      classCode: "L-9",
      classCodes: ["L-9"],
      field: "engineering",
      ...over,
    }),
    candidate({
      portalId: 13,
      name: "Management C",
      classCode: "L-9",
      classCodes: ["L-9"],
      field: "engineering",
      ...over,
    }),
  ];
  const run = (f: Awaited<ReturnType<typeof fixture>>, ids: number[], dryRun = false) =>
    runStage({
      ids,
      runDir: f.runDir,
      atenei,
      websites: new Map(),
      dataDir: f.dataDir,
      stagingDir: f.stagingDir,
      dryRun,
    });

  it("re-running the same batch of one institution and class is not refused by its own output", async () => {
    const f = await fixture({ newUniversities: [], newProgrammes: three() });
    const first = await run(f, [11, 12, 13]);
    expect(first.refused).toEqual([]);
    expect(first.written).toBe(4); // the institution and three programmes
    const second = await run(f, [11, 12, 13]);
    expect(second.refused).toEqual([]);
    expect(second.written).toBe(0);
    expect(second.skipped).toBe(4);
  });
  it("still refuses a different staged programme of the same institution and class", async () => {
    const f = await fixture({ newUniversities: [], newProgrammes: three() });
    await run(f, [11, 12, 13]);
    await putProgramme(f.stagingDir, "it-genova-genova-gestione-l9", "it-genova-genova");
    const again = await run(f, [11, 12, 13]);
    expect(again.refused.map((r) => r.portalId)).toEqual([11, 12, 13]);
    expect(again.refused[0]?.reason).toContain("it-genova-genova-gestione-l9");
  });
  it("matches any of the candidate's classes, not only the first", async () => {
    const f = await fixture({
      newUniversities: [],
      newProgrammes: [candidate({ portalId: 21, classCode: "L-9", classCodes: ["L-9", "L-8"] })],
    });
    await putProgramme(f.dataDir, "it-genova-genova-ingegneria-l8", "it-genova-genova");
    const hit = await run(f, [21], true);
    expect(hit.refused[0]?.reason).toContain("it-genova-genova-ingegneria-l8");
    const g = await fixture({
      newUniversities: [],
      newProgrammes: [candidate({ portalId: 21, classCode: "L-9", classCodes: ["L-9", "L-8"] })],
    });
    await putProgramme(g.dataDir, "it-genova-genova-fisica-l30", "it-genova-genova");
    expect((await run(g, [21], true)).refused).toEqual([]);
  });
  it("compares the whole class suffix: l18 is not l8, l8 is not l18, l3 is not l33", async () => {
    for (const [existing, code] of [
      ["it-genova-genova-economia-l18", "L-8"],
      ["it-genova-genova-ingegneria-l8", "L-18"],
      ["it-genova-genova-lettere-l3", "L-33"],
    ] as const) {
      const f = await fixture({
        newUniversities: [],
        newProgrammes: [candidate({ portalId: 31, classCode: code, classCodes: [code] })],
      });
      await putProgramme(f.dataDir, existing, "it-genova-genova");
      expect((await run(f, [31], true)).refused).toEqual([]);
    }
  });
});

describe("our institutions", () => {
  it("reuses an institution in data/ that has no programme yet", async () => {
    const f = await fixture();
    await writeFile(
      path.join(f.dataDir, "institutions", "it-unige-genova.yaml"),
      "slug: it-unige-genova\nname: Università degli studi di Genova\n",
    );
    const r = await stageOne(f, false);
    expect(r.written).toBe(1); // the programme only
    const yaml = await readFile(
      path.join(f.stagingDir, "programs", "it-unige-genova-computer-engineering-l8.yaml"),
      "utf8",
    );
    expect(yaml).toContain("institution: it-unige-genova");
  });
});

describe("candidates.json shape", () => {
  it("rejects an unknown field and a non-http url", async () => {
    for (const bad of [{ field: "law" }, { url: "ftp://x.example/y" }, { url: "javascript:1" }]) {
      const f = await fixture({
        newUniversities: [],
        newProgrammes: [candidate(bad)],
      });
      await expect(stageOne(f)).rejects.toThrow(/candidates\.json/);
    }
  });
});
