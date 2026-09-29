import { CanonicalJsonError, canonicalJson } from "@scripts/data/canonical-json";
import { describe, expect, it } from "vitest";

describe("canonicalJson", () => {
  const accepted: Array<{ name: string; input: unknown; output: string }> = [
    {
      name: "sorts keys recursively and keeps array order",
      input: { b: 1, a: { d: 2, c: [3, { f: 1, e: 0 }] } },
      output: '{"a":{"c":[3,{"e":0,"f":1}],"d":2},"b":1}',
    },
    { name: "omits undefined-valued keys", input: { a: undefined, b: null }, output: '{"b":null}' },
    { name: "does not escape non-ASCII", input: "جسر", output: '"جسر"' },
    { name: "normalises negative zero", input: -0, output: "0" },
    {
      name: "sorts keys by UTF-16 code unit",
      input: { b: 1, B: 2, a: 3 },
      output: '{"B":2,"a":3,"b":1}',
    },
    { name: "empty containers", input: { a: [], b: {} }, output: '{"a":[],"b":{}}' },
  ];
  it.each(accepted)("$name", ({ input, output }) => {
    expect(canonicalJson(input)).toBe(output);
  });

  const rejected: Array<{ name: string; input: unknown }> = [
    { name: "NaN", input: Number.NaN },
    { name: "Infinity", input: Number.POSITIVE_INFINITY },
    { name: "bigint", input: BigInt(1) },
    { name: "Map", input: new Map() },
    { name: "Set", input: new Set() },
    { name: "undefined in an array", input: [undefined] },
    { name: "top-level undefined", input: undefined },
    { name: "function", input: () => 1 },
    { name: "function-valued key", input: { a: () => 1 } },
    { name: "Date", input: new Date(0) },
  ];
  it.each(rejected)("throws on $name", ({ input }) => {
    expect(() => canonicalJson(input)).toThrow(CanonicalJsonError);
  });

  it("is independent of insertion order", () => {
    expect(canonicalJson({ a: 1, b: { x: 1, y: 2 } })).toBe(
      canonicalJson({ b: { y: 2, x: 1 }, a: 1 }),
    );
  });
});
