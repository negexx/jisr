import { childExitCode } from "@scripts/db/harness";
import { describe, expect, it } from "vitest";

describe("childExitCode", () => {
  it("passes a numeric exit code through, success included", () => {
    expect(childExitCode(0)).toBe(0);
    expect(childExitCode(3)).toBe(3);
  });

  it("reports a child killed by a signal (no exit code) as a failure", () => {
    expect(childExitCode(null)).toBe(1);
  });
});
