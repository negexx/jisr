import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  coverageOf,
  detailOf,
  renderCoverage,
  renderCsv,
  renderDetail,
  runCoverage,
} from "../../../scripts/data/coverage";

const fact = (value: unknown, infoKind = "official") => ({
  value,
  source: "programme",
  info_kind: infoKind,
});

const records = [
  {
    country: "DE",
    tuition: fact({ amountMinor: 0, currency: "EUR", period: "semester" }),
    documents: fact([]),
  },
  { country: "DE", tuition: fact(null), documents: fact(null) },
  {
    country: "NL",
    teachingLanguages: fact(["en"]),
    requirements: { coverage: "partial", rules: [{ id: "req-1" }] },
  },
];

describe("coverageOf", () => {
  const table = coverageOf(records);

  it("counts programmes and the programmes holding each fact, per country", () => {
    expect(table.DE?.n).toBe(2);
    expect(table.DE?.tuition).toBe(1);
    expect(table.DE?.["tuition official"]).toBe(1);
    expect(table.NL?.n).toBe(1);
    expect(table.NL?.language).toBe(1);
    expect(table.NL?.rules).toBe(1);
  });

  it("does not count an empty array as a value", () => {
    expect(table.DE?.documents).toBe(0);
  });

  it("counts only an official tuition as official", () => {
    const estimated = coverageOf([
      {
        country: "FR",
        tuition: fact({ amountMinor: 1, currency: "EUR", period: "year" }, "estimate"),
      },
    ]);
    expect(estimated.FR?.tuition).toBe(1);
    expect(estimated.FR?.["tuition official"]).toBe(0);
  });

  it("counts a missing fact as no value", () => {
    expect(table.DE?.intakes).toBe(0);
    expect(table.DE?.rules).toBe(0);
  });
});

describe("renderCoverage", () => {
  const rendered = renderCoverage(coverageOf(records));

  it("renders one column per country in alphabetical order", () => {
    expect(rendered).toContain("| Fact | DE | NL |");
  });

  it("renders one row per fact", () => {
    expect(rendered).toContain("| tuition | 1 | 0 |");
    expect(rendered).toContain("| programmes | 2 | 1 |");
    expect(rendered).toContain("| documents | 0 | 0 |");
  });
});

describe("detail mode", () => {
  const tuition = fact({ amountMinor: 100, currency: "EUR", period: "year" });
  const complete = {
    slug: "xx-uni-a-cs",
    institution: "xx-uni-a",
    country: "DE",
    name: "Computer Science",
    tuition,
    teachingLanguages: fact(["en"]),
    intakes: fact([{ applicationDeadline: "2027-01-15" }]),
    applicationChannel: fact({ kind: "direct" }),
    documents: fact([{ slug: "diploma" }]),
    durationYears: fact(3),
    requirements: { rules: [{ id: "r1" }] },
  };
  const lacking = {
    ...complete,
    slug: "xx-uni-a-econ",
    name: "Economics",
    tuition: fact(null),
    intakes: fact([{ applicationDeadline: null }]),
  };
  const recurring = {
    ...complete,
    slug: "xx-uni-b-cs",
    institution: "xx-uni-b",
    country: "FR",
    name: "Informatique",
    intakes: fact([{ applicationDeadline: null, recurringDeadline: { month: 3, day: 1 } }]),
  };
  const names = { "xx-uni-a": "Alpha University", "xx-uni-b": "Beta Institut" };

  it("flags a missing tuition and deadline, and counts a recurring deadline as held", () => {
    const rows = detailOf([lacking, recurring, complete], names);
    expect(rows.map((row) => row.slug)).toEqual(["xx-uni-a-cs", "xx-uni-a-econ", "xx-uni-b-cs"]);
    expect(rows.map((row) => row.country)).toEqual(["DE", "DE", "FR"]);
    expect(rows[0]?.missing).toEqual([]);
    expect(rows[1]?.missing).toEqual(["tuition", "deadline"]);
    expect(rows[2]?.missing).toEqual([]);
  });

  it("renders per-institution counts and the incomplete programmes", () => {
    const text = renderDetail(detailOf([complete, lacking, recurring], names));
    expect(text).toContain("## DE");
    expect(text).toContain(
      "| Alpha University | xx-uni-a | 2 | 1 | 2 | 2 | 1 | 2 | 2 | 2 | 2 | 1 |",
    );
    expect(text).toContain("- xx-uni-a-econ (Economics): tuition, deadline");
    expect(text).not.toContain("xx-uni-b-cs (");
  });

  it("writes one CSV row per programme with 0/1 columns", () => {
    const lines = renderCsv(detailOf([complete, lacking], names)).split("\n");
    expect(lines[0]).toBe(
      "country,institution_slug,institution_name,programme_slug,programme_name,tuition,language,intakes,deadline,channel,documents,duration,rules,missing_count",
    );
    expect(lines[1]).toBe(
      "DE,xx-uni-a,Alpha University,xx-uni-a-cs,Computer Science,1,1,1,1,1,1,1,1,0",
    );
    expect(lines[2]).toBe("DE,xx-uni-a,Alpha University,xx-uni-a-econ,Economics,0,1,1,0,1,1,1,1,2");
  });

  it("quotes CSV cells that contain commas or quotes", () => {
    const row = { ...complete, name: 'A, "B"' };
    expect(renderCsv(detailOf([row], names))).toContain('"A, ""B"""');
  });
});

