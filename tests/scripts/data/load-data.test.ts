import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

describe("loadData in a scratch directory", () => {
  function scratch(files: Record<string, string>): string {
    const dir = mkdtempSync(path.join(tmpdir(), "jisr-load-data-"));
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      writeFileSync(path.join(dir, file), text);
    }
    return dir;
  }

  it("fails loudly on a symlink or junction instead of skipping it", () => {
    const dir = scratch({ "fields/xx-test-field.yaml": "slug: xx-test-field\n" });
    const target = scratch({ "xx-test-other.yaml": "slug: xx-test-other\n" });
    symlinkSync(target, path.join(dir, "subjects"), "junction");

    const { files, errors } = loadData(dir);
    expect(files.map((f) => f.file)).toEqual(["fields/xx-test-field.yaml"]);
    expect(errors).toEqual([{ file: "subjects", path: "", message: "unexpected non-file entry" }]);
  });

  it("treats YAML parser warnings as errors", () => {
    const dir = scratch({ "fields/xx-test-field.yaml": "slug: !xx-unknown-tag xx-test-field\n" });
    const { files, errors } = loadData(dir);
    expect(files).toEqual([]);
    expect(errors).toEqual([
      expect.objectContaining({
        file: "fields/xx-test-field.yaml",
        message: expect.stringMatching(/^yaml: /),
      }),
    ]);
  });
});
