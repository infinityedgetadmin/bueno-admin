import { defineConfig, devices } from "@playwright/test";
import { E2E_DATA_DIR, TEST_SESSION_SECRET } from "./tests/support/store";

const PORT = 4545;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: true,
    timezoneId: "America/New_York",
    locale: "en-US",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Production build, against a throwaway data folder the tests reset and seed themselves.
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/admin/login`,
    timeout: 300_000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
    env: { BUENO_DATA_DIR: E2E_DATA_DIR, ADMIN_SESSION_SECRET: TEST_SESSION_SECRET },
  },
});
