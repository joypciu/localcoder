import { test, expect } from "@playwright/test"

test.describe("Desktop shell UI", () => {
  test("mock layout: sidebar, composer, markdown, permission, diff", async ({ page }) => {
    await page.goto("/?mock=1", { waitUntil: "domcontentloaded" })
    await expect(page.getByTestId("shell-root")).toBeVisible()
    await expect(page.getByTestId("session-list")).toBeVisible()
    await expect(page.getByTestId("composer")).toBeVisible()
    await expect(page.getByTestId("composer-input")).toBeVisible()
    await expect(page.getByTestId("permission-banner")).toBeVisible()
    await expect(page.getByTestId("tool-diff")).toContainText("LocalCoder shell UI")
    await expect(page.getByTestId("msg-assistant-body")).toContainText("local-first")
  })

  test("permission banner shows actions in mock mode", async ({ page }) => {
    await page.goto("/?mock=1")
    await expect(page.getByTestId("permission-banner")).toBeVisible()
    await expect(page.getByTestId("perm-once")).toBeVisible()
    await expect(page.getByTestId("perm-always")).toBeVisible()
    await expect(page.getByTestId("perm-reject")).toBeVisible()
  })

  test("composer accepts input in mock mode", async ({ page }) => {
    await page.goto("/?mock=1")
    await page.getByTestId("composer-input").fill("test message")
    await page.getByTestId("send-btn").click()
    await page.waitForSelector(".lc-user-text", { hasText: "test message", timeout: 5000 })
  })

  test("permission mode cycles", async ({ page }) => {
    await page.goto("/?mock=1")
    const btn = page.getByTestId("perm-mode")
    await expect(btn).toHaveText("interactive")
    await btn.click()
    await expect(btn).toHaveText("accept")
    await btn.click()
    await expect(btn).toHaveText("reject")
  })
})
