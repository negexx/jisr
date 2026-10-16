import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const COLD_BUILD_TIMEOUT_MS = 10 * 60 * 1000;

// webServer.env is inherited from the parent process, so SWC_NATIVE_BINDING_CACHE and E2E_DATA_DIR
// reach `pnpm build:e2e` whenever the caller set them.
//
// The webServer command chain boots the in-process PGlite test database (TCP socket) and applies
// migrations BEFORE `next start`, in one process, so ordering is deterministic and never depends
// on globalSetup. `pnpm db:harness --exec` injects DATABASE_URL into the Next process and tears
// the database down when it exits. See tests/db/README.md.
export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: Boolean(process.env.CI),
  // A retry on CI only: a spec that needs one locally is a flaky spec to fix, not to hide.
  retries: process.env.CI ? 1 : 0,
  // ... but a test that only passed on its retry still fails the run, so a retry cannot hide a flake.
  failOnFlakyTests: Boolean(process.env.CI),
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
    command: `pnpm build:e2e && pnpm db:harness --exec "pnpm exec next start -p ${PORT}"`,
    url: `http://localhost:${PORT}/fr`,
    reuseExistingServer: !process.env.CI,
    timeout: COLD_BUILD_TIMEOUT_MS,
    stdout: "pipe",
    stderr: "pipe",
    // The harness spawns `next` in its own process group, so Playwright's default SIGKILL would
    // orphan it and leave the inherited stdout/stderr pipes open, hanging the teardown. SIGTERM lets
    // the harness stop `next` and PGlite itself (scripts/db/harness-serve.ts). Ignored on Windows.
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
  },
});
