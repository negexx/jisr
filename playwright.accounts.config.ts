import { defineConfig, devices } from "@playwright/test";

// The signed-in journey (ADR 0013, ruling Q5). The accounts switch is read when the static pages are
// prerendered, so this suite needs its own BUILD with the switch on: a second config, a second port
// and a second database, never the guest config. The switch and the test secrets live only in this
// webServer env (they are not in any .env file, in CI settings, in Vercel or in the docs examples).
//
// Next has no env override for distDir, so the guest `.next` is shared: this build replaces it. Run the
// two suites one after the other (each rebuilds what it needs), and `pnpm data:build` afterwards.
const PORT = 3500;
const DB_PORT = 54330;
const ORIGIN = `http://localhost:${PORT}`;
const COLD_BUILD_TIMEOUT_MS = 10 * 60 * 1000;

export default defineConfig({
  testDir: "tests/e2e-accounts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // No retries: the journey shares one database and real cooldowns, so a retry would mask a real
  // ordering bug as flakiness.
  retries: 0,
  // Its own folder: the guest suite runs first in the same job and writes playwright-report/.
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "playwright-report-accounts" }]]
    : "list",
  outputDir: "test-results-accounts",
  use: {
    baseURL: ORIGIN,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: `pnpm build:e2e && pnpm db:harness --port ${DB_PORT} --exec "pnpm exec next start -p ${PORT}"`,
    url: `${ORIGIN}/fr`,
    reuseExistingServer: !process.env.CI,
    timeout: COLD_BUILD_TIMEOUT_MS,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ACCOUNTS_ENABLED: "1",
      BETTER_AUTH_SECRET: "e2e-only-secret-for-the-accounts-test-server-0000",
      BETTER_AUTH_URL: ORIGIN,
      JISR_EMAIL_FILE_TRANSPORT: "1",
      // A real provider key in the caller's shell must never win over the file transport.
      BREVO_API_KEY: "",
    },
  },
});
