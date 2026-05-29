import { test, expect } from "@playwright/test"

test.describe("LocalCoder app session UI", () => {
  test("loads shell without runtime errors", async ({ page }) => {
    const errors: string[] = []
    page.on("pageerror", (err) => errors.push(err.message))
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 })
    await expect(page.locator("body")).toBeVisible({ timeout: 5_000 })
    expect(errors).toEqual([])
  })

  test("exposes session composer region on session routes", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 })
    const dock = page.locator('[data-component="session-prompt-dock"]').first()
    const home = page.locator('[data-component="getting-started"]').first()
    await expect(dock.or(home)).toBeVisible({ timeout: 8_000 })
  })

  test("shows getting-started on home route", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 })
    await expect(page.locator('[data-component="getting-started"]').first()).toBeVisible({ timeout: 8_000 })
  })
})
