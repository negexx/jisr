import { describe, expect, it } from "vitest";
import type { TextShard } from "@/data-schema/snapshot";
import { createTextLookup } from "@/lib/snapshot/text";

function shard(locale: TextShard["locale"], entries: TextShard["entries"]): TextShard {
  return { kind: "text", locale, shard: "programs.XB.f", entries };
}

describe("createTextLookup", () => {
  it("marks a French fallback", () => {
    const lookup = createTextLookup(
      [shard("en", { k: { text: "Bonjour", status: "reviewed", fallback: true } })],
      "en",
    );
    expect(lookup("k")).toEqual({ text: "Bonjour", note: "french_fallback" });
  });

  it("marks a draft outside French as machine translated", () => {
    const entries = { k: { text: "Hello", status: "draft" as const, fallback: false } };
    expect(createTextLookup([shard("en", entries)], "en")("k")?.note).toBe("machine_translated");
    expect(createTextLookup([shard("ar", entries)], "ar")("k")?.note).toBe("machine_translated");
  });

  it("shows no note on a French draft (French is the authoring language)", () => {
    const entries = { k: { text: "Bonjour", status: "draft" as const, fallback: false } };
    expect(createTextLookup([shard("fr", entries)], "fr")("k")).toEqual({
      text: "Bonjour",
      note: "none",
    });
  });

  it("shows no note on reviewed text", () => {
    const entries = { k: { text: "Hello", status: "reviewed" as const, fallback: false } };
    expect(createTextLookup([shard("en", entries)], "en")("k")?.note).toBe("none");
  });

  it("merges entries from several shards", () => {
    const lookup = createTextLookup(
      [
        shard("fr", { a: { text: "A", status: "reviewed", fallback: false } }),
        shard("fr", { b: { text: "B", status: "reviewed", fallback: false } }),
      ],
      "fr",
    );
    expect(lookup("a")?.text).toBe("A");
    expect(lookup("b")?.text).toBe("B");
  });

  it("returns undefined for an absent key and for no shards", () => {
    expect(createTextLookup([], "fr")("missing")).toBeUndefined();
    expect(createTextLookup([shard("fr", {})], "fr")("missing")).toBeUndefined();
  });
});
