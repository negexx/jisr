import { expect } from "vitest";

import { CEFR_LEVELS, INFO_KINDS, LOCALES } from "@/data-schema/primitives";

export type Rng = () => number;

// mulberry32: tiny, deterministic, good enough to drive a mutation fuzzer.
export function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)] as T;
}

type Path = Array<string | number>;

function isContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === "object" && value !== null;
}

// `Object.defineProperty` so that a `__proto__` key becomes an own property, as JSON.parse does.
function setOwn(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

export function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (isContainer(value)) {
    const copy: Record<string, unknown> = {};
    for (const key of Object.keys(value)) setOwn(copy, key, cloneValue(value[key as never]));
    return copy;
  }
  return value;
}

// Every leaf-ish value a hand-written validator might plausibly mishandle, valid and invalid.
const INTERESTING: readonly unknown[] = [
  null,
  undefined,
  true,
  false,
  [],
  {},
  [null],
  "",
  " ",
  "x",
  "ab",
  "AB",
  "ABC",
  "abc",
  "a-b",
  "a--b",
  "-a",
  "a-",
  ...CEFR_LEVELS,
  ...CEFR_LEVELS.map((level) => level.toLowerCase()),
  "C3",
  "D1",
  "unknown",
  "month",
  "year",
  "week",
  ...INFO_KINDS,
  ...LOCALES,
  "public",
  "private",
  "any",
  "obtained",
  "expected",
  "FR",
  "fr",
  "AB\n",
  "\nab",
  "é",
  "x".repeat(199),
  "x".repeat(200),
  "x".repeat(201),
  "s/core.0123456789ab.json",
  "s/../core.0123456789ab.json",
  "s/core.0123456789AB.json",
  "0123456789ab",
  "0123456789abc",
  "0".repeat(64),
  "0".repeat(63),
  "2026-09-30T10:00:00Z",
  0,
  -0,
  1,
  2,
  3,
  4,
  -1,
  100,
  1.5,
  0.1,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  2 ** 53,
  2 ** 53 - 1,
  1e21,
  Number.MAX_SAFE_INTEGER + 2,
];

const EXTRA_KEYS = ["extra", "__proto__", "constructor", "toString", "schemaVersion", "step", "0"];

function randomJson(rng: Rng, depth = 0): unknown {
  const roll = rng();
  if (depth < 2 && roll < 0.15) {
    return Array.from({ length: Math.floor(rng() * 3) }, () => randomJson(rng, depth + 1));
  }
  if (depth < 2 && roll < 0.3) {
    const object: Record<string, unknown> = {};
    for (let i = Math.floor(rng() * 3); i > 0; i -= 1) {
      setOwn(object, pick(rng, EXTRA_KEYS), randomJson(rng, depth + 1));
    }
    return object;
  }
  return pick(rng, INTERESTING);
}

function collectPaths(value: unknown, prefix: Path, into: Path[]): void {
  if (!isContainer(value)) return;
  for (const key of Object.keys(value)) {
    const path = [...prefix, Array.isArray(value) ? Number(key) : key];
    into.push(path);
    collectPaths(value[key as never], path, into);
  }
}

function at(root: unknown, path: Path): unknown {
  let current = root;
  for (const step of path) {
    if (!isContainer(current)) return undefined;
    current = current[step as never];
  }
  return current;
}

function mutateOnce(root: unknown, rng: Rng): unknown {
  const paths: Path[] = [];
  collectPaths(root, [], paths);
  if (paths.length === 0 || rng() < 0.02) return randomJson(rng);

  const path = pick(rng, paths);
  const parent = at(root, path.slice(0, -1));
  const key = path[path.length - 1];
  if (!isContainer(parent) || key === undefined) return root;
  const target: unknown = (parent as Record<string, unknown>)[key as string];
  const operation = Math.floor(rng() * 6);

  if (operation === 0 || operation === 1) {
    (parent as Record<string, unknown>)[key as string] = pick(rng, INTERESTING);
  } else if (operation === 2) {
    (parent as Record<string, unknown>)[key as string] = randomJson(rng);
  } else if (operation === 3) {
    if (Array.isArray(parent)) parent.splice(key as number, 1);
    else delete (parent as Record<string, unknown>)[key as string];
  } else if (operation === 4) {
    if (Array.isArray(target)) {
      target.push(target.length > 0 ? cloneValue(pick(rng, target)) : randomJson(rng));
    } else if (isContainer(target)) {
      setOwn(target as Record<string, unknown>, pick(rng, EXTRA_KEYS), randomJson(rng));
    } else if (Array.isArray(parent)) {
      parent.push(cloneValue(target));
    }
  } else if (Array.isArray(target) && target.length > 0) {
    target.push(cloneValue(target[0]));
  } else {
    (parent as Record<string, unknown>)[key as string] = [target];
  }
  return root;
}

export function mutate(base: unknown, rng: Rng, rounds: number): unknown {
  let value = cloneValue(base);
  for (let round = 0; round < rounds; round += 1) value = mutateOnce(value, rng);
  return value;
}

type Oracle = { safeParse: (input: unknown) => { success: boolean; data?: unknown } };

export type Tally = {
  accepted: number;
  rejected: number;
  probed: number;
  disagreements: string[];
};

export function compare(
  oracle: Oracle,
  validator: (input: unknown) => unknown,
  input: unknown,
  label: string,
  tally: Tally,
): boolean {
  const expected = oracle.safeParse(input);
  const actual = validator(input);
  if (expected.success) tally.accepted += 1;
  else tally.rejected += 1;
  if (expected.success !== (actual !== null)) {
    tally.disagreements.push(
      `${label}: oracle ${expected.success ? "accepts" : "rejects"} ${preview(input)}`,
    );
    return expected.success;
  }
  if (expected.success) expect(actual, label).toEqual(expected.data);
  return expected.success;
}

function preview(input: unknown): string {
  const text = JSON.stringify(input, (_key, value: unknown) =>
    typeof value === "number" && !Number.isFinite(value) ? String(value) : value,
  );
  return text === undefined ? String(input) : text.slice(0, 400);
}

export function newTally(): Tally {
  return { accepted: 0, rejected: 0, probed: 0, disagreements: [] };
}

export function fuzz(
  oracle: Oracle,
  validator: (input: unknown) => unknown,
  base: unknown,
  cases: number,
  seed: number,
  // Counts the cases (accepted by the oracle) for which it returns true, so a test can prove the
  // fuzzer actually reaches an input shape.
  probe?: (input: unknown) => boolean,
): Tally {
  const rng = seededRng(seed);
  const tally = newTally();
  for (let index = 0; index < cases; index += 1) {
    const rounds = 1 + Math.floor(rng() * 3);
    const input = mutate(base, rng, rounds);
    const accepted = compare(oracle, validator, input, `fuzz#${index}`, tally);
    if (accepted && probe?.(input) === true) tally.probed += 1;
  }
  return tally;
}
