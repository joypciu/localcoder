#!/usr/bin/env bun
/**
 * Optional desktop visual smoke — captures Electron window via CDP and compares PNG baseline.
 * Skipped automatically by run.ts when LocalCoder.exe is not built.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "child_process"
import fs from "fs"
import path from "path"
import { assertPngSnapshot } from "../../lib/snapshot"
import { ARTIFACTS, DESKTOP_EXE, ROOT, resolvePlaywright } from "../../lib/paths"

const WAIT_MS = 45_000
const UPDATE = process.argv.includes("--update") || process.env.VISUAL_UPDATE === "1"
const SNAPSHOT_DIR = path.join(import.meta.dir, "..", "..", "snapshots", "desktop")

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function killTree(child: ChildProcessWithoutNullStreams) {
  if (!child.pid) return
  try {
    spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true })
  } catch {}
  await sleep(1500)
}

async function captureDesktopPng(log: string): Promise<Buffer | undefined> {
  const match = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(log)
  if (!match) return undefined

  const { chromium } = await import(resolvePlaywright())
  const endpoint = `http://127.0.0.1:${match[1]}`
  let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined

  try {
    browser = await chromium.connectOverCDP(endpoint, { timeout: 30_000 })
    const page = browser.contexts()[0]?.pages()[0]
    if (!page) throw new Error("no page in CDP browser")
    await page.waitForLoadState("domcontentloaded", { timeout: 30_000 }).catch(() => {})
    return await page.screenshot({ timeout: 30_000 })
  } finally {
    await browser?.close().catch(() => {})
  }
}

async function main() {
  if (!fs.existsSync(DESKTOP_EXE)) {
    throw new Error(`missing ${DESKTOP_EXE}`)
  }

  fs.mkdirSync(ARTIFACTS, { recursive: true })
  let log = ""
  const child = spawn(DESKTOP_EXE, [], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: false,
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: "1" },
  })

  child.stdout.on("data", (chunk) => {
    log += chunk.toString()
  })
  child.stderr.on("data", (chunk) => {
    log += chunk.toString()
  })

  const started = Date.now()
  let png: Buffer | undefined

  while (Date.now() - started < WAIT_MS) {
    png = await captureDesktopPng(log)
    if (png) break
    await sleep(1000)
  }

  await killTree(child)

  if (!png) {
    console.log("skipped — desktop exe did not expose CDP DevTools port (build with remote debugging or set VISUAL_STRICT_DESKTOP=1 to fail)")
    if (process.env.VISUAL_STRICT_DESKTOP === "1") {
      throw new Error("failed to capture desktop screenshot via CDP within timeout")
    }
    process.exit(0)
  }

  const result = await assertPngSnapshot({
    name: "desktop-launch",
    actual: png,
    dir: SNAPSHOT_DIR,
    update: UPDATE,
  })

  if (!result.ok) {
    throw new Error(`${result.message}${result.diffPath ? `: ${result.diffPath}` : ""}`)
  }

  console.log(`desktop visual snapshot ${result.updated ? "updated" : "matched"} (${SNAPSHOT_DIR})`)
}

await main()
