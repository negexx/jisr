# M4a: Save a program and My Application Plan — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every UI task (T6, T7) MUST invoke `impeccable:impeccable` before writing markup, and MUST fetch Next 16 / next-intl docs with `ctx7` before using an API it has not used already in this repo.

**Goal:** A student can save programs (from a match card and from the program page), see them in "My plan", and tick off a generated checklist per saved program; everything stays in the browser.

**Architecture:** One tiny generic localStorage store (`createLocalJsonStore`, same semantics as the profile store: `useSyncExternalStore`, `storage` events, memory fallback when storage is blocked) backs two keys: `jisr.saved` (the saved list; Compare will read the same hook later) and `jisr.plan` (ticked steps by slug). `/[locale]/plan` is a static shell with one client island that loads the snapshot shards for the saved programs, runs the existing pure `generateChecklist` through a pure view model (`buildPlanView`), and renders one program at a time with a switcher. The save control is a client leaf that takes its strings as props.

**Tech Stack:** Next.js 16 App Router, React 19, next-intl, Tailwind v4 logical utilities, Vitest (jsdom per file), Playwright + axe, Biome. No new dependencies.

## Decisions from the owner (brainstorm, 2026-10-02)

1. **Save control:** labelled toggle ("Save" → "Saved", bookmark icon filled) in the match card footer next to "See details" and in the program page header; header nav gets a "My plan" link with a saved-count badge. Never icon-only; 44px tap target on phone.
2. **Storage:** `jisr.saved = { schemaVersion: 1, items: [{ slug, country, field, snapshotVersion, savedAt }] }`, max 12. (`country` and `field` are public program attributes, added because the manifest cannot map a slug to its program shard; approved.) A slug that is gone from the current snapshot shows a "no longer in our data" card with Remove; nothing is deleted silently.
3. **Plan layout:** one program at a time with a switcher (phone: a disclosure card "Program · 3 of 8 done · Change"; `lg`: an always-open left rail). The active program lives in React state only (not the URL: the host's access logs must not learn which saved program a student reads). Done = a tick on a `todo` step; `skipped` steps sit in a collapsed "Probably not needed (n)" group, never counted or auto-ticked.
4. **Compare reuse:** yes, one store + `useSaved` hook.
5. **GoatCounter events:** NOT in this PR (analytics task). Keep `toggleSaved` and the plan island mount as the single action points.

## Global Constraints

- No Zod, and no runtime import from `@/data-schema` other than `@/data-schema/dates` and `@/data-schema/staleness`, in client-reachable code. New client dirs/files MUST be added to `CLIENT_DIRECTORIES`/`CLIENT_FILES` in `tests/lib/client-imports.test.ts` (Task 1 does it); hand-written validators with fuzz tests.
- The guest stores nothing server-side; no cookies; the only storage keys are `jisr.saved` and `jisr.plan` (both cleared by the existing "Clear my data").
- All user-facing strings through next-intl in `fr`, `en`, `ar`; Tailwind logical utilities only (`ms-`, `pe-`, `text-start`, `rtl:rotate-180` on directional icons); displayed ICU arguments are preformatted strings (`displayNumber`, `formatDate`), Latin digits in `ar`; dates DD/MM/YYYY via `formatDate`.
- Program pages stay static (ADR 0006): the save button's server output is a neutral inert placeholder; nothing profile- or clock-dependent in the static HTML.
- Stale data never yields a green state: the plan shows the match group through `MatchStatusBadge` only, and every sourced step shows `SourceBadge` (official / estimate / guidance + verified date). Steps with no facts are labelled "general guidance"; they never claim to be official.
- Domain stays pure (`src/domain` is not edited). No `any`, no `@ts-ignore`, no non-null `!`. Named exports. Conventional commits with the co-author trailer. Stage by explicit path. Never commit the owner's `allowedDevOrigins` line in `next.config.ts`.
- JS budget (ADR 0007 is still Proposed; every page is over 150 KB gzip): keep new client code small, dynamic-import the plan view model, run `pnpm perf:js` and compare to the table in `.claude/docs/architecture.md`.
- Out of scope: Compare, scholarships finder, cost of living, accounts/Drizzle/auth, data pipeline, analytics events.

## File structure

| File | Responsibility |
|---|---|
| `src/lib/local-storage.ts` (new) | `KEY_PREFIX`, `StorageLike`, `removeQuietly`, `getLocalStorage` (moved out of `profile/storage.ts`, which re-exports them, so shell code does not pull the profile validators) |
| `src/lib/local-store.ts` (new) | `createLocalJsonStore<T>`: cache, `storage` event, memory fallback, `update`, `reload` |
| `src/lib/constants.ts` | `SAVED_SCHEMA_VERSION`, `PLAN_SCHEMA_VERSION`, `MAX_SAVED_PROGRAMS` |
| `src/lib/plan/progress.ts` (new) | `PlanProgress` type, `parsePlanProgress`, pure ops |
| `src/lib/plan/store.ts`, `use-plan-progress.ts` (new) | `planStore`, `setStepDone`, `forgetProgress`, hook |
| `src/lib/saved/saved.ts` (new) | `SavedProgram`/`SavedList`, `parseSaved`, pure ops |
| `src/lib/saved/store.ts`, `actions.ts`, `use-saved.ts` (new) | `savedStore`, `toggleSaved`, `removeFromPlan`, hook |
| `src/lib/local-data.ts` (new) | `clearAllLocalData()` |
| `src/components/clear-data-dialog.tsx` | calls `clearAllLocalData` |
| `src/lib/snapshot/plan.ts` | `shardsForPlan` |
| `src/lib/journey/matches-view.ts` | `MatchCardModel` gains `country`, `field`, `snapshotVersion`; export `uniqueFacts` |
| `src/lib/journey/plan-view.ts` (new) | pure `buildPlanView` (match + checklist + intake + documents per saved program) |
| `src/components/save-program-button.tsx` (new) | client leaf |
| `src/components/match-card.tsx`, `program/program-page-view.tsx`, `nav-links.tsx`, `site-header.tsx` | wiring |
| `src/components/plan/*` (new) | island, switcher, program plan, step row, skipped group, states |
| `src/app/[locale]/plan/page.tsx` (new) | static shell + nested provider |
| `messages/{en,fr,ar}.json` | `savedProgram`, `plan`, `nav.plan`, `nav.savedCount` |
| `tests/**` | mirrors the above; `tests/e2e/plan.spec.ts` (new), extended a11y/privacy/journey |

---

### Task 1: Shared storage helpers and the generic JSON store

**Files:**
- Create: `src/lib/local-storage.ts`, `src/lib/local-store.ts`
- Modify: `src/lib/profile/storage.ts:1-10` and `:70-76` and `:120-126` (import and re-export), `tests/lib/client-imports.test.ts` (client roots)
- Test: `tests/lib/local-store.test.ts`

**Interfaces:**
- Produces: `StorageLike`, `KEY_PREFIX`, `removeQuietly(storage, key)`, `getLocalStorage()` from `@/lib/local-storage` (still re-exported by `@/lib/profile/storage`); `createLocalJsonStore<T>(getStorage, { key, empty, parse })` returning `LocalJsonStore<T>`; `LocalState<T>`, `UpdateResult`.

- [ ] **Step 1: Move the helpers.** Create `src/lib/local-storage.ts`:

```ts
export const KEY_PREFIX = "jisr.";

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export function removeQuietly(storage: StorageLike, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Blocked storage: nothing was stored that we could remove.
  }
}

export function getLocalStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
```

In `src/lib/profile/storage.ts` delete the local definitions of `KEY_PREFIX`, `StorageLike`, `removeQuietly`, `getLocalStorage`, import them from `@/lib/local-storage`, and re-export them so existing imports keep working:

```ts
import { getLocalStorage, KEY_PREFIX, removeQuietly, type StorageLike } from "@/lib/local-storage";
export { getLocalStorage, KEY_PREFIX, removeQuietly, type StorageLike };
```

Run: `pnpm vitest run tests/lib/profile` — Expected: all existing profile tests PASS (no behaviour change).

- [ ] **Step 2: Write the failing store test** `tests/lib/local-store.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { isRecord } from "@/lib/guards";
import { createLocalJsonStore } from "@/lib/local-store";
import { createFakeStorage } from "./profile/fake-storage";
import { forbidConsole } from "./profile/no-console";

forbidConsole();

type Box = { n: number };
const EMPTY: Box = { n: 0 };
const options = {
  key: "jisr.test",
  empty: EMPTY,
  parse: (raw: unknown): Box | null =>
    isRecord(raw) && typeof raw.n === "number" ? { n: raw.n } : null,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createLocalJsonStore", () => {
  it("serves an unhydrated server snapshot and never touches storage for it", () => {
    const getStorage = vi.fn(() => createFakeStorage());
    const store = createLocalJsonStore(getStorage, options);
    expect(store.getServerSnapshot()).toEqual({ status: "unhydrated" });
    expect(getStorage).not.toHaveBeenCalled();
  });

  it("reads the empty value when nothing is stored, with a stable snapshot", () => {
    const store = createLocalJsonStore(() => createFakeStorage(), options);
    const first = store.getSnapshot();
    expect(first).toEqual({ status: "ready", value: EMPTY, storageAvailable: true });
    expect(store.getSnapshot()).toBe(first);
  });

  it("reads a stored value", () => {
    const storage = createFakeStorage();
    storage.seed("jisr.test", JSON.stringify({ n: 4 }));
    const store = createLocalJsonStore(() => storage, options);
    expect(store.getSnapshot()).toMatchObject({ status: "ready", value: { n: 4 } });
  });

  it("update persists JSON, replaces the snapshot and notifies subscribers", () => {
    const storage = createFakeStorage();
    const store = createLocalJsonStore(() => storage, options);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const before = store.getSnapshot();
    expect(store.update((box) => ({ n: box.n + 1 }))).toEqual({ ok: true, persisted: true });
    expect(storage.raw("jisr.test")).toBe(JSON.stringify({ n: 1 }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).not.toBe(before);
    expect(store.getSnapshot()).toMatchObject({ value: { n: 1 } });
    unsubscribe();
  });

  it("removes stored JSON that is not valid and falls back to empty", () => {
    const storage = createFakeStorage();
    storage.seed("jisr.test", "{not json");
    const store = createLocalJsonStore(() => storage, options);
    expect(store.getSnapshot()).toMatchObject({ value: EMPTY });
    expect(storage.raw("jisr.test")).toBeNull();
    const stable = store.getSnapshot();
    expect(store.getSnapshot()).toBe(stable);
  });

  it("removes stored JSON the parser rejects", () => {
    const storage = createFakeStorage();
    storage.seed("jisr.test", JSON.stringify({ n: "x" }));
    const store = createLocalJsonStore(() => storage, options);
    expect(store.getSnapshot()).toMatchObject({ value: EMPTY });
    expect(storage.raw("jisr.test")).toBeNull();
  });

  it("refuses an update the parser rejects and leaves storage alone", () => {
    const storage = createFakeStorage();
    const store = createLocalJsonStore(() => storage, options);
    expect(store.update(() => ({ n: Number.NaN }))).toEqual({ ok: true, persisted: true });
    // NaN serialises to null, so the parser must have rejected it before the write:
    const strict = createLocalJsonStore(() => storage, {
      ...options,
      parse: (raw: unknown) => (isRecord(raw) && typeof raw.n === "number" && raw.n >= 0 ? { n: raw.n } : null),
    });
    expect(strict.update(() => ({ n: -1 }))).toEqual({ ok: false });
  });

  it("keeps the value in memory when the write fails", () => {
    const storage = createFakeStorage({ set: true });
    const store = createLocalJsonStore(() => storage, options);
    expect(store.update(() => ({ n: 2 }))).toEqual({ ok: true, persisted: false });
    expect(store.getSnapshot()).toEqual({
      status: "ready",
      value: { n: 2 },
      storageAvailable: false,
    });
  });

  it("works from memory when storage cannot be read", () => {
    const storage = createFakeStorage({ get: true, set: true });
    const store = createLocalJsonStore(() => storage, options);
    expect(store.getSnapshot()).toMatchObject({ value: EMPTY, storageAvailable: false });
    store.update(() => ({ n: 3 }));
    expect(store.getSnapshot()).toMatchObject({ value: { n: 3 }, storageAvailable: false });
  });

  it("re-reads on a storage event for its key and ignores other keys", () => {
    const storage = createFakeStorage();
    const store = createLocalJsonStore(() => storage, options);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    storage.seed("jisr.test", JSON.stringify({ n: 9 }));
    window.dispatchEvent(new StorageEvent("storage", { key: "jisr.other" }));
    expect(listener).not.toHaveBeenCalled();
    window.dispatchEvent(new StorageEvent("storage", { key: "jisr.test" }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toMatchObject({ value: { n: 9 } });
    unsubscribe();
  });

  it("reload picks up an external removal and notifies", () => {
    const storage = createFakeStorage();
    const store = createLocalJsonStore(() => storage, options);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.update(() => ({ n: 5 }));
    listener.mockClear();
    storage.removeItem("jisr.test");
    store.reload();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toMatchObject({ value: EMPTY });
    unsubscribe();
  });
});
```

(The "refuses an update" test's first assertion documents that `update` runs `parse` on the new value; keep both halves.)

- [ ] **Step 3: Run it to verify it fails.** Run: `pnpm vitest run tests/lib/local-store.test.ts` — Expected: FAIL, `Cannot find module '@/lib/local-store'`.

- [ ] **Step 4: Implement** `src/lib/local-store.ts`:

```ts
import { removeQuietly, type StorageLike } from "./local-storage";

// `storageAvailable` means "this device can reliably read and write local storage", not "the last
// update was persisted" (`update()` returns `persisted` for that).
export type LocalState<T> =
  | { status: "unhydrated" }
  | { status: "ready"; value: T; storageAvailable: boolean };

export type UpdateResult = { ok: true; persisted: boolean } | { ok: false };

export type LocalJsonStore<T> = {
  getSnapshot: () => LocalState<T>;
  getServerSnapshot: () => LocalState<T>;
  subscribe: (listener: () => void) => () => void;
  update: (change: (current: T) => T) => UpdateResult;
  // Re-reads storage after something outside the store changed it (clear my data).
  reload: () => void;
};

export type LocalJsonOptions<T> = {
  key: string;
  empty: T;
  // Normalises a value (stored or about to be written); null means "not acceptable".
  parse: (raw: unknown) => T | null;
};

const UNHYDRATED: LocalState<never> = { status: "unhydrated" };

// Same semantics as the profile store: the server snapshot is `unhydrated` so the first client
// render matches the server HTML; a same-tab write fires no `storage` event, so writes go through
// `update`, which refreshes and notifies itself.
export function createLocalJsonStore<T>(
  getStorage: () => StorageLike | null,
  options: LocalJsonOptions<T>,
): LocalJsonStore<T> {
  const { key, empty, parse } = options;
  const listeners = new Set<() => void>();
  let current: LocalState<T> | null = null;
  let currentEvidence = "";
  // A value the device would not persist (blocked storage, quota) stays usable from memory.
  let memory: { value: T } | null = null;
  let writeFailed = false;
  let version = 0;

  function resolveStorage(): StorageLike | null {
    try {
      return getStorage();
    } catch {
      return null;
    }
  }

  function read(): { state: LocalState<T>; evidence: string } {
    const storage = resolveStorage();
    let raw: string | null = null;
    let readable = storage !== null;
    if (storage) {
      try {
        raw = storage.getItem(key);
      } catch {
        readable = false;
      }
    }
    const storageAvailable = readable && !writeFailed;
    if (memory !== null && !storageAvailable) {
      return {
        state: { status: "ready", value: memory.value, storageAvailable },
        evidence: `memory|${version}`,
      };
    }
    if (!readable || storage === null) {
      return {
        state: { status: "ready", value: empty, storageAvailable: false },
        evidence: "unreadable",
      };
    }
    // Storage is readable and holds the last write: it is authoritative again.
    memory = null;
    let value = empty;
    let usable = raw !== null;
    if (raw !== null) {
      let parsed: T | null = null;
      try {
        parsed = parse(JSON.parse(raw));
      } catch {
        parsed = null;
      }
      if (parsed === null) {
        removeQuietly(storage, key);
        usable = false;
      } else {
        value = parsed;
      }
    }
    return {
      state: { status: "ready", value, storageAvailable },
      evidence: `${storageAvailable}|${usable ? raw : ""}`,
    };
  }

  function refresh(): void {
    const next = read();
    if (current !== null && next.evidence === currentEvidence) return;
    current = next.state;
    currentEvidence = next.evidence;
  }

  function notify(): void {
    for (const listener of [...listeners]) listener();
  }

  function onStorageEvent(event: StorageEvent): void {
    if (event.key !== null && event.key !== key) return;
    if (event.storageArea !== null && event.storageArea !== resolveStorage()) return;
    memory = null;
    writeFailed = false;
    refresh();
    notify();
  }

  return {
    getSnapshot() {
      // With no subscriber no storage event keeps the cache fresh, and React reads the snapshot in
      // the first render, before `subscribe` runs, so re-read here (the object is kept if unchanged).
      if (current === null || listeners.size === 0) refresh();
      return current ?? UNHYDRATED;
    },
    getServerSnapshot: () => UNHYDRATED,
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) {
        refresh();
        if (typeof window !== "undefined") window.addEventListener("storage", onStorageEvent);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && typeof window !== "undefined") {
          window.removeEventListener("storage", onStorageEvent);
        }
      };
    },
    update(change) {
      refresh();
      const base = current !== null && current.status === "ready" ? current.value : empty;
      const next = parse(change(base));
      if (next === null) return { ok: false };
      const storage = resolveStorage();
      let persisted = false;
      if (storage) {
        try {
          storage.setItem(key, JSON.stringify(next));
          persisted = true;
        } catch {
          persisted = false;
        }
        // Removed best-effort so a reload cannot bring back the older value this one replaced.
        if (!persisted) removeQuietly(storage, key);
      }
      memory = { value: next };
      writeFailed = !persisted;
      version += 1;
      refresh();
      notify();
      return { ok: true, persisted };
    },
    reload() {
      memory = null;
      writeFailed = false;
      version += 1;
      refresh();
      notify();
    },
  };
}
```

- [ ] **Step 5: Register the new client code with the import guard.** In `tests/lib/client-imports.test.ts` add to `CLIENT_DIRECTORIES`: `path.join("lib", "saved")`, `path.join("lib", "plan")`; to `CLIENT_FILES`: `path.join("lib", "local-storage.ts")`, `path.join("lib", "local-store.ts")`, `path.join("lib", "local-data.ts")`.

- [ ] **Step 6: Run and verify.** `pnpm vitest run tests/lib/local-store.test.ts tests/lib/profile tests/lib/client-imports.test.ts` — Expected: PASS. If the "stable snapshot after invalid JSON" assertion fails, the evidence for an unusable value must be `${storageAvailable}|` (empty) as written.

- [ ] **Step 7: Commit.**

```bash
git add src/lib/local-storage.ts src/lib/local-store.ts src/lib/profile/storage.ts tests/lib/local-store.test.ts tests/lib/client-imports.test.ts
git commit -m "feat: generic local JSON store shared by the saved list and the plan progress"
```

---

### Task 2: Plan progress (ticked steps)

**Files:**
- Modify: `src/lib/constants.ts` (append constants)
- Create: `src/lib/plan/progress.ts`, `src/lib/plan/store.ts`, `src/lib/plan/use-plan-progress.ts`
- Test: `tests/lib/plan/progress.test.ts`, `tests/lib/plan/use-plan-progress.test.tsx`

**Interfaces:**
- Consumes: `createLocalJsonStore`, `getLocalStorage`, `CHECKLIST_STEP_IDS`/`ChecklistStepId` from `@/domain/types`.
- Produces: `PLAN_KEY = "jisr.plan"`, `type PlanProgress = { schemaVersion: 1; done: Record<string, ChecklistStepId[]> }`, `EMPTY_PROGRESS`, `parsePlanProgress(raw: unknown): PlanProgress | null`, `doneSteps(progress, slug): readonly ChecklistStepId[]`, `withStepDone(progress, slug, step, done): PlanProgress`, `withoutProgram(progress, slug): PlanProgress`; `planStore`, `setStepDone(slug, step, done): void`, `forgetProgress(slug): void`; `usePlanProgress(): { hydrated: boolean; doneSteps(slug): readonly ChecklistStepId[]; setDone(slug, step, done): void }`.

- [ ] **Step 1: Constants.** Append to `src/lib/constants.ts`:

```ts
export const SAVED_SCHEMA_VERSION = 1;
export const PLAN_SCHEMA_VERSION = 1;
export const MAX_SAVED_PROGRAMS = 12;
```

- [ ] **Step 2: Write the failing tests** `tests/lib/plan/progress.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  doneSteps,
  EMPTY_PROGRESS,
  parsePlanProgress,
  withoutProgram,
  withStepDone,
} from "@/lib/plan/progress";

describe("parsePlanProgress", () => {
  it("accepts the empty record and a normal one", () => {
    expect(parsePlanProgress({ schemaVersion: 1, done: {} })).toEqual(EMPTY_PROGRESS);
    expect(
      parsePlanProgress({ schemaVersion: 1, done: { "xx-prog": ["visa", "documents"] } }),
    ).toEqual({ schemaVersion: 1, done: { "xx-prog": ["documents", "visa"] } });
  });

  it("rejects anything that is not the expected shape", () => {
    for (const bad of [
      null,
      [],
      "x",
      { schemaVersion: 2, done: {} },
      { schemaVersion: 1 },
      { schemaVersion: 1, done: [] },
      { schemaVersion: 1, done: {}, extra: true },
    ]) {
      expect(parsePlanProgress(bad)).toBeNull();
    }
  });

  it("drops unknown step ids, duplicates, bad slugs and empty lists", () => {
    expect(
      parsePlanProgress({
        schemaVersion: 1,
        done: {
          "xx-prog": ["visa", "visa", "nope", 3],
          "Bad Slug": ["visa"],
          "xx-empty": [],
          "xx-notlist": "visa",
        },
      }),
    ).toEqual({ schemaVersion: 1, done: { "xx-prog": ["visa"] } });
  });

  it("never throws on arbitrary input", () => {
    const samples: unknown[] = [undefined, 1, true, {}, { schemaVersion: 1, done: { "__proto__": ["visa"] } }];
    for (const sample of samples) expect(() => parsePlanProgress(sample)).not.toThrow();
  });
});

describe("pure operations", () => {
  it("reads a slug named like an Object property without inheriting", () => {
    expect(doneSteps(EMPTY_PROGRESS, "constructor")).toEqual([]);
  });

  it("ticks and unticks a step, keeping steps in checklist order", () => {
    let progress = withStepDone(EMPTY_PROGRESS, "xx-prog", "visa", true);
    progress = withStepDone(progress, "xx-prog", "documents", true);
    expect(doneSteps(progress, "xx-prog")).toEqual(["documents", "visa"]);
    progress = withStepDone(progress, "xx-prog", "visa", false);
    expect(doneSteps(progress, "xx-prog")).toEqual(["documents"]);
    progress = withStepDone(progress, "xx-prog", "documents", false);
    expect(progress).toEqual(EMPTY_PROGRESS);
  });

  it("forgets one program only", () => {
    let progress = withStepDone(EMPTY_PROGRESS, "xx-a", "visa", true);
    progress = withStepDone(progress, "xx-b", "visa", true);
    expect(withoutProgram(progress, "xx-a")).toEqual({
      schemaVersion: 1,
      done: { "xx-b": ["visa"] },
    });
  });
});
```

`tests/lib/plan/use-plan-progress.test.tsx` (jsdom; uses the real module store with `window.localStorage`, pattern from `tests/lib/profile/store.test.tsx` `loadHookModules`):

```tsx
// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PLAN_KEY } from "@/lib/plan/progress";

async function load() {
  vi.resetModules();
  return import("@/lib/plan/use-plan-progress");
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("usePlanProgress", () => {
  it("starts empty, ticks a step, persists it and survives a fresh module (reload)", async () => {
    const { usePlanProgress } = await load();
    const { result } = renderHook(() => usePlanProgress());
    expect(result.current.hydrated).toBe(true);
    expect(result.current.doneSteps("xx-prog")).toEqual([]);
    act(() => result.current.setDone("xx-prog", "documents", true));
    expect(result.current.doneSteps("xx-prog")).toEqual(["documents"]);
    expect(JSON.parse(window.localStorage.getItem(PLAN_KEY) ?? "null")).toEqual({
      schemaVersion: 1,
      done: { "xx-prog": ["documents"] },
    });
    cleanup();
    const again = await load();
    const second = renderHook(() => again.usePlanProgress());
    expect(second.result.current.doneSteps("xx-prog")).toEqual(["documents"]);
  });
});
```

- [ ] **Step 3: Run to verify failure.** `pnpm vitest run tests/lib/plan` — Expected: FAIL (modules missing).

- [ ] **Step 4: Implement** `src/lib/plan/progress.ts`:

```ts
import { CHECKLIST_STEP_IDS, type ChecklistStepId } from "@/domain/types";
import { PLAN_SCHEMA_VERSION } from "@/lib/constants";
import { hasOnlyKeys, isPlainObject, isRecord, isOneOf, matches } from "@/lib/guards";

export const PLAN_KEY = "jisr.plan";

// slug -> ticked step ids (checklist order, no duplicates, never empty). A ticked step is "done".
export type PlanProgress = { schemaVersion: 1; done: Record<string, ChecklistStepId[]> };

export const EMPTY_PROGRESS: PlanProgress = { schemaVersion: PLAN_SCHEMA_VERSION, done: {} };

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_PROGRAMS = 50;

function ordered(steps: Iterable<ChecklistStepId>): ChecklistStepId[] {
  const set = new Set(steps);
  return CHECKLIST_STEP_IDS.filter((id) => set.has(id));
}

export function parsePlanProgress(raw: unknown): PlanProgress | null {
  if (!isRecord(raw) || !hasOnlyKeys(raw, ["schemaVersion", "done"])) return null;
  if (raw.schemaVersion !== PLAN_SCHEMA_VERSION || !isPlainObject(raw.done)) return null;
  const done: Record<string, ChecklistStepId[]> = {};
  for (const slug of Object.keys(raw.done)) {
    if (Object.keys(done).length >= MAX_PROGRAMS) break;
    const value = raw.done[slug];
    if (!matches(slug, SLUG) || !Array.isArray(value)) continue;
    const steps = ordered(
      value.flatMap((step): ChecklistStepId[] =>
        isOneOf(step, CHECKLIST_STEP_IDS) ? [step] : [],
      ),
    );
    if (steps.length > 0) done[slug] = steps;
  }
  return { schemaVersion: PLAN_SCHEMA_VERSION, done };
}

export function doneSteps(progress: PlanProgress, slug: string): readonly ChecklistStepId[] {
  return Object.hasOwn(progress.done, slug) ? (progress.done[slug] ?? []) : [];
}

export function withStepDone(
  progress: PlanProgress,
  slug: string,
  step: ChecklistStepId,
  done: boolean,
): PlanProgress {
  const current = new Set(doneSteps(progress, slug));
  if (done) current.add(step);
  else current.delete(step);
  const { [slug]: _removed, ...rest } = progress.done;
  const next = ordered(current);
  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    done: next.length > 0 ? { ...rest, [slug]: next } : rest,
  };
}

export function withoutProgram(progress: PlanProgress, slug: string): PlanProgress {
  const { [slug]: _removed, ...rest } = progress.done;
  return { schemaVersion: PLAN_SCHEMA_VERSION, done: rest };
}
```

Note: if Biome flags the unused `_removed` destructure, replace with a filtered `Object.fromEntries(Object.entries(progress.done).filter(([key]) => key !== slug))`.

`src/lib/plan/store.ts`:

```ts
import type { ChecklistStepId } from "@/domain/types";
import { getLocalStorage } from "@/lib/local-storage";
import { createLocalJsonStore } from "@/lib/local-store";

import { EMPTY_PROGRESS, PLAN_KEY, parsePlanProgress, withoutProgram, withStepDone } from "./progress";

export const planStore = createLocalJsonStore(getLocalStorage, {
  key: PLAN_KEY,
  empty: EMPTY_PROGRESS,
  parse: parsePlanProgress,
});

export function setStepDone(slug: string, step: ChecklistStepId, done: boolean): void {
  planStore.update((progress) => withStepDone(progress, slug, step, done));
}

export function forgetProgress(slug: string): void {
  planStore.update((progress) => withoutProgram(progress, slug));
}
```

`src/lib/plan/use-plan-progress.ts`:

```ts
"use client";

import { useMemo, useSyncExternalStore } from "react";

import type { ChecklistStepId } from "@/domain/types";

import { doneSteps as doneStepsOf, EMPTY_PROGRESS } from "./progress";
import { planStore, setStepDone } from "./store";

export type UsePlanProgress = {
  hydrated: boolean;
  doneSteps: (slug: string) => readonly ChecklistStepId[];
  setDone: (slug: string, step: ChecklistStepId, done: boolean) => void;
};

export function usePlanProgress(): UsePlanProgress {
  const state = useSyncExternalStore(
    planStore.subscribe,
    planStore.getSnapshot,
    planStore.getServerSnapshot,
  );
  return useMemo(() => {
    const progress = state.status === "ready" ? state.value : EMPTY_PROGRESS;
    return {
      hydrated: state.status === "ready",
      doneSteps: (slug) => doneStepsOf(progress, slug),
      setDone: setStepDone,
    };
  }, [state]);
}
```

- [ ] **Step 5: Run to verify pass.** `pnpm vitest run tests/lib/plan tests/lib/client-imports.test.ts` — Expected: PASS. Then `pnpm typecheck` — Expected: clean.

- [ ] **Step 6: Commit.**

```bash
git add src/lib/constants.ts src/lib/plan tests/lib/plan
git commit -m "feat: plan progress store for ticked checklist steps"
```

---

### Task 3: Saved list, toggle action, hook and "clear all"

**Files:**
- Create: `src/lib/saved/saved.ts`, `src/lib/saved/store.ts`, `src/lib/saved/actions.ts`, `src/lib/saved/use-saved.ts`, `src/lib/local-data.ts`
- Modify: `src/components/clear-data-dialog.tsx:18` (import) and `:46` (call)
- Test: `tests/lib/saved/saved.test.ts`, `tests/lib/saved/actions.test.ts`, `tests/lib/saved/use-saved.test.tsx`, `tests/lib/local-data.test.tsx`, update `tests/components/clear-data-button.test.tsx` if it asserts `profileStore.clear`

**Interfaces:**
- Consumes: Task 1 store, Task 2 `forgetProgress`, `planStore`.
- Produces: `type SavedProgram = { slug; country; field; snapshotVersion: string; savedAt: IsoDate }`, `type SavedList = { schemaVersion: 1; items: SavedProgram[] }`, `SAVED_KEY = "jisr.saved"`, `EMPTY_SAVED`, `parseSaved`, `addSaved(list, item): SavedList | null` (null when full), `removeSaved(list, slug)`, `isSavedSlug(list, slug)`; `savedStore`; `type SavedRef = { slug: string; country: string; field: string }`; `type ToggleResult = { ok: true; saved: boolean; persisted: boolean } | { ok: false; reason: "full" }`; `toggleSaved(store, ref, snapshotVersion, today, onRemoved?)`; `removeFromPlan(slug)`; `useSaved(): UseSaved` where `UseSaved = { hydrated: boolean; items: readonly SavedProgram[]; storageAvailable: boolean; isSaved(slug): boolean; toggle(ref: SavedRef, snapshotVersion: string): ToggleResult; remove(slug): void }`; `clearAllLocalData(): void`.

- [ ] **Step 1: Write the failing pure tests** `tests/lib/saved/saved.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { MAX_SAVED_PROGRAMS } from "@/lib/constants";
import {
  addSaved,
  EMPTY_SAVED,
  isSavedSlug,
  parseSaved,
  removeSaved,
  type SavedProgram,
} from "@/lib/saved/saved";

const item = (slug: string): SavedProgram => ({
  slug,
  country: "FR",
  field: "computer-science",
  snapshotVersion: "0123456789ab",
  savedAt: "2026-10-02",
});

describe("parseSaved", () => {
  it("accepts the empty list and a normal one", () => {
    expect(parseSaved({ schemaVersion: 1, items: [] })).toEqual(EMPTY_SAVED);
    expect(parseSaved({ schemaVersion: 1, items: [item("xx-a"), item("xx-b")] })).toEqual({
      schemaVersion: 1,
      items: [item("xx-a"), item("xx-b")],
    });
  });

  it("rejects a wrong shape or version", () => {
    for (const bad of [null, [], 3, { schemaVersion: 2, items: [] }, { schemaVersion: 1 }, { schemaVersion: 1, items: {} }, { schemaVersion: 1, items: [], x: 1 }]) {
      expect(parseSaved(bad)).toBeNull();
    }
  });

  it("drops invalid and duplicate items and caps the list", () => {
    const many = Array.from({ length: MAX_SAVED_PROGRAMS + 3 }, (_, i) => item(`xx-p${i}`));
    expect(
      parseSaved({
        schemaVersion: 1,
        items: [
          item("xx-a"),
          item("xx-a"),
          { ...item("xx-b"), savedAt: "2026-02-30" },
          { ...item("xx-c"), country: "fr" },
          { ...item("xx-d"), snapshotVersion: "short" },
          { ...item("xx-e"), extra: 1 },
          "nope",
        ],
      }),
    ).toEqual({ schemaVersion: 1, items: [item("xx-a")] });
    expect(parseSaved({ schemaVersion: 1, items: many })?.items).toHaveLength(MAX_SAVED_PROGRAMS);
  });
});

describe("pure operations", () => {
  it("adds, ignores a duplicate, refuses when full and removes", () => {
    const one = addSaved(EMPTY_SAVED, item("xx-a"));
    expect(one?.items.map((i) => i.slug)).toEqual(["xx-a"]);
    expect(addSaved(one ?? EMPTY_SAVED, item("xx-a"))).toEqual(one);
    const full = { schemaVersion: 1 as const, items: Array.from({ length: MAX_SAVED_PROGRAMS }, (_, i) => item(`xx-p${i}`)) };
    expect(addSaved(full, item("xx-new"))).toBeNull();
    expect(isSavedSlug(full, "xx-p3")).toBe(true);
    expect(removeSaved(full, "xx-p3").items).toHaveLength(MAX_SAVED_PROGRAMS - 1);
  });
});
```

`tests/lib/saved/actions.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { MAX_SAVED_PROGRAMS } from "@/lib/constants";
import { createLocalJsonStore } from "@/lib/local-store";
import { toggleSaved } from "@/lib/saved/actions";
import { EMPTY_SAVED, isSavedSlug, parseSaved, SAVED_KEY } from "@/lib/saved/saved";
import { createFakeStorage } from "../profile/fake-storage";

const make = () => {
  const storage = createFakeStorage();
  const store = createLocalJsonStore(() => storage, { key: SAVED_KEY, empty: EMPTY_SAVED, parse: parseSaved });
  return { storage, store };
};
const ref = (slug: string) => ({ slug, country: "FR", field: "computer-science" });
const list = (store: ReturnType<typeof make>["store"]) => {
  const s = store.getSnapshot();
  return s.status === "ready" ? s.value : EMPTY_SAVED;
};

describe("toggleSaved", () => {
  it("saves with the snapshot version and date, then unsaves and reports the removal", () => {
    const { store } = make();
    const onRemoved = vi.fn();
    expect(toggleSaved(store, ref("xx-a"), "0123456789ab", "2026-10-02", onRemoved)).toEqual({ ok: true, saved: true, persisted: true });
    expect(list(store).items).toEqual([{ ...ref("xx-a"), snapshotVersion: "0123456789ab", savedAt: "2026-10-02" }]);
    expect(onRemoved).not.toHaveBeenCalled();
    expect(toggleSaved(store, ref("xx-a"), "0123456789ab", "2026-10-02", onRemoved)).toEqual({ ok: true, saved: false, persisted: true });
    expect(isSavedSlug(list(store), "xx-a")).toBe(false);
    expect(onRemoved).toHaveBeenCalledWith("xx-a");
  });

  it("refuses a new program when the list is full but still unsaves an existing one", () => {
    const { store } = make();
    for (let i = 0; i < MAX_SAVED_PROGRAMS; i += 1) toggleSaved(store, ref(`xx-p${i}`), "0123456789ab", "2026-10-02");
    expect(toggleSaved(store, ref("xx-new"), "0123456789ab", "2026-10-02")).toEqual({ ok: false, reason: "full" });
    expect(toggleSaved(store, ref("xx-p0"), "0123456789ab", "2026-10-02")).toMatchObject({ ok: true, saved: false });
  });

  it("reports saved: false when the reference is not acceptable", () => {
    const { store } = make();
    expect(toggleSaved(store, { slug: "Not A Slug", country: "FR", field: "x" }, "0123456789ab", "2026-10-02")).toMatchObject({ ok: true, saved: false });
  });
});
```

`tests/lib/saved/use-saved.test.tsx` (real module store; checks hydration, `isSaved`, `toggle` also forgets progress, and cross-hook sync) — write:

```tsx
// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PLAN_KEY } from "@/lib/plan/progress";
import { SAVED_KEY } from "@/lib/saved/saved";

async function load() {
  vi.resetModules();
  const [saved, plan] = await Promise.all([import("@/lib/saved/use-saved"), import("@/lib/plan/store")]);
  return { useSaved: saved.useSaved, setStepDone: plan.setStepDone };
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const ref = { slug: "xx-a", country: "FR", field: "computer-science" };

describe("useSaved", () => {
  it("saves, persists, shares state between hooks and survives a reload", async () => {
    const { useSaved } = await load();
    const a = renderHook(() => useSaved());
    const b = renderHook(() => useSaved());
    expect(a.result.current.hydrated).toBe(true);
    expect(a.result.current.isSaved("xx-a")).toBe(false);
    act(() => {
      a.result.current.toggle(ref, "0123456789ab");
    });
    expect(a.result.current.isSaved("xx-a")).toBe(true);
    expect(b.result.current.items.map((i) => i.slug)).toEqual(["xx-a"]);
    expect(JSON.parse(window.localStorage.getItem(SAVED_KEY) ?? "null").items).toHaveLength(1);
    cleanup();
    const again = await load();
    const c = renderHook(() => again.useSaved());
    expect(c.result.current.isSaved("xx-a")).toBe(true);
  });

  it("forgets the ticked steps when the program is unsaved or removed", async () => {
    const { useSaved, setStepDone } = await load();
    const { result } = renderHook(() => useSaved());
    act(() => {
      result.current.toggle(ref, "0123456789ab");
      setStepDone("xx-a", "visa", true);
    });
    expect(window.localStorage.getItem(PLAN_KEY)).toContain("xx-a");
    act(() => {
      result.current.remove("xx-a");
    });
    expect(result.current.isSaved("xx-a")).toBe(false);
    expect(window.localStorage.getItem(PLAN_KEY)).not.toContain("xx-a");
  });
});
```

`tests/lib/local-data.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("clearAllLocalData", () => {
  it("empties the profile, the saved list and the plan progress, and the hooks notice at once", async () => {
    vi.resetModules();
    const [{ useSaved }, { usePlanProgress }, { clearAllLocalData }] = await Promise.all([
      import("@/lib/saved/use-saved"),
      import("@/lib/plan/use-plan-progress"),
      import("@/lib/local-data"),
    ]);
    const saved = renderHook(() => useSaved());
    const progress = renderHook(() => usePlanProgress());
    act(() => {
      saved.result.current.toggle({ slug: "xx-a", country: "FR", field: "computer-science" }, "0123456789ab");
      progress.result.current.setDone("xx-a", "visa", true);
    });
    window.localStorage.setItem("unrelated", "keep");
    act(() => clearAllLocalData());
    expect(saved.result.current.items).toEqual([]);
    expect(progress.result.current.doneSteps("xx-a")).toEqual([]);
    expect(window.localStorage.getItem("unrelated")).toBe("keep");
    expect(Object.keys(window.localStorage).filter((k) => k.startsWith("jisr."))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure.** `pnpm vitest run tests/lib/saved tests/lib/local-data.test.tsx` — Expected: FAIL (modules missing).

- [ ] **Step 3: Implement** `src/lib/saved/saved.ts`:

```ts
import { isValidIsoDate } from "@/data-schema/dates";
import type { IsoDate } from "@/data-schema/dates";
import { MAX_SAVED_PROGRAMS, SAVED_SCHEMA_VERSION } from "@/lib/constants";
import { hasOnlyKeys, isRecord, matches } from "@/lib/guards";

export const SAVED_KEY = "jisr.saved";

// country and field are public program attributes: the manifest cannot map a slug to its program
// shard, so the plan page needs them to know which shard to load.
export type SavedProgram = {
  slug: string;
  country: string;
  field: string;
  snapshotVersion: string;
  savedAt: IsoDate;
};
export type SavedList = { schemaVersion: 1; items: SavedProgram[] };

export const EMPTY_SAVED: SavedList = { schemaVersion: SAVED_SCHEMA_VERSION, items: [] };

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COUNTRY = /^[A-Z]{2}$/;
const VERSION = /^[0-9a-f]{12}$/;

function parseItem(value: unknown): SavedProgram | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["slug", "country", "field", "snapshotVersion", "savedAt"])
  ) {
    return null;
  }
  const { slug, country, field, snapshotVersion, savedAt } = value;
  if (
    !matches(slug, SLUG) ||
    !matches(country, COUNTRY) ||
    !matches(field, SLUG) ||
    !matches(snapshotVersion, VERSION) ||
    typeof savedAt !== "string" ||
    !isValidIsoDate(savedAt)
  ) {
    return null;
  }
  return { slug, country, field, snapshotVersion, savedAt };
}

