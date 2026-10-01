import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { inSelection, readSlugFilter } from "../../../scripts/import/evidence-cli";

describe("inSelection", () => {
  it("selects everything when there is no filter", () => {
    expect(inSelection("any-slug", null)).toBe(true);
  });

  it("selects only the slugs in the filter", () => {
    const only = new Set(["a", "b"]);
    expect(inSelection("a", only)).toBe(true);
    expect(inSelection("c", only)).toBe(false);
  });
});

describe("readSlugFilter", () => {
  it("is null without --slugs", async () => {
    expect(await readSlugFilter(["--dry-run"])).toBeNull();
  });

  it("reads one slug per line, ignoring blank lines and spaces", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "slugs-"));
    const file = path.join(dir, "slugs.txt");
    await writeFile(file, "a\n\n  b  \r\nc\n");
    expect([...((await readSlugFilter(["--slugs", file])) ?? [])]).toEqual(["a", "b", "c"]);
  });

  it("refuses an empty filter, so a typo never means 'everything'", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "slugs-"));
    const file = path.join(dir, "empty.txt");
    await writeFile(file, "\n\n");
    await expect(readSlugFilter(["--slugs", file])).rejects.toThrow(/empty/i);
  });
});
