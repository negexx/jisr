import type { Page } from "@playwright/test";

import type { Profile } from "@/data-schema/profile";

import { PROFILE_KEY } from "./fixture-data";

// Runs before every document of the page (reloads and navigations too) and only writes when the
// key is absent, so a test that clears the data is not seeded again by its next navigation.
export async function seedProfile(page: Page, profile: Profile): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value);
    },
    [PROFILE_KEY, JSON.stringify(profile)] as const,
  );
}

// Makes every access to localStorage throw, as in a browser that blocks site data.
export async function blockLocalStorage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });
  });
}