// Bad items are dropped, not fatal: one corrupt entry must not lose the student's whole list.
export function parseSaved(raw: unknown): SavedList | null {
  if (!isRecord(raw) || !hasOnlyKeys(raw, ["schemaVersion", "items"])) return null;
  if (raw.schemaVersion !== SAVED_SCHEMA_VERSION || !Array.isArray(raw.items)) return null;
  const seen = new Set<string>();
  const items: SavedProgram[] = [];
  for (let index = 0; index < raw.items.length && items.length < MAX_SAVED_PROGRAMS; index += 1) {
    const item = parseItem(raw.items[index]);
    if (item === null || seen.has(item.slug)) continue;
    seen.add(item.slug);
    items.push(item);
  }
  return { schemaVersion: SAVED_SCHEMA_VERSION, items };
}

export function isSavedSlug(list: SavedList, slug: string): boolean {
  return list.items.some((item) => item.slug === slug);
}

// null: the list is full (a duplicate is returned unchanged).
export function addSaved(list: SavedList, item: SavedProgram): SavedList | null {
  if (isSavedSlug(list, item.slug)) return list;
  if (list.items.length >= MAX_SAVED_PROGRAMS) return null;
  return { schemaVersion: SAVED_SCHEMA_VERSION, items: [...list.items, item] };
}

