import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildPages,
  mergeRegistries,
  parseArgs,
  runItPages,
} from "../../../scripts/import/it-pages";

const page = (url: string, year: string | null = null, says = "x") => ({ url, says, year });

function registry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    "Università A": {
      institutionSlugs: ["it-a-uni"],
      universityPages: {
        admissions: [page("https://a.it/adm", "2026/27")],
        fees: [page("https://a.it/fees", "2026/27")],
        countryList: [page("https://a.it/countries", null)],
        documents: [page("https://a.it/docs", "2024/25")],
        language: [page("https://a.it/lang", "2023/24")],
      },
      programmes: {
        "it-a-uni-cs": {
          programme: [page("https://a.it/cs", "2020/21")],
          admissions: [page("https://a.it/cs/adm", "2026/27")],
          other: [page("https://a.it/cs/other")],
        },
      },
      notes: "n",
      extraKey: 1,
    },
    ...overrides,
  };
}

const known = {
  programmeSlugs: new Set(["it-a-uni-cs", "it-a-uni-bm", "it-b-uni-x"]),
  institutionSlugs: new Set(["it-a-uni", "it-b-uni"]),
};

function build(regs: unknown[], maxPerProgramme = 14) {
  return buildPages(regs, { maxPerProgramme, ...known });
}

describe("mergeRegistries", () => {
  it("merges disjoint registries", () => {
    const other = {
      "Università B": { institutionSlugs: [], universityPages: {}, programmes: {}, notes: "" },
    };
    const merged = mergeRegistries([registry(), other]);
    expect(Object.keys(merged)).toEqual(["Università A", "Università B"]);
  });

  it("throws when a university name appears twice", () => {
    expect(() => mergeRegistries([registry(), registry()])).toThrow(
      /Università A.*twice|twice.*Università A/,
    );
  });

  it("rejects a malformed shape with a path", () => {
    const bad = { "Uni X": { institutionSlugs: "it-x", programmes: {}, notes: "" } };
    expect(() => mergeRegistries([bad])).toThrow(/Uni X/);
  });

  it("defaults missing page lists and ignores unknown keys", () => {
    const merged = mergeRegistries([
      {
        U: { institutionSlugs: [], universityPages: {}, programmes: { s: {} }, notes: "", zzz: 1 },
      },
    ]);
    expect(merged.U?.universityPages.fees).toEqual([]);
    expect(merged.U?.programmes.s?.other).toEqual([]);
  });
});

