import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { test, expect } from "@playwright/test"

const here = path.dirname(fileURLToPath(import.meta.url))
const seedPath = path.join(here, ".live-session.json")

type LiveSeed = {
  dirSlug: string
  sessionId: string
  authToken: string
}

function readSeed(): LiveSeed | undefined {
  if (!fs.existsSync(seedPath)) return undefined
  try {
    return JSON.parse(fs.readFileSync(seedPath, "utf8")) as LiveSeed
  } catch {
    return undefined
  }
}

test.describe("live session context meter @live", () => {
  test.skip(() => process.env.PLAYWRIGHT_LIVE_SESSION !== "1", "run via test:e2e:live")

  const seed = readSeed()
  test.skip(!seed, "requires .live-session.json from globalSetup")

  test("shows context meter with token stats on seeded session", async ({ page }) => {
    const url = `/${seed!.dirSlug}/session/${seed!.sessionId}?auth_token=${encodeURIComponent(seed!.authToken)}`
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 })
    const meter = page.locator('[data-component="session-context-meter"]')
    await expect(meter).toBeVisible({ timeout: 12_000 })
    await expect(meter).toContainText(/1,000|1000/)
    await expect(meter).toContainText(/ctx/i)
  })

  test("parent session has composer but no subagent bar", async ({ page }) => {
    const url = `/${seed!.dirSlug}/session/${seed!.sessionId}?auth_token=${encodeURIComponent(seed!.authToken)}`
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 })
    await expect(page.locator('[data-component="session-prompt-dock"]')).toBeVisible({ timeout: 12_000 })
    await expect(page.locator('[data-component="session-subagent-bar"]')).toHaveCount(0)
  })
})
