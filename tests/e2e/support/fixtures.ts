import { test as base } from "@playwright/test";

import { E2E_NOW } from "./fixture-data";

// 10:00 UTC on the pinned day: far enough from midnight that no timezone moves the calendar date.
const PINNED_INSTANT = new Date(`${E2E_NOW}T10:00:00.000Z`);

// Every page starts on the pinned day: todayIso() reads new Date() in the browser.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.clock.install({ time: PINNED_INSTANT });
    await use(page);
  },
});

export { expect } from "@playwright/test";
