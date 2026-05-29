import path from "path"
import { fileURLToPath } from "url"
import { test, expect } from "@playwright/test"

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..")
const CHAT_HTML = path.join(ROOT, "sdks", "vscode", "media", "chat.html")

function chatUrl() {
  return `file:///${CHAT_HTML.replace(/\\/g, "/")}`
}

async function installVscodeMock(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    ;(window as unknown as { __vscMessages: unknown[] }).__vscMessages = []
    ;(window as unknown as { acquireVsCodeApi: () => unknown }).acquireVsCodeApi = () => ({
      postMessage(message: unknown) {
        ;(window as unknown as { __vscMessages: unknown[] }).__vscMessages.push(message)
      },
      getState: () => ({}),
      setState: () => {},
    })
  })
}

async function postToWebview(page: import("@playwright/test").Page, message: Record<string, unknown>) {
  await page.evaluate((payload) => {
    window.dispatchEvent(new MessageEvent("message", { data: payload }))
  }, message)
}

test.describe("vscode chat webview visual", () => {
  test.beforeEach(async ({ page }) => {
    await installVscodeMock(page)
    await page.goto(chatUrl(), { waitUntil: "domcontentloaded", timeout: 15_000 })
  })

  test("ready header after init", async ({ page }) => {
    await postToWebview(page, { type: "init", backend: "localcoder" })
    await expect(page.locator("#conn-dot")).toHaveClass(/ok/)
    await expect(page.locator("#hdr")).toHaveScreenshot("vscode-header-ready.png")
  })

  test("settings overlay opens", async ({ page }) => {
    await postToWebview(page, { type: "init", backend: "localcoder" })
    await postToWebview(page, { type: "openSettings" })
    await expect(page.locator("#cfg-overlay")).toHaveClass(/open/)
    await expect(page.locator("body")).toHaveScreenshot("vscode-settings-overlay.png")
  })

  test("messages and compact banner render", async ({ page }) => {
    await postToWebview(page, {
      type: "init",
      backend: "localcoder",
    })
    await postToWebview(page, {
      type: "messages",
      sessionId: "ses_test",
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "Hi there — visual test." },
        { role: "assistant", content: "", summary: true },
      ],
    })
    await expect(page.locator("#msgs")).toContainText("hello")
    await expect(page.locator("#msgs")).toContainText("Context compacted")
    await expect(page.locator("#msgs")).not.toContainText("## Goal")
    await expect(page.locator("#msgs")).toHaveScreenshot("vscode-messages-compact.png")
  })

  test("usage meter shows context percent", async ({ page }) => {
    await postToWebview(page, { type: "init", backend: "localcoder" })
    await postToWebview(page, {
      type: "usage",
      input: 1200,
      output: 400,
      messages: 2,
      contextTokens: 13100,
      contextLimit: 14300,
      contextPercent: 92,
    })
    await expect(page.locator("#usage-bar")).toHaveClass(/show/)
    await expect(page.locator("#usage-bar")).toHaveScreenshot("vscode-usage-meter.png")
  })
})
