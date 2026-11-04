import { defineConfig, devices } from "@playwright/test";

import { E2E_RECEIPT_TIMEOUT_MS } from "./tests/e2e/support/e2e-env";

const PORT = Number(process.env.SIDECAR_E2E_PORT ?? 3210);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    // A reused server must have been started with the same receipt deadline, or the outcome-unknown journey waits the default 60 s.
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { NEXT_PUBLIC_SIDECAR_RECEIPT_TIMEOUT_MS: String(E2E_RECEIPT_TIMEOUT_MS) },
  },
});
