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

  const entries = files.flatMap((name) =>
    parseRegistry(JSON.parse(readFileSync(path.join(DIR, name), "utf8"))).entries.map((entry) => ({
      name,
      entry,
    })),
  );
  const DATA = path.join(process.cwd(), "data");

  it("every channel entry names a channel that has a file in data/application-channels", () => {
    for (const { name, entry } of entries) {
      if (entry.fact !== "applicationChannel") continue;
      const file = path.join(DATA, "application-channels", `${entry.channel}.yaml`);
      expect(existsSync(file), `${name} ${entry.id}: channel ${entry.channel}`).toBe(true);
    }
  });

  it("every selector institution and programme exists in data", () => {
    for (const { name, entry } of entries) {
      for (const slug of entry.selector.institutions ?? [])
        expect(
          existsSync(path.join(DATA, "institutions", `${slug}.yaml`)),
          `${name} ${entry.id}: institution ${slug}`,
        ).toBe(true);
      for (const slug of entry.selector.programmes ?? [])
        expect(
          existsSync(path.join(DATA, "programs", `${slug}.yaml`)),
          `${name} ${entry.id}: programme ${slug}`,
        ).toBe(true);
    }
  });
});
