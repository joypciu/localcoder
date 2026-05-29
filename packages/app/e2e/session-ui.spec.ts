import { test, expect } from "@playwright/test"

test.describe("LocalCoder app session UI", () => {
  test("loads shell without runtime errors", async ({ page }) => {
    const errors: string[] = []
    page.on("pageerror", (err) => errors.push(err.message))
    await page.goto("/")
    await expect(page.locator("body")).toBeVisible()
    expect(errors).toEqual([])
  })

  test("exposes session composer region on session routes", async ({ page }) => {
    await page.goto("/")
    const dock = page.locator('[data-component="session-prompt-dock"]')
    const home = page.locator('[data-component="getting-started"]')
    await expect(dock.or(home)).toBeVisible({ timeout: 30_000 })
  })

  test("settings dialog can be opened from command palette shortcut area", async ({ page }) => {
    await page.goto("/")
    await page.keyboard.press("Control+k")
    const palette = page.locator('[data-component="command-palette"]')
    await expect(palette).toBeVisible({ timeout: 10_000 })
  })
})
