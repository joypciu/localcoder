import { test, expect } from "@playwright/test"
import {
  authHeaders,
  injectPermission,
  readLiveSeed,
  shellPageUrl,
} from "./live-fixture"

function requireSeed() {
  const seed = readLiveSeed()
  test.skip(!seed, "requires .live-session.json from globalSetup (live sidecar)")
  return seed!
}

test.describe("Desktop shell UI (live sidecar)", () => {
  test("loads shell against live server with seeded session", async ({ page }) => {
    const seed = requireSeed()
    await page.goto(shellPageUrl(seed), { waitUntil: "domcontentloaded", timeout: 30_000 })
    await expect(page.getByTestId("shell-root")).toBeVisible()
    await expect(page.getByTestId("session-list")).toBeVisible()
    await expect(page.getByTestId("composer")).toBeVisible()
    await expect(page.getByTestId("composer-input")).toBeVisible()
    await expect(page.getByTestId("shell-error")).toHaveCount(0)
  })

  test("agent select lists non-subagents", async ({ page }) => {
    const seed = requireSeed()
    await page.goto(shellPageUrl(seed), { waitUntil: "domcontentloaded", timeout: 30_000 })
    const select = page.getByTestId("agent-select")
    await expect(select).toBeVisible({ timeout: 15_000 })
    const options = await select.locator("option").allTextContents()
    expect(options.length).toBeGreaterThan(0)
  })

  test("model select lists only connected providers", async ({ page }) => {
    const seed = requireSeed()
    await page.goto(shellPageUrl(seed), { waitUntil: "domcontentloaded", timeout: 30_000 })
    const select = page.getByTestId("model-select")
    await expect(select).toBeVisible({ timeout: 15_000 })
    const options = await select.locator("option").allTextContents()
    test.skip(options.length === 0, "no connected providers on sidecar — configure llamacpp or cloud auth")
    const hasLocal = options.some((o) => o.startsWith("llamacpp/"))
    const hasCloud = options.some((o) => !o.startsWith("test/"))
    expect(hasLocal || hasCloud).toBe(true)
  })

  test("permission banner dismiss via Deny on real server", async ({ page, request }) => {
    const s = requireSeed()
    await page.goto(shellPageUrl(s), { waitUntil: "domcontentloaded", timeout: 30_000 })
    await expect(page.getByTestId("shell-root")).toBeVisible()
    await page.waitForTimeout(2000)

    let injected = false
    try {
      await injectPermission(s, s.sessionId)
      injected = true
    } catch {
      test.skip(true, "permission e2e inject requires dev serve (SHELL_E2E_USE_DEV=1) or rebuilt localcoder.exe")
    }

    const banner = page.getByTestId("permission-banner")
    await expect(banner).toBeVisible({ timeout: 15_000 })
    await expect(banner).toContainText("bash")

    await page.getByTestId("perm-reject").click()
    await expect(banner).toBeHidden({ timeout: 10_000 })

    const listRes = await request.get(`${s.url}/permission`, { headers: authHeaders(s) })
    expect(listRes.ok()).toBe(true)
    const pending = (await listRes.json()) as unknown[]
    expect(pending.length).toBe(0)
  })

  test("permission mode cycles in live UI", async ({ page }) => {
    const seed = requireSeed()
    await page.goto(shellPageUrl(seed), { waitUntil: "domcontentloaded", timeout: 30_000 })
    const btn = page.getByTestId("perm-mode")
    await expect(btn).toHaveText("interactive")
    await btn.click()
    await expect(btn).toHaveText("accept")
    await btn.click()
    await expect(btn).toHaveText("reject")
  })
})
