import { defineConfig, devices } from "@playwright/test"

const port = Number(process.env.SHELL_E2E_PORT ?? 5199)

export default defineConfig({
  testDir: "./e2e",
  testMatch: "shell.spec.ts",
  outputDir: "./e2e/test-results",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  reporter: [["line"]],
  webServer: {
    command: "bun run e2e:dev",
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      SHELL_E2E_PROXY: process.env.SHELL_E2E_PROXY,
    },
  },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})
