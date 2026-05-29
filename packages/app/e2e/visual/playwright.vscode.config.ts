import path from "path"
import { fileURLToPath } from "url"
import { defineConfig, devices } from "@playwright/test"

const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(here, "..", "..", "..", "..")
const snapshotDir = path.join(ROOT, "scripts", "visual-test", "snapshots", "vscode")
const CHAT_HTML = path.join(ROOT, "sdks", "vscode", "media", "chat.html")

export default defineConfig({
  testDir: here,
  testMatch: "**/vscode-chat.visual.spec.ts",
  outputDir: path.join(ROOT, "scripts", "visual-test", ".artifacts", "vscode-test-results"),
  timeout: 20_000,
  expect: {
    timeout: 8_000,
    toHaveScreenshot: {
      maxDiffPixels: 120,
      snapshotPathTemplate: path.join(snapshotDir, "{testName}/{arg}{ext}"),
    },
  },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["line"]],
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 420, height: 760 },
      },
    },
  ],
  metadata: {
    chatHtml: CHAT_HTML,
    repoRoot: ROOT,
    snapshotDir,
  },
})
