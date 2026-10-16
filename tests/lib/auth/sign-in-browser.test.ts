// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import {
  clearSignInBrowser,
  readSignInBrowser,
  rememberSignInBrowser,
  SIGN_IN_BROWSER_KEY,
} from "@/lib/auth/sign-in-browser";

// Ruling Q19: the confirm page hands the landing one fact — was this browser the one that asked for
// the link — through sessionStorage. It is read without being consumed, so a reload of the landing
// keeps the other-browser warning instead of falling back to the import flow, and it is cleared on
// sign-out (and overwritten by the next magic-link confirm).

describe("the sign-in browser flag", () => {
  afterEach(() => window.sessionStorage.clear());

  it("remembers an other-browser sign-in and reads it without consuming it", () => {
    rememberSignInBrowser(true);
    expect(window.sessionStorage.getItem(SIGN_IN_BROWSER_KEY)).toBe("other");
    expect(readSignInBrowser()).toBe("other");
    expect(readSignInBrowser()).toBe("other");
  });

  it("remembers a same-browser sign-in", () => {
    rememberSignInBrowser(false);
    expect(readSignInBrowser()).toBe("same");
  });

  it("reads an absent or unrecognised value as no flag, and clears on demand", () => {
    expect(readSignInBrowser()).toBeNull();
    window.sessionStorage.setItem(SIGN_IN_BROWSER_KEY, "garbage");
    expect(readSignInBrowser()).toBeNull();
    rememberSignInBrowser(true);
    clearSignInBrowser();
    expect(readSignInBrowser()).toBeNull();
  });
});
