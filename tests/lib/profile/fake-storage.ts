import type { StorageLike } from "@/lib/profile/storage";

type Failures = { get?: boolean; set?: boolean; remove?: boolean; key?: boolean };

export type FakeStorage = StorageLike & {
  failures: Failures;
  keys(): string[];
  raw(key: string): string | null;
  seed(key: string, value: string): void;
};

export function createFakeStorage(failures: Failures = {}): FakeStorage {
  const data = new Map<string, string>();
  const denied = new Error("storage denied");
  return {
    failures,
    get length() {
      return data.size;
    },
    key(index) {
      if (failures.key) throw denied;
      return [...data.keys()][index] ?? null;
    },
    getItem(key) {
      if (failures.get) throw denied;
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      if (failures.set) throw denied;
      data.set(key, value);
    },
    removeItem(key) {
      if (failures.remove) throw denied;
      data.delete(key);
    },
    keys: () => [...data.keys()],
    raw: (key) => data.get(key) ?? null,
    seed: (key, value) => {
      data.set(key, value);
    },
  };
}