describe("runCoverage", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "coverage-"));
    mkdirSync(path.join(dir, "programs"));
    mkdirSync(path.join(dir, "institutions"));
    writeFileSync(
      path.join(dir, "institutions", "xx-uni-a.yaml"),
      "slug: xx-uni-a\nname: Alpha University\ncountry: DE\n",
    );
    const base = [
      "institution: xx-uni-a",
      "country: DE",
      "tuition:\n  value:\n    amountMinor: 1\n    currency: EUR\n    period: year\n  info_kind: official",
      "teachingLanguages:\n  value: [en]",
      "intakes:\n  value:\n    - applicationDeadline: 2027-01-15",
      "applicationChannel:\n  value:\n    kind: direct",
      "documents:\n  value:\n    - slug: diploma",
      "durationYears:\n  value: 3",
      "requirements:\n  rules:\n    - id: r1",
    ];
    writeFileSync(
      path.join(dir, "programs", "a-cs.yaml"),
      ["slug: xx-uni-a-cs", "name: Computer Science", ...base].join("\n"),
    );
    writeFileSync(
      path.join(dir, "programs", "a-econ.yaml"),
      [
        "slug: xx-uni-a-econ",
        "name: Economics",
        ...base.map((chunk) =>
          chunk.startsWith("tuition")
            ? "tuition:\n  value: null"
            : chunk.startsWith("intakes")
              ? "intakes:\n  value:\n    - applicationDeadline: null"
              : chunk,
        ),
      ].join("\n"),
    );
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("keeps the default output the plain table and writes nothing", () => {
    const out = runCoverage([], dir);
    expect(out).toContain("| Fact | DE |");
    expect(out).toContain("| programmes | 2 |");
    expect(readdirSync(dir).sort()).toEqual(["institutions", "programs"]);
  });

  it("prints the detail report from the data dir", () => {
    const out = runCoverage(["--detail"], dir);
    expect(out).toContain("| Alpha University | xx-uni-a | 2 |");
    expect(out).toContain("- xx-uni-a-econ (Economics): tuition, deadline");
    expect(out).not.toContain("xx-uni-a-cs (");
  });

  it("writes the report to --out and the rows to --csv, nothing else", () => {
    const outFile = path.join(dir, "report.md");
    const csvFile = path.join(dir, "rows.csv");
    const out = runCoverage(["--detail", "--out", outFile, "--csv", csvFile], dir);
    expect(out).toBe("");
    expect(readFileSync(outFile, "utf8")).toContain("xx-uni-a-econ");
    expect(readFileSync(csvFile, "utf8").trim().split("\n")).toHaveLength(3);
    expect(readdirSync(path.join(dir, "programs"))).toHaveLength(2);
  });

  it("rejects --out without --detail and unknown flags", () => {
    expect(() => runCoverage(["--out", "x.md"], dir)).toThrow(/--detail/);
    expect(() => runCoverage(["--nope"], dir)).toThrow(/unknown/);
  });
});