export function removeSaved(list: SavedList, slug: string): SavedList {
  return {
    schemaVersion: SAVED_SCHEMA_VERSION,
    items: list.items.filter((item) => item.slug !== slug),
  };
}
```

`src/lib/saved/store.ts`:

```ts
import { getLocalStorage } from "@/lib/local-storage";
import { createLocalJsonStore } from "@/lib/local-store";

import { EMPTY_SAVED, parseSaved, SAVED_KEY } from "./saved";

export const savedStore = createLocalJsonStore(getLocalStorage, {
  key: SAVED_KEY,
  empty: EMPTY_SAVED,
  parse: parseSaved,
});
```

`src/lib/saved/actions.ts`:

```ts
import type { IsoDate } from "@/data-schema/dates";
import { MAX_SAVED_PROGRAMS } from "@/lib/constants";
import type { LocalJsonStore } from "@/lib/local-store";
import { forgetProgress } from "@/lib/plan/store";

import { addSaved, EMPTY_SAVED, isSavedSlug, removeSaved, type SavedList } from "./saved";
import { savedStore } from "./store";

export type SavedRef = { slug: string; country: string; field: string };
export type ToggleResult =
  | { ok: true; saved: boolean; persisted: boolean }
  | { ok: false; reason: "full" };

function listOf(store: LocalJsonStore<SavedList>): SavedList {
  const state = store.getSnapshot();
  return state.status === "ready" ? state.value : EMPTY_SAVED;
}

