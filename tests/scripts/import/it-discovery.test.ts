import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { describeStop, parseArgs, runDiscovery } from "../../../scripts/import/it-discovery";
import { readCandidates } from "../../../scripts/import/it-stage-candidates";
import { PortalStopError } from "../../../scripts/import/sources/universitaly-fetch";

import { course, page } from "./universitaly-helpers";

// 60 English courses; ids 1..60. Course 1 is Politecnico di Bari L-9 (ours), 2 is a new university.
// The names agree with their class (fieldOfClass gives low confidence otherwise); the filler
// courses are class L-34, out of scope.
function portal() {
  const calls: string[] = [];
  const get = async (url: string): Promise<string> => {
    calls.push(url);
    const q = new URL(url).searchParams;
    if (q.get("lingua") === "IT")
      return JSON.stringify(page([course({ id: 900, lingua: "IT" })], 2713, 272));
    const pageNo = Number(q.get("page"));
    const ids = Array.from({ length: 60 }, (_v, i) => i + 1).slice((pageNo - 1) * 10, pageNo * 10);
    const courses = ids.map((id) =>
      id === 1
        ? course({
            id,
            nomeStruttura: "POLITECNICO DI BARI",
            nomeCorso: "Management Engineering for Innovation",
            nomeCorsoEn: "Management Engineering for Innovation",
            classe: { codice: "L-9" },
          })
        : id === 2
          ? course({
              id,
              nomeStruttura: "Università di Trento",
              nomeCorso: "Computer Science",
              nomeCorsoEn: "Computer Science",
              classe: { codice: "L-31" },
            })
          : course({
              id,
              nomeCorso: `Geology ${id}`,
              nomeCorsoEn: `Geology ${id}`,
              classe: { codice: "L-34" },
            }),
    );
    return JSON.stringify(page(courses, 60, 6, String(pageNo)));
  };
  return { get, calls };
}

async function fixtureData(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "uni-run-data-"));
  await mkdir(path.join(dir, "programs"));
  await mkdir(path.join(dir, "institutions"));
  await writeFile(
    path.join(dir, "institutions", "it-bari-politecnico-bari.yaml"),
    "slug: it-bari-politecnico-bari\nname: Politecnico di Bari\n",
  );
  await writeFile(
    path.join(
      dir,
      "programs",
      "it-bari-politecnico-bari-management-engineering-for-innovation-l9.yaml",
    ),
    "slug: it-bari-politecnico-bari-management-engineering-for-innovation-l9\ninstitution: it-bari-politecnico-bari\nname: Management Engineering for Innovation\n",
  );
  return dir;
}

const noSleep = async (): Promise<void> => {};
const at = (iso: string) => () => new Date(iso);

describe("runDiscovery", () => {
  it("fetches, caches, compares and writes the report and the candidate list", async () => {
    const out = await mkdtemp(path.join(tmpdir(), "uni-run-out-"));
    const p = portal();
    const result = await runDiscovery({
      out,
      fromCache: null,
      delayMs: 0,
      get: p.get,
      sleep: noSleep,
      now: at("2026-10-08T10:00:00.000Z"),
      dataDir: await fixtureData(),
    });
    expect(result.runDir).toBe(path.join(out, "2026-10-08"));
    // 6 English pages + the first Italian page
    expect(p.calls).toHaveLength(7);
    const report = await readFile(path.join(result.runDir, "report.md"), "utf8");
    expect(report).toContain("Università di Trento");
    expect(report).toContain("2713");
    const candidates = JSON.parse(
      await readFile(path.join(result.runDir, "candidates.json"), "utf8"),
    ) as { newUniversities: { university: string }[] };
    expect(candidates.newUniversities.map((u) => u.university)).toEqual(["Università di Trento"]);
  });

  it("caches the English and the Italian pages together in one manifest", async () => {
    const out = await mkdtemp(path.join(tmpdir(), "uni-run-out-"));
    const result = await runDiscovery({
      out,
      fromCache: null,
      delayMs: 0,
      get: portal().get,
      sleep: noSleep,
      now: at("2026-10-08T10:00:00.000Z"),
      dataDir: await fixtureData(),
    });
    const manifest = JSON.parse(
      await readFile(path.join(result.runDir, "manifest.json"), "utf8"),
    ) as {
      pages: { file: string }[];
    };
    expect(manifest.pages.map((x) => x.file)).toEqual([
      "EN-page-001.json",
      "EN-page-002.json",
      "EN-page-003.json",
      "EN-page-004.json",
      "EN-page-005.json",
      "EN-page-006.json",
      "IT-page-001.json",
    ]);
  });

  it("reruns from the cache without any request", async () => {
    const out = await mkdtemp(path.join(tmpdir(), "uni-run-out-"));
    const first = portal();
    const data = await fixtureData();
    const run1 = await runDiscovery({
      out,
      fromCache: null,
      delayMs: 0,
      get: first.get,
      sleep: noSleep,
      now: at("2026-10-08T10:00:00.000Z"),
      dataDir: data,
    });
    const second = portal();
    const run2 = await runDiscovery({
      out,
      fromCache: run1.runDir,
      delayMs: 0,
      get: second.get,
      sleep: noSleep,
      now: at("2026-10-09T10:00:00.000Z"),
      dataDir: data,
    });
    expect(second.calls).toHaveLength(0);
    expect(run2.report).toContain("Università di Trento");
  });

  it("stops on the first failure of any kind, without retrying or caching", async () => {
    const out = await mkdtemp(path.join(tmpdir(), "uni-run-out-"));
    const calls: string[] = [];
    const timeout = async (url: string): Promise<string> => {
      calls.push(url);
      throw new TypeError("fetch failed");
    };
    await expect(
      runDiscovery({
        out,
        fromCache: null,
        delayMs: 0,
        get: timeout,
        sleep: noSleep,
        now: at("2026-10-08T10:00:00.000Z"),
        dataDir: await fixtureData(),
      }),
    ).rejects.toThrow(TypeError);
    expect(calls).toHaveLength(1);
    await expect(readFile(path.join(out, "2026-10-08", "manifest.json"), "utf8")).rejects.toThrow();
  });
});

