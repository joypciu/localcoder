#!/usr/bin/env bun
/**
 * Headed smoke: launch packaged LocalCoder.exe and verify it stays up.
 * Uses Playwright CDP when DevTools port is exposed; otherwise process + log heuristics.
 *
 * Run from full E2E tier or: bun run scripts/e2e/desktop-exe-smoke.ts
 */
import { spawn, type ChildProcessWithoutNullStreams } from "child_process"
import fs from "fs"
import path from "path"
import { DESKTOP_EXE, ROOT } from "./lib/paths"

const WAIT_MS = 45_000
const ARTIFACTS = path.join(ROOT, "scripts", "e2e", ".artifacts")

function resolvePlaywright() {
  const candidates = [
    path.join(ROOT, "packages", "app", "node_modules", "playwright"),
    path.join(ROOT, "node_modules", "playwright"),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  throw new Error("playwright not installed — run bun install in packages/app")
}

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

async function tryCdpScreenshot(log: string, shotPath: string): Promise<string | undefined> {
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
    const title = (await page.title()).trim()
    await page.screenshot({ path: shotPath, timeout: 30_000 }).catch(() => {})
    return title
  } finally {
    await browser?.close().catch(() => {})
  }
}

async function main() {
  if (!fs.existsSync(DESKTOP_EXE)) {
    throw new Error(`missing ${DESKTOP_EXE} — run full tier or package desktop first`)
  }

  fs.mkdirSync(ARTIFACTS, { recursive: true })
  const shot = path.join(ARTIFACTS, "desktop-launch.png")

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

  const exited = new Promise<number | null>((resolve) => {
    child.on("exit", (code) => resolve(code ?? null))
  })

  const deadline = Date.now() + WAIT_MS
  while (Date.now() < deadline) {
    if (log.includes("server ready") || /DevTools listening on ws:\/\//.test(log)) break
    const code = await Promise.race([exited, sleep(500).then(() => undefined)])
    if (code !== undefined) {
      throw new Error(`LocalCoder.exe exited early (${code})\n${log.slice(-4000)}`)
    }
  }

  if (!log.includes("app starting")) {
    throw new Error(`LocalCoder.exe did not report startup within ${WAIT_MS}ms\n${log.slice(-4000)}`)
  }

  let title: string | undefined
  try {
    title = await tryCdpScreenshot(log, shot)
  } catch (err) {
    log += `\n[cdp-fallback] ${String(err)}`
  }

  await killTree(child)

  if (title) {
    console.log(`[desktop-exe-smoke] OK title="${title}" screenshot=${shot}`)
    return
  }

  if (!log.includes("server ready")) {
    throw new Error(`LocalCoder.exe started but sidecar never became ready\n${log.slice(-4000)}`)
  }

  console.log(`[desktop-exe-smoke] OK headed launch (server ready, pid=${child.pid})`)
}

main().catch((err) => {
  console.error("[desktop-exe-smoke] FAIL", err)
  process.exit(1)
})
