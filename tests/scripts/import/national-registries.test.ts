import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseRegistry } from "../../../scripts/import/national";

const DIR = path.join(process.cwd(), "scripts", "import", "registries");
const files = existsSync(DIR)
  ? readdirSync(DIR)
      .filter((name) => /^national-.*\.json$/.test(name))
      .sort()
  : [];

describe("national registries", () => {
  it("every registry file parses", () => {
    for (const name of files) {
      const parsed = () => parseRegistry(JSON.parse(readFileSync(path.join(DIR, name), "utf8")));
      expect(parsed, name).not.toThrow();
    }
  });

  it("entry ids are unique across all registry files", () => {
    const ids = files.flatMap((name) =>
      parseRegistry(JSON.parse(readFileSync(path.join(DIR, name), "utf8"))).entries.map(
        (e) => e.id,
      ),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});
