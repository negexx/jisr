// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import {
  rememberSignInBrowser,
  SIGN_IN_BROWSER_KEY,
  takeSignInBrowser,
} from "@/lib/auth/sign-in-browser";

// Ruling Q19: the confirm page hands the landing one fact — was this browser the one that asked for
// the link — through sessionStorage, read once and cleared.

describe("the sign-in browser flag", () => {
  afterEach(() => window.sessionStorage.clear());

  it("remembers an other-browser sign-in and takes it exactly once", () => {
    rememberSignInBrowser(true);
    expect(window.sessionStorage.getItem(SIGN_IN_BROWSER_KEY)).toBe("other");
    expect(takeSignInBrowser()).toBe("other");
    expect(takeSignInBrowser()).toBeNull();
  });

  it("remembers a same-browser sign-in", () => {
    rememberSignInBrowser(false);
    expect(takeSignInBrowser()).toBe("same");
  });

  it("reads an absent or unrecognised value as no flag", () => {
    expect(takeSignInBrowser()).toBeNull();
    window.sessionStorage.setItem(SIGN_IN_BROWSER_KEY, "garbage");
    expect(takeSignInBrowser()).toBeNull();
  });
});