describe("buildPages", () => {
  it("orders programme, programme admissions, other, then university pages", () => {
    const { pages } = build([registry()]);
    expect(pages["it-a-uni-cs"]).toEqual([
      "https://a.it/cs",
      "https://a.it/cs/adm",
      "https://a.it/cs/other",
      "https://a.it/adm",
      "https://a.it/fees",
      "https://a.it/countries",
      "https://a.it/docs",
      "https://a.it/lang",
    ]);
  });

  it("drops old-year fees, admissions and countryList pages but keeps documents, language and programme pages", () => {
    const reg = registry();
    const uni = reg["Università A"] as { universityPages: Record<string, unknown[]> };
    uni.universityPages.fees = [
      page("https://a.it/fees-old", "2025/26"),
      page("https://a.it/fees-ok", "2026/27"),
    ];
    uni.universityPages.countryList = [page("https://a.it/c-old", "2024/25")];
    const out = build([reg]);
    expect(out.pages["it-a-uni-cs"]).not.toContain("https://a.it/fees-old");
    expect(out.pages["it-a-uni-cs"]).not.toContain("https://a.it/c-old");
    expect(out.pages["it-a-uni-cs"]).toContain("https://a.it/fees-ok");
    expect(out.pages["it-a-uni-cs"]).toContain("https://a.it/docs");
    expect(out.pages["it-a-uni-cs"]).toContain("https://a.it/lang");
    expect(out.pages["it-a-uni-cs"]).toContain("https://a.it/cs");
    expect(out.dropped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: "https://a.it/fees-old",
          kind: "fees",
          year: "2025/26",
          university: "Università A",
          reason: "year",
        }),
        expect.objectContaining({ url: "https://a.it/c-old", kind: "countryList", reason: "year" }),
      ]),
    );
  });

  it("records a university-level year drop once however many programmes it has", () => {
    const reg = registry();
    const uni = reg["Università A"] as {
      universityPages: Record<string, unknown[]>;
      programmes: Record<string, unknown>;
    };
    uni.universityPages.fees = [page("https://a.it/fees-old", "2025/26")];
    uni.programmes["it-a-uni-bm"] = { programme: [page("https://a.it/bm")] };
    const out = build([reg]);
    expect(out.dropped.filter((d) => d.url === "https://a.it/fees-old")).toHaveLength(1);
    expect(out.stats.droppedByReason.year).toBe(1);
  });

  it("drops an older programme-level admissions page, keeps year null and unparseable years", () => {
    const reg = registry();
    const uni = reg["Università A"] as { programmes: Record<string, { admissions: unknown[] }> };
    cs(uni).admissions = [
      page("https://a.it/old", "2025/26"),
      page("https://a.it/nul", null),
      page("https://a.it/odd", "n.d."),
    ];
    const out = build([reg]);
    expect(out.pages["it-a-uni-cs"]).not.toContain("https://a.it/old");
    expect(out.pages["it-a-uni-cs"]).toContain("https://a.it/nul");
    expect(out.pages["it-a-uni-cs"]).toContain("https://a.it/odd");
  });

  it("strips fragments, dedupes keeping the first occurrence and keeps PDFs", () => {
    const reg = registry();
    const uni = reg["Università A"] as {
      universityPages: Record<string, unknown[]>;
      programmes: Record<string, { programme: unknown[] }>;
    };
    cs(uni).programme = [page("https://a.it/x#top"), page("https://a.it/guide.pdf")];
    uni.universityPages.admissions = [page("https://a.it/x", "2026/27")];
    const urls = build([reg]).pages["it-a-uni-cs"];
    expect(urls?.filter((u) => u === "https://a.it/x")).toHaveLength(1);
    expect(urls?.[0]).toBe("https://a.it/x");
    expect(urls).toContain("https://a.it/guide.pdf");
  });

  it("upgrades http to https only when the https URL was also listed", () => {
    const reg = registry();
    const uni = reg["Università A"] as { programmes: Record<string, { programme: unknown[] }> };
    cs(uni).programme = [
      page("http://a.it/both"),
      page("http://a.it/only-http"),
      page("https://a.it/both"),
    ];
    const urls = build([reg]).pages["it-a-uni-cs"] ?? [];
    expect(urls).toContain("https://a.it/both");
    expect(urls).not.toContain("http://a.it/both");
    expect(urls).toContain("http://a.it/only-http");
    expect(urls.filter((u) => u.includes("/both"))).toHaveLength(1);
  });

  it("drops non-http(s) and unparseable URLs with reason invalid-url", () => {
    const reg = registry();
    const uni = reg["Università A"] as { programmes: Record<string, { programme: unknown[] }> };
    cs(uni).programme = [page("ftp://a.it/x"), page("not a url"), page("https://a.it/ok")];
    const out = build([reg]);
    expect(out.pages["it-a-uni-cs"]).toContain("https://a.it/ok");
    expect(out.pages["it-a-uni-cs"]).not.toContain("ftp://a.it/x");
    expect(out.stats.droppedByReason["invalid-url"]).toBe(2);
  });

  it("caps per programme keeping the priority order and lists the truncated URLs", () => {
    const out = build([registry()], 3);
    expect(out.pages["it-a-uni-cs"]).toEqual([
      "https://a.it/cs",
      "https://a.it/cs/adm",
      "https://a.it/cs/other",
    ]);
    const capped = out.dropped.filter((d) => d.reason === "cap");
    expect(capped.map((d) => d.url)).toEqual([
      "https://a.it/adm",
      "https://a.it/fees",
      "https://a.it/countries",
      "https://a.it/docs",
      "https://a.it/lang",
    ]);
    expect(out.stats.droppedByReason.cap).toBe(5);
  });

  it("sorts the keys of the pages", () => {
    const reg = registry({
      "Università B": {
        institutionSlugs: ["it-b-uni"],
        universityPages: {},
        programmes: { "it-b-uni-x": { programme: [page("https://b.it/x")] } },
        notes: "",
      },
    });
    expect(Object.keys(build([reg]).pages)).toEqual(["it-a-uni-cs", "it-b-uni-x"]);
  });

  it("stops with the list of unknown programme and institution slugs", () => {
    const reg = registry();
    const uni = reg["Università A"] as {
      institutionSlugs: string[];
      programmes: Record<string, unknown>;
    };
    uni.programmes["it-zzz-1"] = {};
    uni.programmes["it-zzz-2"] = {};
    uni.institutionSlugs.push("it-nope");
    expect(() => build([reg])).toThrow(/it-zzz-1, it-zzz-2/);
    expect(() => build([reg])).toThrow(/it-nope/);
  });

  it("reports it-* programmes absent from the registry", () => {
    const out = buildPages([registry()], {
      maxPerProgramme: 14,
      ...known,
      programmeSlugs: new Set([...known.programmeSlugs, "de-other"]),
    });
    expect(out.missing).toEqual(["it-a-uni-bm", "it-b-uni-x"]);
  });

  it("reports programmes with fewer than 3 URLs and counts totals", () => {
    const reg = registry();
    const uni = reg["Università A"] as { programmes: Record<string, unknown> };
    uni.programmes["it-a-uni-bm"] = { programme: [page("https://a.it/bm")] };
    const out = build([reg]);
    expect(out.stats.universities).toBe(1);
    expect(out.stats.programmes).toBe(2);
    expect(out.stats.totalUrls).toBe(
      (out.pages["it-a-uni-cs"]?.length ?? 0) + (out.pages["it-a-uni-bm"]?.length ?? 0),
    );
    expect(out.stats.thin).toEqual([]);
    const thin = buildPages(
      [
        {
          U: {
            institutionSlugs: [],
            universityPages: {},
            programmes: { "it-a-uni-bm": { programme: [page("https://u.it/")] } },
            notes: "",
          },
        },
      ],
      {
        maxPerProgramme: 14,
        ...known,
      },
    );
    expect(thin.stats.thin).toEqual(["it-a-uni-bm"]);
  });

  it("builds from a real-shaped two-university fixture", () => {
    const real = {
      "Politecnico di Bari": {
        institutionSlugs: ["it-a-uni"],
        universityPages: {
          admissions: [
            page("https://www.poliba.it/sites/default/files/bando_2026-27.pdf", "2026/27"),
            page("https://www.poliba.it/en/ammissioni", "2026/27"),
          ],
          fees: [page("https://web.poliba.it/regolamento_25_26.pdf", "2025/26")],
          countryList: [],
          documents: [page("https://www.poliba.it/en/procedure-non-eu-students", null)],
          language: [],
        },
        programmes: {
          "it-a-uni-cs": {
            programme: [page("https://www.poliba.it/en/lt35")],
            admissions: [],
            other: [],
          },
        },
        notes: "fees 2026/27 not yet published",
      },
      "Università degli studi di Brescia": {
        institutionSlugs: ["it-b-uni"],
        universityPages: {
          admissions: [page("http://www.unibs.it/en/adm", "2026/27")],
          fees: [page("https://www.unibs.it/en/adm", null)],
        },
        programmes: { "it-b-uni-x": { programme: [page("https://www.unibs.it/en/x")] } },
        notes: "",
      },
    };
    const out = build([real]);
    expect(out.pages["it-a-uni-cs"]).toEqual([
      "https://www.poliba.it/en/lt35",
      "https://www.poliba.it/sites/default/files/bando_2026-27.pdf",
      "https://www.poliba.it/en/ammissioni",
      "https://www.poliba.it/en/procedure-non-eu-students",
    ]);
    expect(out.pages["it-b-uni-x"]).toEqual([
      "https://www.unibs.it/en/x",
      "https://www.unibs.it/en/adm",
    ]);
  });
});

