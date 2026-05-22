#!/usr/bin/env bun
/** Kill running app and delete prior pack artifacts that lock electron-builder. */
import fs from "fs"
import path from "path"
import { $ } from "bun"

const desktop = path.resolve(import.meta.dir, "..")
const dist = path.join(desktop, "dist")
const packTmp = path.join(desktop, ".pack-tmp")

async function killApp() {
  if (process.platform !== "win32") return
  for (const name of ["LocalCoder.exe", "LocalCoder Dev.exe"]) {
    await $`taskkill /F /IM ${name} /T`.quiet().nothrow()
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function rmWithRetry(target: string, tries = 8) {
  for (let i = 0; i < tries; i++) {
    try {
      if (!fs.existsSync(target)) return true
      const stat = fs.statSync(target)
      if (stat.isDirectory()) fs.rmSync(target, { recursive: true, force: true })
      else fs.unlinkSync(target)
      return true
    } catch {
      await sleep(750 * (i + 1))
    }
  }
  return false
}

await killApp()

await rmWithRetry(packTmp)

if (fs.existsSync(dist)) {
  for (const name of fs.readdirSync(dist)) {
    if (name === "win-unpacked" || name.endsWith("-portable.exe") || name.endsWith(".7z")) {
      const ok = await rmWithRetry(path.join(dist, name))
      if (!ok) console.warn("[prepack-win] still locked:", name)
    }
  }
}
