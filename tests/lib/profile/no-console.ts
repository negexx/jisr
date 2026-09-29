import { afterEach, beforeEach, expect, type MockInstance, vi } from "vitest";

const METHODS = ["log", "info", "warn", "error", "debug", "trace"] as const;

// The profile holds grades and nationality: nothing in this module may ever reach a console.
export function forbidConsole(): void {
  let spies: MockInstance[] = [];
  beforeEach(() => {
    spies = METHODS.map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
  });
  afterEach(() => {
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
}