describe("readCandidates", () => {
  it("accepts a candidate in a health field", async () => {
    const runDir = await mkdtemp(path.join(tmpdir(), "uni-run-"));
    await writeFile(
      path.join(runDir, "candidates.json"),
      JSON.stringify({
        newProgrammes: [
          {
            portalId: 1,
            university: "Università degli Studi di Milano",
            name: "Nursing",
            classCode: "L-SNT/1",
            classCodes: ["L-SNT/1"],
            field: "allied-health",
            confidence: "high",
            durationYears: 3,
            url: "https://example.com",
            academicYear: "2026/2027",
            delivery: "conventional",
          },
        ],
      }),
    );
    const { byId } = await readCandidates(runDir);
    expect(byId.get(1)?.field).toBe("allied-health");
  });
});

describe("describeStop", () => {
  it("labels a portal stop and prints any other error as it is", () => {
    expect(describeStop(new PortalStopError("HTTP 403"))).toBe("STOPPED: HTTP 403");
    expect(describeStop(new TypeError("fetch failed"))).toBe("STOPPED: fetch failed");
    expect(describeStop("odd")).toBe("STOPPED: odd");
  });
});

describe("parseArgs", () => {
  it("has defaults and accepts a valid combination", () => {
    expect(parseArgs([])).toEqual({
      out: path.join("data-staging", "universitaly"),
      fromCache: null,
      delayMs: 1500,
    });
    expect(parseArgs(["--from-cache", "some/dir", "--delay-ms", "0", "--out", "o"])).toEqual({
      out: "o",
      fromCache: "some/dir",
      delayMs: 0,
    });
  });
  it("throws instead of falling back to a live fetch when a value is missing", () => {
    expect(() => parseArgs(["--from-cache"])).toThrow(/--from-cache needs a value/);
    expect(() => parseArgs(["--out", "--from-cache", "x"])).toThrow(/--out needs a value/);
    expect(() => parseArgs(["--delay-ms"])).toThrow(/--delay-ms needs a value/);
  });
  it("throws on an unknown flag, a stray argument or a repeated flag", () => {
    expect(() => parseArgs(["--refresh"])).toThrow(/unknown flag --refresh/);
    expect(() => parseArgs(["--from-cahce", "x"])).toThrow(/unknown flag --from-cahce/);
    expect(() => parseArgs(["stray"])).toThrow(/unknown flag stray/);
    expect(() => parseArgs(["--out", "a", "--out", "b"])).toThrow(/--out given twice/);
  });
  it("rejects a bad delay", () => {
    expect(() => parseArgs(["--delay-ms", "-1"])).toThrow(/--delay-ms/);
    expect(() => parseArgs(["--delay-ms", "x"])).toThrow(/--delay-ms/);
  });
});
