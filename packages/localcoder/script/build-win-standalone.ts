#!/usr/bin/env bun
/**
 * Standalone Windows GUI — single portable .exe, no Bun/CLI/terminal required at runtime.
 *
 * Env:
 *   LOCALCODER_FAST_PACK=1  — skip portable compression; output win-unpacked only (~1 min)
 *
 * Output:
 *   packages/desktop/dist/LocalCoder-<version>-portable.exe
 *   packages/desktop/dist/win-unpacked/LocalCoder.exe  (fast mode)
 */
import { $ } from "bun"
import fs from "fs"
import path from "path"

const root = path.resolve(import.meta.dir, "../../..")
const desktop = path.join(root, "packages", "desktop")
const localcoder = path.join(root, "packages", "localcoder")
const fast = process.env.LOCALCODER_FAST_PACK === "1"

process.env.LOCALCODER_CHANNEL = process.env.LOCALCODER_CHANNEL ?? "prod"
process.env.LOCALCODER_STANDALONE = "1"

const t0 = Date.now()
const step = (msg: string) => console.log(`[build:win-standalone][${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`)

step(`channel=${process.env.LOCALCODER_CHANNEL} fast=${fast}`)

const nodeMarker = path.join(localcoder, "dist", "node", "node.js")
if (fs.existsSync(nodeMarker)) {
  step("reuse server bundle (dist/node exists)")
} else {
  step("embedding server bundle...")
  await $`bun script/build-node.ts`.cwd(localcoder)
}

step("icons...")
await $`bun ./scripts/copy-icons.ts prod`.cwd(desktop)

step("electron-vite build...")
await $`bunx electron-vite build`.cwd(desktop)

step("prepack cleanup...")
await $`bun ./scripts/prepack-win.ts`.cwd(desktop)

const finalDist = path.join(desktop, "dist")
// Same drive as dist so rename works; avoids AV locks on existing dist artifacts.
const tempOut = path.join(desktop, ".pack-tmp")
rmSafe(tempOut)
fs.mkdirSync(tempOut, { recursive: true })
process.env.LOCALCODER_BUILD_OUTPUT = tempOut
step(`packaging → ${tempOut}`)

if (fast) {
  process.env.LOCALCODER_FAST_PACK = "1"
  await $`bunx electron-builder --win dir --config electron-builder.config.ts`.cwd(desktop)
} else {
  process.env.LOCALCODER_FAST_PACK = "0"
  await $`bunx electron-builder --win portable --config electron-builder.config.ts`.cwd(desktop)
}

fs.mkdirSync(finalDist, { recursive: true })
for (const name of fs.readdirSync(tempOut)) {
  moveEntry(path.join(tempOut, name), path.join(finalDist, name))
}
rmSafe(tempOut)

const portable = fs.readdirSync(finalDist).find((f) => f.endsWith("-portable.exe"))
const unpacked = path.join(finalDist, "win-unpacked", "LocalCoder.exe")

console.log("")
step("DONE")
if (fast && fs.existsSync(unpacked)) {
  console.log("  Fast GUI (double-click):", unpacked)
} else if (portable) {
  console.log("  Portable GUI (double-click):", path.join(finalDist, portable))
} else if (fs.existsSync(unpacked)) {
  console.log("  GUI (double-click):", unpacked)
} else {
  console.log("  Check:", finalDist)
}

function rmSafe(p: string) {
  try {
    if (!fs.existsSync(p)) return
    const s = fs.statSync(p)
    if (s.isDirectory()) fs.rmSync(p, { recursive: true, force: true })
    else fs.unlinkSync(p)
  } catch {}
}

function moveEntry(src: string, dest: string) {
  rmSafe(dest)
  try {
    fs.renameSync(src, dest)
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    if (err.code !== "EXDEV" && err.code !== "EPERM") throw e
    fs.cpSync(src, dest, { recursive: true })
    rmSafe(src)
  }
}