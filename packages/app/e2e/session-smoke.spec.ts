import { test, expect } from "@playwright/test"

test.describe("LocalCoder app smoke", () => {
  test("loads session page shell", async ({ page }) => {
    await page.goto("/")
    await expect(page.locator("body")).toBeVisible()
  })
})
