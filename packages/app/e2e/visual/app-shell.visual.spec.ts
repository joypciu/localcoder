import { test, expect } from "@playwright/test"

test.describe("app web ui visual", () => {
  test("home getting-started shell", async ({ page }) => {
    const errors: string[] = []
    page.on("pageerror", (err) => errors.push(err.message))

    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 20_000 })
    await expect(page.locator('[data-component="getting-started"]').first()).toBeVisible({ timeout: 10_000 })
    expect(errors).toEqual([])
    await expect(page.locator("body")).toHaveScreenshot("app-home-getting-started.png")
  })

  test("session composer dock region", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 20_000 })
    const dock = page.locator('[data-component="session-prompt-dock"]').first()
    const home = page.locator('[data-component="getting-started"]').first()
    await expect(dock.or(home)).toBeVisible({ timeout: 10_000 })
    await expect(page.locator("body")).toHaveScreenshot("app-session-shell.png")
  })
})
