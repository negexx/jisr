// T1b audit — probes that confirm documented invariants hold (verified sound). No mutation of the
// shared EMPTY_MATCH_FILTERS constant here (that is isolated in t1b-findings.test.ts).
import { describe, expect, it } from "vitest";

import type { MatchFilters } from "@/data-schema/match-filters";
import { effectiveSelection, selectionBlock, toggleSelection } from "@/lib/journey/compare-selection";
import { EMPTY_MATCH_FILTERS, parseMatchFilters } from "@/lib/matches/filters";
import { MATCH_FILTERS_KEY, readMatchFilters, writeMatchFilters } from "@/lib/matches/filter-store";
import { decodeFilters, dropUnknownFilters } from "@/lib/matches/filter-url";
import { EMPTY_PROGRESS, parsePlanProgress, withStepDone } from "@/lib/plan/progress";
import { EMPTY_SAVED, parseSaved, type SavedProgram } from "@/lib/saved/saved";
import { resolveProgramSlug } from "@/lib/snapshot/resolve-program-slug";

import { createFakeStorage } from "../lib/profile/fake-storage";

function core() {
  return {
    kind: "core" as const,
    countries: [{ code: "XB", name: "n", currency: "XTS" }],
    fields: [{ slug: "xx-test-field", name: "n" }],
    subjects: [],
    languageCertificates: [],
    gradingScales: [],
    gradeConversions: [],
    credentialTypes: [],
    applicationChannels: [],
  };
}

const item = (slug: string): SavedProgram => ({
  slug,
  country: "XB",
  field: "xx-test-field",
  snapshotVersion: "0123456789ab",
  savedAt: "2026-10-02",
});

describe("filter wire grammar", () => {
  it("decodes an empty owned param to the default filters", () => {
    expect(decodeFilters(new URLSearchParams("type="))).toEqual(EMPTY_MATCH_FILTERS);
    expect(decodeFilters(new URLSearchParams("field="))).toEqual(EMPTY_MATCH_FILTERS);
  });

  it("keeps a well-formed value and drops an unknown one", () => {
    const known = dropUnknownFilters(
      { ...EMPTY_MATCH_FILTERS, destinations: ["QQ", "XB"] },
      core(),
    );
    expect(known.destinations).toEqual(["XB"]);
  });

  it("returns the same object when nothing was dropped", () => {
    const filters: MatchFilters = { ...EMPTY_MATCH_FILTERS, destinations: ["XB"] };
    expect(dropUnknownFilters(filters, core())).toBe(filters);
  });
});

describe("filter store", () => {
  it("round-trips a written document and refuses an invalid one", () => {
    const storage = createFakeStorage();
    writeMatchFilters(storage, { ...EMPTY_MATCH_FILTERS, destinations: ["QQ"] });
    expect(storage.raw(MATCH_FILTERS_KEY)).not.toBeNull();
    writeMatchFilters(storage, { nope: true });
    expect(readMatchFilters(storage).destinations).toEqual(["QQ"]);
  });
});

describe("parsers keep their documented repairs", () => {
  it("parseMatchFilters accepts a value equal to its Zod twin over the table", () => {
    const dup: MatchFilters = { ...EMPTY_MATCH_FILTERS, fields: ["xx-test-field", "xx-test-field"] };
    expect(parseMatchFilters(dup)?.fields).toEqual(["xx-test-field", "xx-test-field"]);
  });

  it("parseSaved drops a duplicate slug and keeps the first", () => {
    const list = parseSaved({ schemaVersion: 1, items: [item("xx-a"), item("xx-a")] });
    expect(list?.items).toEqual([item("xx-a")]);
    expect(parseSaved(EMPTY_SAVED)).toEqual(EMPTY_SAVED);
  });

  it("parsePlanProgress keeps at most fifty programmes", () => {
    const done = Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`xx-${i}`, ["visa"]]));
    expect(Object.keys(parsePlanProgress({ schemaVersion: 1, done })?.done ?? {})).toHaveLength(50);
  });

  it("withStepDone is idempotent for the same tick", () => {
    const once = withStepDone(EMPTY_PROGRESS, "xx-a", "visa", true);
    expect(withStepDone(once, "xx-a", "visa", true)).toEqual(once);
  });
});

