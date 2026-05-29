import fs from "fs"
import path from "path"

export const ROOT = path.join(import.meta.dir, "..", "..", "..")
export const PKG = path.join(ROOT, "packages", "localcoder")
export const APP = path.join(ROOT, "packages", "app")
export const VSCODE = path.join(ROOT, "sdks", "vscode")
export const DESKTOP = path.join(ROOT, "packages", "desktop")
export const CHAT_HTML = path.join(VSCODE, "media", "chat.html")
export const DESKTOP_EXE = path.join(DESKTOP, "dist", "win-unpacked", "LocalCoder.exe")

export const SNAPSHOT_ROOT = path.join(import.meta.dir, "..", "snapshots")
export const TUI_SNAPSHOTS = path.join(SNAPSHOT_ROOT, "tui")
export const ARTIFACTS = path.join(import.meta.dir, "..", ".artifacts")

export function resolvePlaywright(): string {
  const candidates = [
    path.join(APP, "node_modules", "playwright"),
    path.join(ROOT, "node_modules", "playwright"),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  throw new Error("playwright not installed — run bun install in packages/app")
}
