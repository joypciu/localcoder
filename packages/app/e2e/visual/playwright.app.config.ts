import path from "path"
import { fileURLToPath } from "url"
import { defineConfig, devices } from "@playwright/test"

const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(here, "..", "..", "..", "..")
const snapshotDir = path.join(ROOT, "scripts", "visual-test", "snapshots", "app")
const port = Number(process.env.PLAYWRIGHT_PORT ?? 3010)
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`
const serverHost = process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"
const serverPort = process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"
const APP = path.join(ROOT, "packages", "app")

export default defineConfig({
  testDir: here,
  testMatch: "**/app-shell.visual.spec.ts",
  outputDir: path.join(ROOT, "scripts", "visual-test", ".artifacts", "app-test-results"),
  timeout: 30_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      maxDiffPixels: 200,
      snapshotPathTemplate: path.join(snapshotDir, "{testName}/{arg}{ext}"),
    },
  },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["line"]],
  webServer: {
    command: `bun run dev -- --host 127.0.0.1 --port ${port}`,
    cwd: APP,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      VITE_LOCALCODER_SERVER_HOST: serverHost,
      VITE_LOCALCODER_SERVER_PORT: serverPort,
    },
  },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
})
