import path from "node:path";
import { loadData } from "@scripts/data/load-data";
import { describe, expect, it } from "vitest";

const FIXTURES = path.join(process.cwd(), "tests/fixtures/data");

function fixture(name: string): string {
  return path.join(FIXTURES, name);
}

describe("loadData", () => {
  it("reports structural problems with the file and a precise message", () => {
    const { errors } = loadData(fixture("invalid-structure"));
    const expected: Array<[string, string]> = [
      ["stray.yaml", "collection folder"],
      ["unknown-things/xx-test-a.yaml", 'unknown collection "unknown-things"'],
      ["fields/xx-test-bad.yml", ".yaml extension"],
      ["subjects/xx-test-broken.yaml", "yaml:"],
    ];
    for (const [file, message] of expected) {
      expect(errors).toContainEqual(
        expect.objectContaining({ file, message: expect.stringContaining(message) }),
      );
    }
    expect(errors).toHaveLength(expected.length);
  });

  it("still loads the well-formed files next to the broken ones, sorted by path", () => {
    const { files } = loadData(fixture("invalid-structure"));
    expect(files.map((f) => f.file)).toEqual([
      "fields/a/xx-test-dup.yaml",
      "fields/b/xx-test-dup.yaml",
      "fields/xx-test-renamed.yaml",
    ]);
    expect(files.map((f) => f.collection)).toEqual(["fields", "fields", "fields"]);
    expect(files.map((f) => f.id)).toEqual(["xx-test-dup", "xx-test-dup", "xx-test-renamed"]);
  });

  it("keeps YAML dates and country codes as strings (YAML 1.2 core schema)", () => {
    const { files, errors } = loadData(fixture("valid-minimal"));
    expect(errors).toEqual([]);
    expect(files).toHaveLength(16);

    const program = files.find((f) => f.file === "programs/xx-test-prog.yaml");
    expect(program?.raw).toMatchObject({
      intakes: { value: [{ startDate: "2027-09-01" }] },
    });
    const country = files.find((f) => f.file === "countries/XB.yaml");
    expect(country?.raw).toMatchObject({ code: "XB" });
    const scale = files.find((f) => f.file === "grading-scales/xx-test-scale-20.yaml");
    expect(scale?.raw).toMatchObject({ sources: { main: { last_verified_at: "2026-09-01" } } });
  });

  it("ignores dotfiles and README files", () => {
    expect(loadData(fixture("empty"))).toEqual({ files: [], errors: [] });
  });

  it("treats a missing default data dir as empty and any other missing dir as an error", () => {
    expect(loadData("data-that-does-not-exist-xx")).toEqual({
      files: [],
      errors: [expect.objectContaining({ message: "data dir not found" })],
    });
  });
});