// The single action point for saving: the analytics task hooks `program-saved` here.
// `onRemoved` lets the caller forget what depended on the saved program (the ticked steps).
export function toggleSaved(
  store: LocalJsonStore<SavedList>,
  ref: SavedRef,
  snapshotVersion: string,
  today: IsoDate,
  onRemoved: (slug: string) => void = () => {},
): ToggleResult {
  const list = listOf(store);
  if (isSavedSlug(list, ref.slug)) {
    const result = store.update((current) => removeSaved(current, ref.slug));
    onRemoved(ref.slug);
    return { ok: true, saved: false, persisted: result.ok && result.persisted };
  }
  if (list.items.length >= MAX_SAVED_PROGRAMS) return { ok: false, reason: "full" };
  const result = store.update(
    (current) => addSaved(current, { ...ref, snapshotVersion, savedAt: today }) ?? current,
  );
  return {
    ok: true,
    saved: isSavedSlug(listOf(store), ref.slug),
    persisted: result.ok && result.persisted,
  };
}

// Removing a program from the plan also forgets its ticked steps.
export function removeFromPlan(slug: string): void {
  savedStore.update((current) => removeSaved(current, slug));
  forgetProgress(slug);
}

export function toggleSavedProgram(ref: SavedRef, snapshotVersion: string, today: IsoDate): ToggleResult {
  return toggleSaved(savedStore, ref, snapshotVersion, today, forgetProgress);
}
```

`src/lib/saved/use-saved.ts`:

```ts
"use client";

