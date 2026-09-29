import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const COLD_BUILD_TIMEOUT_MS = 10 * 60 * 1000;

// webServer.env is inherited from the parent process, so SWC_NATIVE_BINDING_CACHE and E2E_DATA_DIR
// reach `pnpm build:e2e` whenever the caller set them.
export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `pnpm build:e2e && pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}/fr`,
    reuseExistingServer: !process.env.CI,
    timeout: COLD_BUILD_TIMEOUT_MS,
    stdout: "pipe",
    stderr: "pipe",
  },
});
