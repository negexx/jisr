import { parseSmokeArgs } from "@scripts/ops/args";
import { describe, expect, it } from "vitest";

describe("parseSmokeArgs", () => {
  it("requires an explicit --expect flag", () => {
    expect(parseSmokeArgs(["http://localhost:3101"])).toBeNull();
    expect(parseSmokeArgs(["http://localhost:3101", "--expect=maybe"])).toBeNull();
    expect(
      parseSmokeArgs(["http://localhost:3101", "--expect=noindex", "--expect=indexable"]),
    ).toBeNull();
  });

  it("parses the mode and reduces the URL to its origin", () => {
    expect(parseSmokeArgs(["https://jisr.example/some/path/", "--expect=indexable"])).toEqual({
      baseUrl: "https://jisr.example",
      expectIndexable: true,
      minUrls: undefined,
    });
    expect(parseSmokeArgs(["--expect=noindex", "http://localhost:3101"])).toEqual({
      baseUrl: "http://localhost:3101",
      expectIndexable: false,
      minUrls: undefined,
    });
  });

  it("rejects missing, extra and non-http(s) URLs", () => {
    expect(parseSmokeArgs(["--expect=noindex"])).toBeNull();
    expect(parseSmokeArgs(["http://a.test", "http://b.test", "--expect=noindex"])).toBeNull();
    expect(parseSmokeArgs(["ftp://a.test", "--expect=noindex"])).toBeNull();
    expect(parseSmokeArgs(["not a url", "--expect=noindex"])).toBeNull();
  });

  it("accepts --min-urls only with --expect=indexable and a positive integer", () => {
    expect(
      parseSmokeArgs(["http://a.test", "--expect=indexable", "--min-urls=3400"])?.minUrls,
    ).toBe(3400);
    expect(parseSmokeArgs(["http://a.test", "--expect=noindex", "--min-urls=10"])).toBeNull();
    for (const bad of [
      "--min-urls=0",
      "--min-urls=-5",
      "--min-urls=1.5",
      "--min-urls=abc",
      "--min-urls=",
    ]) {
      expect(parseSmokeArgs(["http://a.test", "--expect=indexable", bad])).toBeNull();
    }
    expect(
      parseSmokeArgs(["http://a.test", "--expect=indexable", "--min-urls=5", "--min-urls=6"]),
    ).toBeNull();
  });

  it("rejects unknown flags", () => {
    expect(parseSmokeArgs(["http://a.test", "--expect=noindex", "--verbose"])).toBeNull();
  });
});
