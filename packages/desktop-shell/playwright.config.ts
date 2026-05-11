import { defineConfig, devices } from "@playwright/test"

const port = Number(process.env.SHELL_E2E_PORT ?? 5199)

export default defineConfig({
  testDir: "./e2e",
  testMatch: "shell.spec.ts",
  outputDir: "./e2e/test-results",
  timeout: 15_000,
  fullyParallel: true,
  reporter: [["line"]],
  webServer: {
    command: "bun run e2e:dev",
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})
