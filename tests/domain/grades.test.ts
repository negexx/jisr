import { describe, expect, it } from "vitest";
import type { GradeConversion } from "@/data-schema/resolved";
import { convertGrade } from "@/domain/grades";
import { conv20to100, conv20toLower, meta } from "../fixtures/domain/builders";

const bav = (nMax: number, nMin: number, truncateDecimals: number | null): GradeConversion => ({
  slug: "xx-test-conv-bav",
  from: "xx-test-scale-src",
  to: "xx-test-scale-dst",
  conversion: { method: "modified_bavarian", params: { nMax, nMin, truncateDecimals } },
  fact: meta(),
});
const lin = (fromMin: number, fromMax: number, toMin: number, toMax: number): GradeConversion => ({
  slug: "xx-test-conv-lin",
  from: "xx-test-scale-src",
  to: "xx-test-scale-dst",
  conversion: { method: "linear", params: { fromMin, fromMax, toMin, toMax } },
  fact: meta(),
});
const src = (value: number) => ({ scale: "xx-test-scale-src", value });

describe("convertGrade", () => {
  it("same scale → same_scale, no conversion needed", () =>
    expect(convertGrade({ scale: "xx-test-scale-20", value: 14 }, "xx-test-scale-20", [])).toEqual({
      kind: "same_scale",
      value: { scale: "xx-test-scale-20", value: 14 },
    }));

  it.each([
    ["linear 0-20→0-100, 14 → 70", lin(0, 20, 0, 100), 14, 70],
    ["linear 10-20→1-5, 15 → 3", lin(10, 20, 1, 5), 15, 3],
    ["linear inverted 10-20→5-1, 15 → 3", lin(10, 20, 5, 1), 15, 3],
    ["linear inverted 10-20→5-1, 20 → 1", lin(10, 20, 5, 1), 20, 1],
    ["bavarian 20/10 d=1, 14 → 1+3·6/10 = 2.8", bav(20, 10, 1), 14, 2.8],
    ["bavarian 20/10 d=1, 17 → 1.9", bav(20, 10, 1), 17, 1.9],
    ["bavarian 20/10 d=1, 13 → 3.1", bav(20, 10, 1), 13, 3.1],
    ["bavarian 20/10 d=1, 15.5 → 2.35 truncated to 2.3 (never 2.4)", bav(20, 10, 1), 15.5, 2.3],
    ["bavarian 20/10 d=1, 12.25 → 3.325 truncated to 3.3", bav(20, 10, 1), 12.25, 3.3],
    ["bavarian 20/10 d=1, 20 → 1", bav(20, 10, 1), 20, 1],
    ["bavarian 20/10 d=1, 10 → 4", bav(20, 10, 1), 10, 4],
    [
      "bavarian 300/0 d=2, 287 → 1.13 (float guard; naive trunc can give 1.12)",
      bav(300, 0, 2),
      287,
      1.13,
    ],
  ])("%s", (_l, conv, input, expected) => {
    const r = convertGrade(src(input), "xx-test-scale-dst", [conv]);
    expect(r.kind).toBe("converted");
    if (r.kind !== "converted") return;
    expect(r.value.scale).toBe("xx-test-scale-dst");
    expect(r.value.value).toBeCloseTo(expected, 10);
    expect(r.via).toBe(conv);
  });

  it.each([
    ["bavarian 20/10 d=1, 21 (above nMax) → 0.7", 21, 0.7],
    ["bavarian 20/10 d=1, 5 (below nMin) → 5.5", 5, 5.5],
  ])("out of range passes through deterministically (range validation lives in rules.ts): %s", (_l, input, expected) => {
    const r = convertGrade(src(input), "xx-test-scale-dst", [bav(20, 10, 1)]);
    expect(r.kind === "converted" && r.value.value).toBeCloseTo(expected, 10);
  });

  it("bavarian without truncation keeps decimals: 12.25 → 3.325", () => {
    const r = convertGrade(src(12.25), "xx-test-scale-dst", [bav(20, 10, null)]);
    expect(r.kind === "converted" && r.value.value).toBeCloseTo(3.325, 10);
  });
  it("identity keeps value", () => {
    const id: GradeConversion = {
      ...lin(0, 1, 0, 1),
      conversion: { method: "identity", params: {} },
    };
    expect(convertGrade(src(7), "xx-test-scale-dst", [id])).toMatchObject({
      kind: "converted",
      value: { value: 7 },
    });
  });
  it.each([
    ["no matching conversion", [conv20to100], "xx-test-scale-src", "xx-test-scale-dst"],
    ["reverse direction only", [conv20to100], "xx-test-scale-100", "xx-test-scale-20"],
    [
      "no chaining 20→100 + 100→lower",
      [conv20to100, { ...conv20toLower, from: "xx-test-scale-100" }],
      "xx-test-scale-20",
      "xx-test-scale-lower",
    ],
    [
      "degenerate linear fromMin==fromMax",
      [lin(5, 5, 0, 1)],
      "xx-test-scale-src",
      "xx-test-scale-dst",
    ],
    ["degenerate bavarian nMax==nMin", [bav(10, 10, 1)], "xx-test-scale-src", "xx-test-scale-dst"],
  ] as const)("%s → no_conversion", (_l, convs, from, to) =>
    expect(convertGrade({ scale: from, value: 12 }, to, convs)).toEqual({ kind: "no_conversion" }));
  it("uses first matching conversion in array order", () => {
    const a = lin(0, 20, 0, 100);
    const b = { ...lin(0, 20, 0, 10), slug: "xx-test-conv-lin-b" };
    const r = convertGrade(src(10), "xx-test-scale-dst", [a, b]);
    expect(r.kind === "converted" && r.via.slug).toBe("xx-test-conv-lin");
  });
});
