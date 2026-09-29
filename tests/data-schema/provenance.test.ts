import { describe, expect, it } from "vitest";
import { z } from "zod";

import { SourcesSchema, stableFact, volatileFact } from "@/data-schema/provenance";

const FR = { fr: { text: "Base fictive", status: "draft" } };
const num = volatileFact(z.number());
const stableNum = stableFact(z.number());

describe("fact factories", () => {
  it.each([
    ["official with value", { value: 1, source: "main", info_kind: "official" }, true],
    ["explicit null value", { value: null, source: "main", info_kind: "official" }, true],
    ["missing value key", { source: "main", info_kind: "official" }, false],
    ["estimate without basis", { value: 1, source: "main", info_kind: "estimate" }, false],
    ["estimate with basis", { value: 1, source: "main", info_kind: "estimate", basis: FR }, true],
    [
      "guidance with basis (allowed)",
      { value: 1, source: "main", info_kind: "guidance", basis: FR },
      true,
    ],
    [
      "class written in YAML",
      { value: 1, source: "main", info_kind: "official", class: "stable" },
      false,
    ],
    ["unknown key", { value: 1, source: "main", info_kind: "official", url: "x" }, false],
    ["bad inner value", { value: "1", source: "main", info_kind: "official" }, false],
    ["bad info_kind", { value: 1, source: "main", info_kind: "rumour" }, false],
    ["missing source", { value: 1, info_kind: "official" }, false],
  ])("%s", (_l, input, ok) => {
    expect(num.safeParse(input).success).toBe(ok);
  });

  it.each([
    [num, "volatile"],
    [stableNum, "stable"],
  ] as const)("injects the staleness class", (schema, cls) => {
    expect(schema.parse({ value: 1, source: "main", info_kind: "official" })).toEqual({
      value: 1,
      source: "main",
      info_kind: "official",
      class: cls,
    });
  });
});

describe("SourcesSchema", () => {
  it.each([
    [{ main: { url: "https://example.org/a", last_verified_at: "2026-09-01" } }, true],
    [{}, false],
    [{ Main: { url: "https://example.org/a", last_verified_at: "2026-09-01" } }, false],
    [{ main: { url: "http://example.org/a", last_verified_at: "2026-09-01" } }, false],
    [{ main: { url: "https://example.org/a", last_verified_at: "2026-02-30" } }, false],
    [{ main: { url: "https://example.org/a" } }, false],
  ])("%j -> %s", (input, ok) => {
    expect(SourcesSchema.safeParse(input).success).toBe(ok);
  });
});
