import { defineConfig, devices } from "@playwright/test"

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3000)
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`
const serverHost = process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"
const serverPort = process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"
const live = process.env.PLAYWRIGHT_LIVE_SESSION === "1"
const command = `bun run dev -- --host 127.0.0.1 --port ${port}`
const workers = Number(process.env.PLAYWRIGHT_WORKERS ?? 1)
const reporter = [["html", { outputFolder: "e2e/playwright-report", open: "never" }], ["line"]] as const

if (process.env.PLAYWRIGHT_JUNIT_OUTPUT) {
  reporter.push(["junit", { outputFile: process.env.PLAYWRIGHT_JUNIT_OUTPUT }])
}

export default defineConfig({
  globalSetup: live ? "./e2e/global-setup.ts" : "./e2e/prep.ts",
  globalTeardown: live ? "./e2e/global-teardown.ts" : undefined,
  testDir: "./e2e",
  outputDir: "./e2e/test-results",
  timeout: 20_000,
  expect: {
    timeout: 8_000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers,
  reporter,
  // Live suite starts Vite in globalSetup to avoid webServer/globalSetup race hangs.
  webServer: live
    ? undefined
    : {
        command,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 45_000,
        env: {
          VITE_LOCALCODER_SERVER_HOST: serverHost,
          VITE_LOCALCODER_SERVER_PORT: serverPort,
        },
      },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      grepInvert: live ? undefined : /@live/,
    },
  ],
})