describe("topReasons ordering invariant", () => {
  const rank = { fail: 0, unknown: 1, pass: 2 } as const;
  const reasons = (seed: number): import("@/domain/types").Reason[] => {
    const outcomes = ["fail", "unknown", "pass"] as const;
    const kinds = ["subject_taken", "coverage", "route", "manual_check"] as const;
    return Array.from({ length: seed % 8 }, (_, index) => ({
      ruleId: `r${index}`,
      kind: kinds[index % kinds.length] ?? "manual_check",
      outcome: outcomes[(seed >> index) % 3] ?? "unknown",
      code: "ok",
      facts: [],
    })) as import("@/domain/types").Reason[];
  };
  it("keeps the pinned route reason first, the coverage reason last, and never over max", async () => {
    const { topReasons } = await import("@/lib/journey/matches-view");
    for (let seed = 0; seed < 400; seed += 1) {
      const list = reasons(seed);
      const match = {
        programSlug: "p",
        status: "check" as const,
        route: "foundation" as const,
        reasons: list,
      };
      for (const max of [1, 2, 3, 5]) {
        const picked = topReasons(match, max);
        expect(new Set(picked).size, `seed ${seed} max ${max}`).toBe(picked.length);
        const unpinned = picked.filter((r) => r.kind !== "route" && r.kind !== "coverage");
        const ranks = unpinned.map((r) => rank[r.outcome]);
        expect([...ranks].sort((a, b) => a - b), `seed ${seed} max ${max}`).toEqual(ranks);
        if (picked.some((r) => r.kind === "route")) expect(picked[0]?.kind).toBe("route");
        if (picked.some((r) => r.kind === "coverage")) {
          expect(picked[picked.length - 1]?.kind).toBe("coverage");
        }
      }
    }
  });
});

describe("rehydrateOnReturn", () => {
  function fakeDocument(hidden: boolean) {
    let state: "visible" | "hidden" = hidden ? "hidden" : "visible";
    const handlers = new Set<() => void>();
    return {
      get visibilityState() {
        return state;
      },
      change(next: "visible" | "hidden") {
        state = next;
        for (const handler of [...handlers]) handler();
      },
      addEventListener: (type: string, handler: () => void) => {
        if (type === "visibilitychange") handlers.add(handler);
      },
      removeEventListener: (type: string, handler: () => void) => {
        if (type === "visibilitychange") handlers.delete(handler);
      },
    };
  }

  it("rehydrates only after more than a minute hidden, and stops on cleanup", async () => {
    const { rehydrateOnReturn, REHYDRATE_AFTER_HIDDEN_MS } = await import(
      "@/lib/account-sync/visibility"
    );
    let time = 0;
    const target = fakeDocument(false);
    let calls = 0;
    const stop = rehydrateOnReturn(target, () => time, () => {
      calls += 1;
    });

    target.change("hidden");
    time = REHYDRATE_AFTER_HIDDEN_MS;
    target.change("visible");
    expect(calls).toBe(0);

    target.change("hidden");
    time = REHYDRATE_AFTER_HIDDEN_MS * 3;
    target.change("visible");
    expect(calls).toBe(1);

    stop();
    target.change("hidden");
    time = REHYDRATE_AFTER_HIDDEN_MS * 10;
    target.change("visible");
    expect(calls).toBe(1);
  });
});

describe("slug aliases and compare selection", () => {
  it("resolveProgramSlug stops on a loop and follows a chain", () => {
    expect(resolveProgramSlug("a", { aliases: { a: "b", b: "a" } })).toBe("a");
    expect(resolveProgramSlug("a", { aliases: { a: "b", b: "c" } })).toBe("c");
  });

  it("effectiveSelection tops up to two and never exceeds four", () => {
    expect(effectiveSelection(["a", "b", "c"], ["gone"])).toEqual(["a", "b"]);
    expect(effectiveSelection(["a", "b", "c", "d", "e"], null)).toEqual(["a", "b", "c", "d"]);
    expect(selectionBlock(["a", "b"], "a")).toBe("min");
    expect(selectionBlock(["a", "b", "c", "d"], "e")).toBe("max");
    expect(toggleSelection(["a", "b", "c"], "b", ["a", "b", "c"])).toEqual(["a", "c"]);
  });
});
