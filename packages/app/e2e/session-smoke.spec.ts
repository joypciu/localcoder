import { test, expect } from "@playwright/test"

test.describe("LocalCoder app smoke", () => {
  test("loads session page shell", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 })
    await expect(page.locator("body")).toBeVisible({ timeout: 5_000 })
  })
})
