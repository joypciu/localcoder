#!/usr/bin/env bun
/**
 * Build the double-clickable Windows GUI app (Electron + embedded web UI).
 *
 * Output:
 *   packages/desktop/dist/win-unpacked/LocalCoder.exe
 *   packages/desktop/dist/localcoder-desktop-win-x64.exe  (NSIS installer)
 */
import { $ } from "bun"
import path from "path"

const root = path.resolve(import.meta.dir, "../../..")
const desktop = path.join(root, "packages", "desktop")
const localcoder = path.join(root, "packages", "localcoder")

const channel = process.env.LOCALCODER_CHANNEL ?? "prod"
process.env.LOCALCODER_CHANNEL = channel

console.log("[build:win-gui] channel:", channel)
console.log("[build:win-gui] building CLI (for VS Code / terminal)...")
await $`bun run script/build.ts -- --single --skip-embed-web-ui`.cwd(localcoder)

console.log("[build:win-gui] building desktop server bundle...")
await $`bun script/build-node.ts`.cwd(localcoder)

console.log("[build:win-gui] desktop prebuild (icons + sidecar)...")
await $`bun ./scripts/prebuild.ts`.cwd(desktop)

console.log("[build:win-gui] electron-vite production build...")
await $`bun run build`.cwd(desktop)

console.log("[build:win-gui] packaging NSIS installer...")
await $`bun run package:win`.cwd(desktop)

const unpacked = path.join(desktop, "dist", "win-unpacked", "LocalCoder.exe")
const installer = path.join(desktop, "dist", "localcoder-desktop-win-x64.exe")

console.log("")
console.log("[build:win-gui] DONE")
console.log("  GUI (double-click):", unpacked)
console.log("  Installer:", installer)
console.log("  CLI (terminal):", path.join(localcoder, "dist", "localcoder-windows-x64", "bin", "localcoder.exe"))