import { useMemo, useSyncExternalStore } from "react";

import { todayIso } from "@/lib/clock";

import { removeFromPlan, type SavedRef, type ToggleResult, toggleSavedProgram } from "./actions";
import { type SavedProgram } from "./saved";
import { savedStore } from "./store";

export type UseSaved = {
  hydrated: boolean;
  items: readonly SavedProgram[];
  // False only when this device cannot reliably keep the list; true while unhydrated.
  storageAvailable: boolean;
  isSaved: (slug: string) => boolean;
  toggle: (ref: SavedRef, snapshotVersion: string) => ToggleResult;
  remove: (slug: string) => void;
};

const NONE: readonly SavedProgram[] = [];

export function useSaved(): UseSaved {
  const state = useSyncExternalStore(
    savedStore.subscribe,
    savedStore.getSnapshot,
    savedStore.getServerSnapshot,
  );
  return useMemo(() => {
    const items = state.status === "ready" ? state.value.items : NONE;
    return {
      hydrated: state.status === "ready",
      items,
      storageAvailable: state.status !== "ready" || state.storageAvailable,
      isSaved: (slug) => items.some((item) => item.slug === slug),
      toggle: (ref, snapshotVersion) => toggleSavedProgram(ref, snapshotVersion, todayIso()),
      remove: removeFromPlan,
    };
  }, [state]);
}
```

`src/lib/local-data.ts`:

```ts
import { planStore } from "@/lib/plan/store";
import { profileStore } from "@/lib/profile/store";
import { savedStore } from "@/lib/saved/store";

// Everything the guest keeps on this device. The profile store removes every `jisr.` key; a
// same-tab removal fires no `storage` event, so the other stores must re-read explicitly.
export function clearAllLocalData(): void {
  profileStore.clear();
  savedStore.reload();
  planStore.reload();
}
```

In `src/components/clear-data-dialog.tsx` replace `import { profileStore } from "@/lib/profile/store";` with `import { clearAllLocalData } from "@/lib/local-data";` and `profileStore.clear();` with `clearAllLocalData();`.

- [ ] **Step 4: Run to verify pass.** `pnpm vitest run tests/lib/saved tests/lib/local-data.test.tsx tests/components/clear-data-button.test.tsx tests/lib/client-imports.test.ts && pnpm typecheck && pnpm lint` — Expected: PASS. Fix the `clear-data-button` test if it spied on `profileStore.clear` (assert the observable result: the keys are gone).

- [ ] **Step 5: Commit.**

```bash
git add src/lib/saved src/lib/local-data.ts src/components/clear-data-dialog.tsx tests/lib/saved tests/lib/local-data.test.tsx tests/components/clear-data-button.test.tsx
git commit -m "feat: saved programs store, toggle action and hook; clear my data clears them"
```

---

### Task 4: Shards for the plan and card-model fields

**Files:**
- Modify: `src/lib/snapshot/plan.ts` (add `shardsForPlan`), `src/lib/journey/matches-view.ts` (`MatchCardModel` + `cardFor`, export `uniqueFacts`)
- Test: `tests/lib/snapshot/plan.test.ts` (add cases; if the file is named differently use the existing plan test), `tests/lib/journey/matches-view.test.ts` (add one case)

**Interfaces:**
- Produces: `shardsForPlan(items: ReadonlyArray<{ country: CountryCode; field: Slug }>, credentialCountry: CountryCode, manifest: Manifest): ShardPlan`; `MatchCardModel.country: string`, `.field: string`, `.snapshotVersion: string`; `uniqueFacts(facts: ReadonlyArray<FactRef | null>): FactRef[]` exported.

- [ ] **Step 1: Failing tests.** In the existing plan-shards test file (`grep -rn "shardsForProgram" tests/lib/snapshot` to find it) add:

```ts
it("shardsForPlan unions core, routes and each saved program's shard and destination shards, skipping what the manifest lacks", () => {
  const plan = shardsForPlan(
    [{ country: "XB", field: "xx-field-a" }, { country: "XB", field: "xx-field-a" }, { country: "XB", field: "xx-gone" }],
    "XA",
    manifest,
  );
  expect(plan.structural).toEqual(expect.arrayContaining(["core", "routes.XA", "programs.XB.xx-field-a", "institutions.XB", "costs.XB", "scholarships.XB"]));
  expect(plan.structural).not.toContain("programs.XB.xx-gone");
  expect(new Set(plan.structural).size).toBe(plan.structural.length);
});
```

Use the same `manifest` fixture the neighbouring `shardsForProgram` tests use (read the file first; adapt the country/field codes to those the fixture contains). In `tests/lib/journey/matches-view.test.ts` add inside an existing describe:

```ts
it("each card carries its country, field and the bundle's snapshot version (the save button needs them)", () => {
  const view = viewFor(E2E_PROFILE);
  const c = card(view, E2E_SLUGS.ok);
  const program = programOf(frBundle, E2E_SLUGS.ok);
  expect(c.country).toBe(program.country);
  expect(c.field).toBe(program.field);
  expect(c.snapshotVersion).toBe(frBundle.snapshotVersion);
});
```

(Check `E2E_SLUGS` keys with `grep -n "E2E_SLUGS" -A12 tests/fixtures/e2e/profiles.ts` and use a real one.)

- [ ] **Step 2: Run to verify failure.** `pnpm vitest run tests/lib/snapshot tests/lib/journey/matches-view.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement.** In `src/lib/snapshot/plan.ts` append:

```ts
// The shards the plan page needs for the saved programs: the same set `shardsForProgram` builds
// for one program, unioned. A program shard the manifest no longer lists is simply absent, and
// the page then shows that saved program as "no longer in our data".
export function shardsForPlan(
  items: ReadonlyArray<{ country: CountryCode; field: Slug }>,
  credentialCountry: CountryCode,
  manifest: Manifest,
): ShardPlan {
  return present(manifest, [
    shardNames.core(),
    shardNames.routes(credentialCountry),
    ...items.flatMap((item) => [
      shardNames.programs(item.country, item.field),
      ...destinationShards(item.country),
    ]),
  ]);
}
```

In `matches-view.ts`: add `country: string; field: string; snapshotVersion: string;` to `MatchCardModel` (after `slug`), set `country: program.country, field: program.field, snapshotVersion: bundle.snapshotVersion` in `cardFor`, and change `function uniqueFacts` to `export function uniqueFacts`. Fix any test builders of `MatchCardModel` that now fail typecheck (`pnpm typecheck` lists them; add the three fields).

