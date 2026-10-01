// Hand-written building blocks for the client validators. Each one mirrors one Zod 4 behaviour so
// the differential tests can prove the validators equal the schemas. Never throw or return input.
export type UnknownRecord = Record<string, unknown>;

// z.object: any non-null, non-array object.
export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// z.object with unknown-key rejection. Zod walks `for...in`, so an inherited enumerable key counts
// as present (and as unknown when it is outside the shape); own symbol keys are ignored.
export function hasOnlyKeys(record: UnknownRecord, allowed: readonly string[]): boolean {
  for (const key in record) {
    if (!allowed.includes(key)) return false;
  }
  return true;
}

// z.record requires a plain object: no class instances, but null-prototype objects are fine.
export function isPlainObject(value: unknown): value is UnknownRecord {
  if (!isRecord(value)) return false;
  const ctor: unknown = value.constructor;
  if (typeof ctor !== "function") return true;
  const prototype: unknown = ctor.prototype;
  return isRecord(prototype) && Object.hasOwn(prototype, "isPrototypeOf");
}

export function matches(value: unknown, pattern: RegExp): value is string {
  return typeof value === "string" && pattern.test(value);
}

// z.number(): NaN and the infinities are rejected.
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

// z.number().int(): safe integers only.
export function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

export function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === "string" && (options as readonly string[]).includes(value);
}

// z.array: holes read as undefined, exactly as Zod indexes them.
export function parseEach<T>(value: unknown, parseItem: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const items: T[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const parsed = parseItem(value[index]);
    if (parsed === null) return null;
    items.push(parsed);
  }
  return items;
}