describe("parseArgs", () => {
  it("requires --registry and --out and applies defaults", () => {
    expect(parseArgs(["--registry", "a.json,b.json", "--out", "p.json"])).toEqual({
      registry: ["a.json", "b.json"],
      out: "p.json",
      maxPerProgramme: 14,
      dataDir: "data",
    });
    expect(() => parseArgs(["--out", "p.json"])).toThrow(/--registry/);
    expect(() => parseArgs(["--registry", "a.json"])).toThrow(/--out/);
  });

  it("throws on unknown, value-less and repeated flags and a bad cap", () => {
    expect(() => parseArgs(["--registry", "a", "--out", "b", "--nope", "1"])).toThrow(
      /unknown flag/,
    );
    expect(() => parseArgs(["--registry", "a", "--out"])).toThrow(/needs a value/);
    expect(() => parseArgs(["--registry", "a", "--registry", "b", "--out", "c"])).toThrow(/twice/);
    expect(() => parseArgs(["--registry", "a", "--out", "b", "--max-per-programme", "0"])).toThrow(
      /max-per-programme/,
    );
  });
});

describe("runItPages", () => {
  async function setup() {
    const root = await mkdtemp(path.join(tmpdir(), "it-pages-"));
    const dataDir = path.join(root, "data");
    await mkdir(path.join(dataDir, "programs"), { recursive: true });
    await mkdir(path.join(dataDir, "institutions"), { recursive: true });
    for (const s of ["it-a-uni-cs", "it-a-uni-bm", "de-other"])
      await writeFile(path.join(dataDir, "programs", `${s}.yaml`), "slug: x\n");
    await writeFile(path.join(dataDir, "institutions", "it-a-uni.yaml"), "slug: x\n");
    const registryFile = path.join(root, "reg.json");
    await writeFile(registryFile, JSON.stringify(registry()));
    return { root, dataDir, registryFile, out: path.join(root, "pages.json") };
  }

  it("writes the pages file, the missing list and the dropped list", async () => {
    const { dataDir, registryFile, out } = await setup();
    const reg = JSON.parse(await readFile(registryFile, "utf8")) as Record<
      string,
      { universityPages: { fees: unknown[] } }
    >;
    reg["Università A"]?.universityPages.fees.push(page("https://a.it/old", "2025/26"));
    await writeFile(registryFile, JSON.stringify(reg));
    const summary = await runItPages({
      registry: [registryFile],
      out,
      maxPerProgramme: 14,
      dataDir,
    });
    const text = await readFile(out, "utf8");
    expect(text.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(text) as { shared: unknown; programmes: Record<string, string[]> };
    expect(parsed.shared).toEqual({});
    expect(Object.keys(parsed.programmes)).toEqual(["it-a-uni-cs"]);
    expect(await readFile(`${out}.missing.txt`, "utf8")).toBe("it-a-uni-bm\n");
    const dropped = await readFile(`${out}.dropped.txt`, "utf8");
    expect(dropped).toContain("https://a.it/old");
    expect(dropped).toContain("year");
    expect(summary).toContain("universities");
  });

  it("refuses an unknown slug without writing anything", async () => {
    const { root, dataDir, out } = await setup();
    const bad = path.join(root, "bad.json");
    const reg = registry();
    (reg["Università A"] as { programmes: Record<string, unknown> }).programmes["it-missing"] = {};
    await writeFile(bad, JSON.stringify(reg));
    await expect(
      runItPages({ registry: [bad], out, maxPerProgramme: 14, dataDir }),
    ).rejects.toThrow(/it-missing/);
    await expect(readFile(out, "utf8")).rejects.toThrow();
  });
});

function cs(uni: { programmes: Record<string, unknown> }): {
  programme: unknown[];
  admissions: unknown[];
} {
  return uni.programmes["it-a-uni-cs"] as { programme: unknown[]; admissions: unknown[] };
}