- [ ] **Step 4: Run to verify pass.** `pnpm vitest run tests/lib tests/components && pnpm typecheck` — Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/snapshot/plan.ts src/lib/journey/matches-view.ts tests
git commit -m "feat: shards for the plan page; match cards carry country, field and snapshot version"
```

---

### Task 5: Plan view model (pure)

**Files:**
- Create: `src/lib/journey/plan-view.ts`
- Test: `tests/lib/journey/plan-view.test.ts`

**Interfaces:**
- Consumes: `generateChecklist`, `matchProgram`, `nextIntake`, `scholarshipsForProgram`, `groupOf`, `uniqueFacts`, `SnapshotBundle`, `DataText`.
- Produces:

```ts
export type PlanChannel = { name: string; url: string; accountRequired: boolean | null };
export type PlanDocument = { slug: string; name: DataText | null; translationRequired: boolean | null };
export type PlanStep = {
  id: ChecklistStepId; status: "todo" | "skipped"; reason: ChecklistReasonCode;
  facts: FactRef[]; deadline: IsoDate | null; channel: PlanChannel | null;
  scholarships: Array<{ slug: string; name: string }>;
};
export type PlanProgram = {
  kind: "program"; slug: string; name: string; institutionName: string; cityName: string;
  group: MatchGroup; intake: IntakeStatus; documents: PlanDocument[] | null;
  documentsMeta: Program["documents"]; steps: PlanStep[];
};
export type PlanMissing = { kind: "missing"; slug: string };
export type PlanView = { entries: Array<PlanProgram | PlanMissing> };
export function buildPlanView(input: { profile: Profile; bundle: SnapshotBundle; saved: ReadonlyArray<{ slug: string }>; now: IsoDate }): PlanView
```
Entries keep the order of `saved`. Throws (like `buildMatchesView`) if the bundle has no core shard.

- [ ] **Step 1: Failing tests** `tests/lib/journey/plan-view.test.ts`. Reuse the setup of `matches-view.test.ts` (`buildSnapshot(E2E_DATA_DIR)`, `loadMatchesBundle(dir, E2E_PROFILE, "fr")`, `E2E_NOW`, `forbidConsole`, `removeTempDirs`). Cases (write each with concrete assertions against the fixture; read `tests/fixtures/data/e2e-journey/programs/xx-test-prog-ok.yaml` and `-stale.yaml` to pick expected values):

```ts
describe("buildPlanView", () => {
  it("returns one entry per saved slug in saved order, and 'missing' for a slug not in the bundle", () => {
    const view = buildPlanView({ profile: E2E_PROFILE, bundle, saved: [{ slug: "xx-test-prog-ok" }, { slug: "xx-gone" }], now: E2E_NOW });
    expect(view.entries.map((e) => [e.kind, e.slug])).toEqual([["program", "xx-test-prog-ok"], ["missing", "xx-gone"]]);
  });

  it("builds the ten checklist steps in domain order for a program", () => {
    const entry = programEntry("xx-test-prog-ok");
    expect(entry.steps.map((s) => s.id)).toEqual([...CHECKLIST_STEP_IDS]);
    expect(entry.group).toBe("ok");
  });

  it("resolves the application channel (name and url) on the account and submit steps", () => {
    const entry = programEntry("xx-test-prog-ok");
    const submit = entry.steps.find((s) => s.id === "submit");
    expect(submit?.channel).toMatchObject({ name: expect.any(String), url: expect.stringMatching(/^https?:\/\//) });
  });

  it("carries the next deadline as an IntakeStatus and the documents with localized names", () => {
    const entry = programEntry("xx-test-prog-ok");
    expect(entry.intake.kind).toBe("upcoming");
    expect(entry.documents?.length).toBeGreaterThan(0);
  });

  it("lists scholarships by name on the scholarships step only when the student's nationality may apply", () => {
    // use a profile whose nationality is outside eligibleNationalities of the fixture scholarship to get the 'no_scholarships_listed' skip
  });

  it("never yields a skipped step from stale data: the stale program has no skipped language_exam or application_account", () => {
    const stale = programEntry("xx-test-prog-stale");
    for (const id of ["language_exam", "application_account"] as const) {
      expect(stale.steps.find((s) => s.id === id)?.status).toBe("todo");
    }
  });

  it("throws, without echoing the profile, when the bundle has no core shard", () => {
    expect(() => buildPlanView({ profile: E2E_PROFILE, bundle: { ...bundle, core: undefined }, saved: [], now: E2E_NOW })).toThrow();
  });
});
```

Fill the scholarships case with a real assertion after reading `data` fixtures (`grep -rn nationalit tests/fixtures/data/e2e-journey/scholarships`); do not leave it as a comment. If a fixture program lacks documents or a deadline, extend the **synthetic** fixture in `tests/fixtures/data/e2e-journey` (never real data) and re-run `pnpm data:check` is NOT needed for fixtures; run `pnpm vitest run tests/lib/snapshot` to confirm the fixture still builds.

- [ ] **Step 2: Run to verify failure.** `pnpm vitest run tests/lib/journey/plan-view.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** `src/lib/journey/plan-view.ts`:

```ts
import type { IsoDate } from "@/data-schema/dates";
import type { Profile } from "@/data-schema/profile";
import type { Program } from "@/data-schema/resolved";
import { generateChecklist } from "@/domain/checklist";
import { nextIntake } from "@/domain/intakes";
import { matchProgram } from "@/domain/match";
import { scholarshipsForProgram } from "@/domain/scholarships";
import type {
  ChecklistReasonCode,
  ChecklistStepId,
  FactRef,
  IntakeStatus,
} from "@/domain/types";
import type { SnapshotBundle } from "@/lib/snapshot/client";
import type { DataText } from "@/lib/snapshot/text";

import { groupOf, type MatchGroup, uniqueFacts } from "./matches-view";

export type PlanChannel = { name: string; url: string; accountRequired: boolean | null };
export type PlanDocument = {
  slug: string;
  name: DataText | null;
  translationRequired: boolean | null;
};
export type PlanStep = {
  id: ChecklistStepId;
  status: "todo" | "skipped";
  reason: ChecklistReasonCode;
  facts: FactRef[];
  deadline: IsoDate | null;
  channel: PlanChannel | null;
  scholarships: Array<{ slug: string; name: string }>;
};
export type PlanProgram = {
  kind: "program";
  slug: string;
  name: string;
  institutionName: string;
  cityName: string;
  group: MatchGroup;
  intake: IntakeStatus;
  documents: PlanDocument[] | null;
  documentsMeta: Program["documents"];
  steps: PlanStep[];
};
export type PlanMissing = { kind: "missing"; slug: string };
export type PlanView = { entries: Array<PlanProgram | PlanMissing> };

export type PlanInput = {
  profile: Profile;
  bundle: SnapshotBundle;
  saved: ReadonlyArray<{ slug: string }>;
  now: IsoDate;
};

// Pure: the same inputs as the program page's personal result, run for each saved program. Nothing
// here logs, because an error could carry profile values.
export function buildPlanView({ profile, bundle, saved, now }: PlanInput): PlanView {
  const core = bundle.core;
  if (core === undefined) throw new Error("buildPlanView: the bundle has no core shard");
  const programs = bundle.programs.flatMap((shard) => shard.programs);
  const routes = bundle.routes?.routes ?? [];
  const institutions = bundle.institutions.flatMap((shard) => shard.institutions);
  const allScholarships = bundle.scholarships.flatMap((shard) => shard.scholarships);

  const entries = saved.map((item): PlanProgram | PlanMissing => {
    const program = programs.find((p) => p.slug === item.slug);
    if (program === undefined) return { kind: "missing", slug: item.slug };

    const match = matchProgram({ profile, program, routes, reference: core, now });
    const scholarships = scholarshipsForProgram(profile, program, allScholarships);
    const channelSlug = program.applicationChannel.value;
    const programChannel = core.applicationChannels.find((c) => c.slug === channelSlug) ?? null;
    const checklist = generateChecklist({
      profile,
      program,
      match,
      channel: programChannel,
      scholarships,
      now,
    });
    const institution = institutions.find((i) => i.slug === program.institution) ?? null;
    const channelOf = (slug: string | null | undefined): PlanChannel | null => {
      const found = slug == null ? null : core.applicationChannels.find((c) => c.slug === slug);
      return found == null
        ? null
        : { name: found.name, url: found.url, accountRequired: found.accountRequired };
    };
    const names = new Map(scholarships.map((s) => [s.slug, s.name]));

    return {
      kind: "program",
      slug: program.slug,
      name: program.name,
      institutionName: institution?.name ?? program.institution,
      cityName: institution?.city.name ?? program.city,
      group: groupOf(match),
      intake: nextIntake(program, now),
      documents:
        program.documents.value === null
          ? null
          : program.documents.value.map((doc) => ({
              slug: doc.slug,
              name: bundle.text(doc.name) ?? null,
              translationRequired: doc.translationRequired,
            })),
      documentsMeta: program.documents,
      steps: checklist.steps.map((step) => ({
        id: step.id,
        status: step.status,
        reason: step.reason,
        facts: uniqueFacts(step.facts),
        deadline: step.deadline ?? null,
        channel: channelOf(step.channel),
        scholarships: (step.scholarships ?? []).map((slug) => ({
          slug,
          name: names.get(slug) ?? slug,
        })),
      })),
    };
  });
  return { entries };
}
```

(`== null` is deliberate to cover `undefined | null`; if Biome's `noDoubleEquals` flags it, use `slug === undefined || slug === null`.)

- [ ] **Step 4: Run to verify pass.** `pnpm vitest run tests/lib/journey && pnpm typecheck && pnpm lint` — Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/journey/plan-view.ts tests/lib/journey/plan-view.test.ts tests/fixtures
git commit -m "feat: plan view model: checklist, deadline and documents per saved program"
```

---

### Task 6: Save button, wiring, nav link and messages (UI)

> Invoke `impeccable:impeccable` first (phone-first, fr/ar, tap target ≥ 44px, no icon-only). Check `ctx7` docs before using any next-intl API not already used in the repo (`t.raw`).

**Files:**
- Create: `src/components/save-program-button.tsx`
- Modify: `src/components/match-card.tsx` (footer row), `src/components/matches/namespaces.ts` (add `"savedProgram"`), `src/components/program/program-page-view.tsx` (`ProgramHeader`), `src/components/nav-links.tsx`, `src/components/site-header.tsx`, `tests/components/intl.tsx` (`shellProps` nav items), `messages/{en,fr,ar}.json`
- Test: `tests/components/save-program-button.test.tsx`, extend `tests/components/match-card.test.tsx`, `tests/components/nav-links.test.tsx`, `tests/components/program/leaves.test.tsx` (header placeholder), message-parity tests already in `tests/i18n`

**Interfaces:**
- Consumes: `useSaved` (`toggle`, `isSaved`, `hydrated`), `Button`.
- Produces:

```ts
export type SaveCopy = { save: string; saved: string; announceSaved: string; announceRemoved: string; full: string };
export function SaveProgramButton(props: {
  program: { slug: string; country: string; field: string };
  snapshotVersion: string;
  programName: string; // official name, appended sr-only to the visible label
  copy: SaveCopy;
}): JSX.Element
```
`NavItem` gains optional `savedCount?: { template: string }` (a raw string containing `{count}`); `NavLinks` shows the badge for that item.

- [ ] **Step 1: Messages** (all three locales; ar is a machine draft like the rest of ar copy). Add to each file:

| key | en | fr | ar |
|---|---|---|---|
| `nav.plan` | My plan | Mon plan | خطتي |
| `nav.savedCount` | {count} saved | {count} enregistré(s) | {count} محفوظ |
| `savedProgram.save` | Save | Enregistrer | حفظ |
| `savedProgram.saved` | Saved | Enregistré | تم الحفظ |
| `savedProgram.announceSaved` | Added to My plan. | Ajouté à Mon plan. | أُضيف إلى خطتي. |
| `savedProgram.announceRemoved` | Removed from My plan. | Retiré de Mon plan. | أُزيل من خطتي. |
| `savedProgram.full` | You can save up to {max} programs. Remove one in My plan first. | Vous pouvez enregistrer jusqu'à {max} programmes. Retirez-en un dans Mon plan d'abord. | يمكنك حفظ ما يصل إلى {max} برنامجًا. أزل أحدها من خطتي أولًا. |

`nav.savedCount` is read raw (`tNav.raw("savedCount")`) and filled in the client with `String(count)`; `savedProgram.full` takes a preformatted `max` (`displayNumber(MAX_SAVED_PROGRAMS, locale)`). Add `"savedProgram"` to `MATCHES_MESSAGE_NAMESPACES`. Run `pnpm vitest run tests/i18n` to confirm key parity and ICU validity (expected PASS; if a test forbids raw `{count}` strings, name the template key `savedCountTemplate` and add it to that test's allow-list instead of changing the test's rule).

- [ ] **Step 2: Failing component tests** `tests/components/save-program-button.test.tsx` (jsdom; `renderIntl`; `localStorage` cleared in `beforeEach`; copy built from `catalogs[locale].savedProgram`). Required assertions, each its own `it`:
  1. Server render (`renderToString`) contains no `Saved`/`Save` text and no `aria-pressed`: only the inert placeholder (`data-slot="save-placeholder"`, `aria-hidden="true"`).
  2. After hydration the button shows the `save` label plus an sr-only `<bdi>` program name and is not `aria-pressed` (the visible label itself changes; do not combine a changing label with `aria-pressed`).
  3. Click saves: label becomes `saved`, `localStorage["jisr.saved"]` holds one item with the given slug/country/field/snapshotVersion, and a polite `<output>` region now reads `announceSaved`; click again: label returns to `save`, `announceRemoved`.
  4. When 12 other programs are saved, clicking a new one shows `copy.full` in a `role="alert"` and saves nothing.
  5. The same assertions pass in `ar` (dir `rtl` wrapper) and the bookmark icon is `aria-hidden`.
  6. Two buttons for the same slug stay in sync (both flip).

`tests/components/match-card.test.tsx`: add a case that the card renders a `SaveProgramButton` whose group sits in the footer row next to the "See details" link. `tests/components/nav-links.test.tsx`: with two saved programs in storage the "My plan" link shows a badge `2` with an sr-only `2 saved`; with none, no badge; no badge text uses non-Latin digits in `ar`.

- [ ] **Step 3: Run to verify failure.** `pnpm vitest run tests/components/save-program-button.test.tsx tests/components/nav-links.test.tsx` — Expected: FAIL.

- [ ] **Step 4: Implement `SaveProgramButton`** (`"use client"`; contract from the steps above):
  - `const { hydrated, isSaved, toggle } = useSaved();` if `!hydrated` render `<span data-slot="save-placeholder" aria-hidden="true" className="inline-block h-12 w-32" />` (same footprint as the button so nothing shifts).
  - Otherwise a `Button variant="outline"` (`h-12`, full-width on phone via the caller's `className`, `w-fit` from `sm`), `type="button"`, containing a `Bookmark` icon from `lucide-react` (`aria-hidden`, `fill-current` when saved), the visible label `copy.saved`/`copy.save`, and `<span className="sr-only"> <bdi>{programName}</bdi></span>`. No `aria-pressed`.
  - `onClick`: `const result = toggle(program, snapshotVersion)`; keep a `message` state: `result.ok ? (result.saved ? copy.announceSaved : copy.announceRemoved) : null` and a `full` boolean state set when `!result.ok`.
  - Always render `<output className="sr-only">{message}</output>` (one region for the life of the component, only its text changes) and, when `full`, `<p role="alert" className="text-sm text-muted-foreground">{copy.full}</p>`.
  - Mount wiring: in `MatchCard`'s footer `<div className="flex flex-wrap items-center gap-3">` put "See details" and `<SaveProgramButton program={{ slug: model.slug, country: model.country, field: model.field }} snapshotVersion={model.snapshotVersion} programName={model.name} copy={...} />`, with `copy` built from `useTranslations("savedProgram")` (`full: t("full", { max: displayNumber(MAX_SAVED_PROGRAMS, locale) })` where `displayNumber` comes from `@/components/matches/display-number`). In `ProgramHeader` (server component) build the same `copy` with `useTranslations("savedProgram")` and `useLocale()` and place the button under the `<ul>` of facts, passing `snapshotVersion={data.snapshotVersion}`.
  - `NavLinks`: extend `NavItem` with `savedCount?: { template: string }`; for such an item render after the label `<span aria-hidden="true" className="ms-2 rounded-full bg-muted px-2 text-sm tabular-nums">{n}</span><span className="sr-only">{template.replace("{count}", String(n))}</span>` only when `useSaved().hydrated && n > 0`. `SiteHeader` adds `{ href: "/plan", label: tNav("plan"), savedCount: { template: tNav.raw("savedCount") } }` (validate the type of `raw` with a `typeof === "string"` guard, no cast) and `shellProps` in `tests/components/intl.tsx` mirrors it.

- [ ] **Step 5: Run to verify pass.** `pnpm vitest run tests/components tests/i18n && pnpm typecheck && pnpm lint` — Expected: PASS. Then `pnpm test` (whole suite) to catch other `NavLinks`/`MatchCard` fixtures.

- [ ] **Step 6: Browser check** (fr and ar): `pnpm dev:fixture`, create a profile, save from a card and from a program page, reload, confirm Saved survives, nav badge appears, `ar` mirrors correctly. Hard refresh (Ctrl+Shift+R) after each edit.

- [ ] **Step 7: Commit.**

```bash
git add src/components src/lib messages tests
git commit -m "feat: save a program from the match card and the program page; My plan nav link"
```

---

### Task 7: My Application Plan page (UI)

> Invoke `impeccable:impeccable` first (phone-first, disclosure switcher on phone and rail on `lg`, fr/ar, tap targets, RTL). Read `src/components/matches/matches-client.tsx` and `src/components/program/personal-match.tsx` again before starting; this island follows the same patterns (profile states, `useSnapshotBundle`, `import()` of the heavy module, one polite `<output>` region).

**Files:**
- Create: `src/app/[locale]/plan/page.tsx`, `src/components/plan/namespaces.ts`, `plan-client.tsx`, `plan-states.tsx`, `program-switcher.tsx`, `program-plan.tsx`, `step-row.tsx`, `skipped-steps.tsx`, `missing-program.tsx`
- Modify: `messages/{en,fr,ar}.json` (`plan` namespace)
- Test: `tests/components/plan/plan-client.test.tsx`, `tests/components/plan/step-row.test.tsx`, `tests/components/plan/program-switcher.test.tsx`, `tests/app/plan-page.test.tsx` (static HTML has no student-dependent claim; follow `tests/app/*` for the program page)

**Interfaces:**
- Consumes: `useProfile`, `useSaved` (`items`, `hydrated`, `remove`), `usePlanProgress`, `useSnapshotBundle`, `shardsForPlan`, `buildPlanView` (dynamic `import("@/lib/journey/plan-view")`), `SourceBadge`, `DeadlineStatus`, `MatchStatusBadge`, `ExternalLink`, `EmptyState`, `LocalizedDataText`, `displayNumber`, `todayIso`.
- Produces: `PLAN_MESSAGE_NAMESPACES = ["plan", "deadline", "sourceBadge", "externalLink", "matchStatusBadge", "domain"] as const`; `PlanClient({ locale, client? })`.

- [ ] **Step 1: Messages** — add the `plan` namespace to all three locales:

| key | en | fr | ar |
|---|---|---|---|
| `plan.meta.title` | My application plan | Mon plan de candidature | خطة تقديمي |
| `plan.meta.description` | Your checklist for each saved program: documents, deadlines and next steps. | Votre liste d'étapes pour chaque programme enregistré : documents, échéances et prochaines étapes. | قائمة خطواتك لكل برنامج محفوظ: الوثائق والمواعيد النهائية والخطوات التالية. |
| `plan.title` | My application plan | Mon plan de candidature | خطة تقديمي |
| `plan.lead` | Tick off each step as you complete it. Your progress stays on this device. | Cochez chaque étape une fois terminée. Votre progression reste sur cet appareil. | ضع علامة على كل خطوة بعد إتمامها. يبقى تقدمك على هذا الجهاز. |
| `plan.loading` | Loading your plan | Chargement de votre plan | جارٍ تحميل خطتك |
| `plan.empty.title` | You have not saved any program yet | Vous n'avez encore enregistré aucun programme | لم تحفظ أي برنامج بعد |
| `plan.empty.description` | Save programs from My matches or from a program page to get a checklist for each. | Enregistrez des programmes depuis Mes résultats ou depuis une page de programme pour obtenir une liste d'étapes pour chacun. | احفظ برامج من نتائجي أو من صفحة البرنامج لتحصل على قائمة خطوات لكل منها. |
| `plan.empty.action` | See my matches | Voir mes résultats | عرض نتائجي |
| `plan.noProfile.title` | Create your profile to get your plan | Créez votre profil pour obtenir votre plan | أنشئ ملفك الشخصي لتحصل على خطتك |
| `plan.noProfile.description` | Your saved programs are kept on this device. We need your profile to work out which steps apply to you. | Vos programmes enregistrés restent sur cet appareil. Nous avons besoin de votre profil pour savoir quelles étapes vous concernent. | تبقى برامجك المحفوظة على هذا الجهاز. نحتاج إلى ملفك الشخصي لمعرفة الخطوات التي تخصك. |
| `plan.noProfile.action` | Create my profile | Créer mon profil | إنشاء ملفي الشخصي |
| `plan.error.title` | We could not load your plan | Impossible de charger votre plan | تعذّر تحميل خطتك |
| `plan.error.description` | Check your connection and try again. | Vérifiez votre connexion et réessayez. | تحقق من اتصالك وحاول مرة أخرى. |
| `plan.error.retry` | Try again | Réessayer | حاول مرة أخرى |
| `plan.switcher.label` | Your saved programs | Vos programmes enregistrés | برامجك المحفوظة |
| `plan.switcher.showing` | Showing | Affiché | المعروض |
| `plan.switcher.change` | Change program | Changer de programme | تغيير البرنامج |
| `plan.switcher.progress` | {done} of {total} done | {done} sur {total} faites | {done} من {total} مكتملة |
| `plan.switcher.missing` | No longer in our data | N'est plus dans nos données | لم يعد في بياناتنا |
| `plan.program.nextStep` | Next step | Prochaine étape | الخطوة التالية |
| `plan.program.allDone` | Every step is ticked off. | Toutes les étapes sont cochées. | تم وضع علامة على جميع الخطوات. |
| `plan.program.deadline` | Application deadline | Date limite de candidature | الموعد النهائي للتقديم |
| `plan.program.remove` | Remove from my plan | Retirer de mon plan | إزالة من خطتي |
| `plan.program.viewProgram` | View the program page | Voir la page du programme | عرض صفحة البرنامج |
| `plan.steps.heading` | Steps | Étapes | الخطوات |
| `plan.steps.guidance` | General guidance, not specific to this program | Conseil général, pas propre à ce programme | إرشاد عام، غير خاص بهذا البرنامج |
| `plan.steps.skippedHeading` | Probably not needed ({count}) | Probablement inutiles ({count}) | غير مطلوبة على الأرجح ({count}) |
| `plan.steps.skippedLead` | The published data suggests these steps may not apply to you. Confirm each one on the official page. | Les données publiées laissent penser que ces étapes ne vous concernent pas. Vérifiez chacune sur la page officielle. | تشير البيانات المنشورة إلى أن هذه الخطوات قد لا تخصك. تحقق من كل منها في الصفحة الرسمية. |
| `plan.steps.documents` | Documents the program asks for | Documents demandés par le programme | الوثائق التي يطلبها البرنامج |
| `plan.steps.translation.yes` | Translation required | Traduction requise | الترجمة مطلوبة |
| `plan.steps.translation.no` | No translation required | Traduction non requise | الترجمة غير مطلوبة |
| `plan.steps.translation.unknown` | Translation not stated: check the official page | Traduction non précisée : vérifiez la page officielle | الترجمة غير مذكورة: تحقق من الصفحة الرسمية |
| `plan.steps.applyOn` | Apply on {name} | Candidater sur {name} | قدّم على {name} |
| `plan.steps.accountRequired` | An account is required | Un compte est nécessaire | الحساب مطلوب |
| `plan.steps.accountNotRequired` | No account is required | Aucun compte n'est nécessaire | لا حاجة إلى حساب |
| `plan.steps.accountUnknown` | Account requirement not stated | Compte : non précisé | شرط الحساب غير مذكور |
| `plan.steps.scholarships` | Scholarships to check | Bourses à examiner | منح للاطلاع عليها |
| `plan.missing.title` | This program is no longer in our data | Ce programme n'est plus dans nos données | لم يعد هذا البرنامج في بياناتنا |
| `plan.missing.description` | You saved it earlier, but the current data does not list it. You can remove it from your plan. | Vous l'aviez enregistré, mais les données actuelles ne le listent plus. Vous pouvez le retirer de votre plan. | حفظته سابقًا، لكن البيانات الحالية لا تتضمنه. يمكنك إزالته من خطتك. |

Step titles, meanings and reasons already exist under `domain.checklist.*` (use `domain.checklist.step.<id>.title|meaning` and `domain.checklist.reason.<code>`); `domain` is in the namespace list. Confirm the ar/fr equivalents of those keys exist (`grep -n '"checklist"' messages/*.json`).

- [ ] **Step 2: Failing tests.** Write these as real tests using the same helpers as `tests/components/matches/helpers.tsx` (`withFixtureClient`, catalogs, `pickMessages(..., PLAN_MESSAGE_NAMESPACES)`), seeding `localStorage` with the profile (`jisr.profile`) and `jisr.saved`:
  1. `plan-client.test.tsx`: unhydrated/loading state shows the skeleton and one `<output>` region; no saved → `plan.empty` with a link to `/matches`; saved + no profile → `plan.noProfile` with a link to `/profile` and the saved list untouched; saved + profile → first program's name as the `h2`, ten steps split into a Steps list (todo) and a collapsed "Probably not needed (n)" `<details>`; a failed snapshot shows `role="alert"` with Retry; a saved slug the bundle lacks renders the "no longer in our data" card and Remove deletes it from `jisr.saved` and its ticks from `jisr.plan`.
  2. Ticking: clicking a todo step's checkbox persists `{"jisr.plan":{"done":{<slug>:[<step>]}}}`, the switcher progress changes from "0 of N done" to "1 of N done", and "Next step" moves to the next unticked todo step; skipped steps have no checkbox and are not counted in N.
  3. Trust: every step with `facts` renders one `SourceBadge` per fact (assert `data-testid` used by SourceBadge or its visible kind label); a step with no facts shows the `plan.steps.guidance` tag and no source link; the `submit` step shows the next deadline through `DeadlineStatus` (upcoming/closed/unknown strings, DD/MM/YYYY in fr and ar with Latin digits); the Documents step lists the program's documents with the translation line.
  4. `program-switcher.test.tsx`: with 3 saved programs the switcher is a `<details>` on phone width markup (summary shows the active program's name and progress) containing a `<ul>` of buttons with `aria-current="true"` on the active one; selecting another changes the active program; its `lg` rail variant is the same list (CSS-only difference, assert the same buttons exist once).
  5. `tests/app/plan-page.test.tsx`: the rendered static page for `fr` and `ar` contains the title and a neutral skeleton but no program name, no step title, no status or deadline.
  6. Run in `fr` and `ar` (RTL wrapper): no `ml-`/`mr-`/`pl-`/`pr-`/`left-`/`right-` utilities in the rendered class lists (`tests/design` already has a logical-utilities scan: confirm the new files are covered by its glob).

- [ ] **Step 3: Run to verify failure.** `pnpm vitest run tests/components/plan tests/app/plan-page.test.tsx` — Expected: FAIL.

- [ ] **Step 4: Implement.** Structure and rules (apply `impeccable` for the visual design; follow the patterns in the files named above):
  - `page.tsx`: copy `src/app/[locale]/matches/page.tsx`; `generateMetadata` uses `plan.meta`; `<h1>` from `plan.title`; nested `NextIntlClientProvider locale messages={pickMessages(messages, PLAN_MESSAGE_NAMESPACES)}` around `<PlanClient locale={locale} />`.
  - `plan-client.tsx` (`"use client"`): `useProfile()`, `useSaved()`, `usePlanProgress()`. State order: profile `unhydrated` or saved not hydrated → skeleton; no saved items → `EmptyState` (`plan.empty`); profile not ok → `plan.noProfile` (and the reset notice pattern from matches if `status === "reset"`); else request `{ key: \`plan:${country}:${[...new Set(items.map(i => \`${i.country}.${i.field}\`))].sort().join(",")}\`, plan: (manifest) => shardsForPlan(items, country, manifest) }` through `useSnapshotBundle`. Once `ready`, `import("@/lib/journey/plan-view")` in an effect (like `personal-match.tsx`: result kept only if it was computed for this exact `profile`, `bundle`, `items`), `now` from `todayIso()` read after mount, a `load_failed`/`compute_error` state with Retry (network) or a plain message (compute). The active program is `useState<string | null>`; it falls back to the first entry when the stored slug is no longer an entry. The `plan.lead` paragraph sits under the h1 (in the island, so it is hidden in the empty states).
  - `program-switcher.tsx`: `<nav aria-label={t("switcher.label")}>`; below `lg` a `<details>` whose `<summary>` shows `plan.switcher.showing`, the active program's name (`<bdi>`), its progress `plan.switcher.progress` (preformatted `done`/`total` via `displayNumber`) and the "Change program" text (use `DISCLOSURE_SUMMARY_CLASS`/`DisclosureChevron` from `@/components/disclosure-chevron`, `rtl:rotate-180` already handled there); `lg` shows the same `<ul>` as an always-open rail (`lg:block`, the `<details>` forced open at `lg` with CSS and `summary` hidden). Each list item is a `<button type="button" aria-current={active ? "true" : undefined}>` min 44px tall with name, institution/city, progress (or `plan.switcher.missing`).
  - `program-plan.tsx`: header (`h2` name in `<bdi>`, institution + city, `MatchStatusBadge group`), a summary block with "Next step" (first todo step not done, title from `domain.checklist.step.<id>.title`, or `plan.program.allDone`) and the deadline via `DeadlineStatus intake`, then the Steps list (`<ol>` of `StepRow`s for `status === "todo"`), then `SkippedSteps`, then the actions row (`plan.program.viewProgram` link to `/programs/<slug>` with `prefetch={false}`, and a `Button variant="outline"` "Remove from my plan" calling `useSaved().remove(slug)`).
  - `step-row.tsx`: `<li>` containing a native `<input type="checkbox">` (visually the app's checkbox, 44px hit area via the wrapping `<label>`), label text = step title, `meaning` as muted text, the reason line `domain.checklist.reason.<reason>` (use `useTranslations()` with a typed-key helper like `useDomainText` in `personal-match.tsx`), then step-specific blocks: documents (`documents` list with `LocalizedDataText` + translation line + `SourceBadge meta={documentsMeta}`), application_account/submit (channel name as `ExternalLink href={channel.url}` text `plan.steps.applyOn`, account line), submit (`DeadlineStatus`), scholarships (list of names linking to `/programs/<slug>#scholarship-<scholarshipSlug>`, `prefetch={false}`), and always `facts.map(f => <SourceBadge meta={f} variant="compact" />)`; with no facts show the `plan.steps.guidance` tag (dashed, "guidance" treatment from `SourceBadge`'s guidance style, never the official one). A ticked step gets a visible check, not colour alone, and `line-through` is NOT used (keep text readable).
  - `skipped-steps.tsx`: `<details>` collapsed by default, summary `plan.steps.skippedHeading` with `count`, the lead, then non-interactive rows (title, reason, sources).
  - `missing-program.tsx`: card with `plan.missing.*` and a Remove button.
  - Keep new client imports Zod-free (the import-guard test must stay green).

- [ ] **Step 5: Run to verify pass.** `pnpm vitest run tests/components tests/app tests/lib tests/design tests/i18n && pnpm typecheck && pnpm lint` — Expected: PASS.

- [ ] **Step 6: Browser check** in `fr` (LTR) and `ar` (RTL), phone width (375) and desktop: save 2–3 programs from the fixture (`pnpm dev:fixture`), open `/fr/plan` and `/ar/plan`, switch programs, tick steps, reload (progress and saved survive), "Clear my data" empties the plan page, a stale program never shows a skipped language/account step. Hard refresh after each edit.

- [ ] **Step 7: Commit.**

```bash
git add "src/app/[locale]/plan" src/components/plan messages tests
git commit -m "feat: My Application Plan page with a checklist per saved program"
```

---

### Task 8: End-to-end, privacy, performance, docs

**Files:**
- Create: `tests/e2e/plan.spec.ts`
- Modify: `tests/e2e/a11y.spec.ts`, `tests/e2e/privacy.spec.ts`, `tests/e2e/journey.spec.ts` (only if a short save step belongs in the main journey), `tests/e2e/support/*` if a helper is needed, `.claude/docs/architecture.md`, `.claude/CLAUDE.md` (architecture block + "pages built"), `docs/plans/2026-09-30-m3-guest-journey-plan.md` (tick Save/Plan off the M4 list) , `tests/e2e/support/js-budget.ts` only if `perf:js` shows a regression you accept (the ratchet only goes down: do NOT raise it silently, report it to the owner)

- [ ] **Step 1: `tests/e2e/plan.spec.ts`** (phone and desktop projects, fr and ar, reuse `support/fixtures`, `profile-form`/`seed` to put a profile in storage, the pinned clock). Scenarios: (a) from My matches save two programs (button flips to Saved, nav badge `2`), reload, still saved; (b) open My plan, switch programs, tick a step, reload, the tick survives and "Next step" advanced; (c) unsave from a program page and see it disappear from the plan; (d) Clear my data empties saved list, plan and profile; (e) a saved slug that the snapshot does not contain (seed `jisr.saved` with a made-up valid slug) shows the "no longer in our data" card; (f) no profile: saved list kept, CTA shown; (g) the 13th save shows the "full" alert.

- [ ] **Step 2: axe.** In `tests/e2e/a11y.spec.ts` add the plan page (empty, no profile, with programs, with the skipped group open, with the switcher open on phone) and a matches/program page with a Saved button, for fr and ar on both projects; expect zero violations.

- [ ] **Step 3: Privacy.** In `tests/e2e/privacy.spec.ts` add: after saving and ticking, (i) no request after the page load carries a program slug or step id in its URL/body/headers except the program page's own path, (ii) the only requests are same-origin snapshot shards (`/snapshots/...`, whose names reveal country and field, consistent with the privacy note in `architecture.md`), (iii) `document.cookie` is empty and no cookie is set by any response, (iv) `localStorage` keys are exactly `jisr.profile`, `jisr.saved`, `jisr.plan` (plus the draft key if the form was used), (v) nothing is written to `sessionStorage`/IndexedDB.

- [ ] **Step 4: Run everything.**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm data:check && pnpm build:e2e && pnpm test:e2e
```
Expected: all green (no snapshots of the real data are changed). Then restore the real snapshots: `pnpm data:build`.

- [ ] **Step 5: JS budget.** `pnpm build && pnpm perf:js`; compare each route with the table in `.claude/docs/architecture.md`, and add the new `/[locale]/plan` row. Report any route that grew by more than 3 KB gzip and why (expected: every page gains the saved store through the nav, about 1 KB; plan page gains the island, with the view model in a lazy chunk). If a growth is avoidable (for example the plan island importing something heavy statically), fix it before continuing.

- [ ] **Step 6: Docs.** Update `.claude/docs/architecture.md` (modules table: `src/lib/saved/`, `src/lib/plan/`, `local-store`, `plan-view`, `src/components/plan/`, new page; data flow note that saved list and progress live in `jisr.saved`/`jisr.plan`; the privacy note that the plan page's shard paths also name the saved programs' countries and fields; the perf table row) and the architecture block + "pages built" line in `.claude/CLAUDE.md` (Plan is now built; Compare, Scholarships remain M4). Mark Save and Plan done in the M3 plan's M4 list.

- [ ] **Step 7: Review.** Dispatch the `reviewer` subagent (Opus 5.5, medium) on the full diff of the branch against `main`, with the Global Constraints above as the checklist. Fix every finding, re-run Step 4, then:

```bash
git add tests/e2e docs .claude/docs/architecture.md .claude/CLAUDE.md
git commit -m "test: e2e, axe and privacy coverage for save and plan; docs"
```

- [ ] **Step 8: Draft PR** (never push to `main`): push `feat/m4-save-and-plan`, `gh pr create --draft` with a body that lists what changed, the verification output, the JS budget table, and the open items for the owner (native Arabic review of the new `ar` strings; the privacy-notice wording about shard paths). End the body with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Bind the PR with the ccd_pr tools, read its CI and offer Auto-fix; do not poll CI.

---

## Self-review

- **Spec coverage:** save from card and program page with a visible Saved state (T6); list survives reload and is cleared by Clear my data (T1, T3); plan page with `generateChecklist`, `domain.checklist.*` keys, steps, documents, deadlines, trust primitives and ticks persisted by slug + step id (T5, T7); five owner decisions (header block); phone and desktop e2e in fr and ar with axe and a privacy spec (T8); JS budget (T8); reviewer and draft PR (T8). Compare and analytics are intentionally out.
- **Placeholders:** the T5 scholarships case and the T4 manifest fixture reference real fixture files to read first, with the required assertion stated; no TBDs remain.
- **Types:** `SavedRef`, `ToggleResult`, `SavedProgram`, `PlanProgress`, `PlanProgram`, `PlanStep` and the hook shapes are defined once (T2/T3/T5) and used with the same names in T6/T7.
