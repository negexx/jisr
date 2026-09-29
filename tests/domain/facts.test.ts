import { describe, expect, it } from "vitest";
import type { Freshness, StalenessClass } from "@/data-schema/staleness";
import { downgrade, isDecisive, toFactRef } from "@/domain/facts";
import { daysAgo, meta, NOW } from "../fixtures/domain/builders";

const ROWS: Array<[StalenessClass, number, Freshness]> = [
  ["volatile", 0, "fresh"],
  ["volatile", 119, "fresh"],
  ["volatile", 120, "aging"],
  ["volatile", 121, "aging"],
  ["volatile", 269, "aging"],
  ["volatile", 270, "stale"],
  ["volatile", 271, "stale"],
  ["volatile", 544, "stale"],
  ["volatile", 545, "stale"],
  ["volatile", 546, "stale"],
  ["stable", 119, "fresh"],
  ["stable", 120, "fresh"],
  ["stable", 121, "fresh"],
  ["stable", 269, "fresh"],
  ["stable", 270, "aging"],
  ["stable", 271, "aging"],
  ["stable", 544, "aging"],
  ["stable", 545, "stale"],
  ["stable", 546, "stale"],
  ["stable", -5, "fresh"],
];

describe("toFactRef", () => {
  it.each(ROWS)("%s fact verified %i days ago is %s", (cls, age, expected) => {
    const m = meta({ class: cls, last_verified_at: daysAgo(age) });
    expect(toFactRef("programs/xx-test-prog", "tuition", m, NOW)).toEqual({
      record: "programs/xx-test-prog",
      path: "tuition",
      source_url: m.source_url,
      last_verified_at: m.last_verified_at,
      info_kind: "official",
      class: cls,
      freshness: expected,
    });
  });

  it.each(["estimate", "guidance"] as const)("keeps %s info_kind on the ref", (kind) => {
    expect(toFactRef("r/x", "p", meta({ info_kind: kind }), NOW).info_kind).toBe(kind);
  });

  it("keeps the record-level empty path", () => {
    expect(toFactRef("admission-routes/xx-test-route", "", meta(), NOW).path).toBe("");
  });

  it("copies basis when present", () => {
    expect(toFactRef("r/x", "p", meta({ basis: "r/x#p.basis" }), NOW).basis).toBe("r/x#p.basis");
  });

  it("omits the basis key when the fact has none", () => {
    expect(toFactRef("r/x", "p", meta(), NOW)).not.toHaveProperty("basis");
  });
});

describe("isDecisive", () => {
  const cases: Array<[string, Parameters<typeof meta>[0], boolean]> = [
    ["official fresh", {}, true],
    ["official aging (stable 270)", { last_verified_at: daysAgo(270) }, true],
    ["official stable 544", { last_verified_at: daysAgo(544) }, true],
    ["official stable 545 (stale)", { last_verified_at: daysAgo(545) }, false],
    ["official volatile 119 (fresh)", { class: "volatile", last_verified_at: daysAgo(119) }, true],
    ["official volatile 120 (aging)", { class: "volatile", last_verified_at: daysAgo(120) }, true],
    ["official volatile 269", { class: "volatile", last_verified_at: daysAgo(269) }, true],
    ["official volatile 270 (stale)", { class: "volatile", last_verified_at: daysAgo(270) }, false],
    ["estimate fresh", { info_kind: "estimate" }, false],
    ["guidance fresh", { info_kind: "guidance" }, false],
    ["estimate stale", { info_kind: "estimate", last_verified_at: daysAgo(600) }, false],
  ];
  it.each(cases)("%s -> %s", (_n, o, expected) => {
    expect(isDecisive(meta(o), NOW)).toBe(expected);
  });
});

describe("downgrade", () => {
  const f = (freshness: Freshness, info: "official" | "estimate") => ({
    ...toFactRef("r/x", "p", meta({ info_kind: info }), NOW),
    freshness,
  });
  it.each([
    ["pass all decisive", "pass", "ok", [f("fresh", "official")], "pass", "ok"],
    [
      "fail aging official stays",
      "fail",
      "below_threshold",
      [f("aging", "official")],
      "fail",
      "below_threshold",
    ],
    [
      "pass with stale",
      "pass",
      "ok",
      [f("fresh", "official"), f("stale", "official")],
      "unknown",
      "stale_source",
    ],
    [
      "fail with estimate",
      "fail",
      "below_threshold",
      [f("fresh", "estimate")],
      "unknown",
      "non_official_source",
    ],
    [
      "stale beats non-official",
      "pass",
      "ok",
      [f("fresh", "estimate"), f("stale", "official")],
      "unknown",
      "stale_source",
    ],
    [
      "unknown keeps own code",
      "unknown",
      "threshold_unpublished",
      [f("stale", "estimate")],
      "unknown",
      "threshold_unpublished",
    ],
    ["pass with no facts stays", "pass", "ok", [], "pass", "ok"],
  ] as const)("%s", (_n, outcome, code, facts, eo, ec) => {
    expect(downgrade(outcome, code, facts)).toEqual({ outcome: eo, code: ec });
  });
});
