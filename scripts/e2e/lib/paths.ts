import fs from "fs"
import path from "path"

export const ROOT = path.join(import.meta.dir, "..", "..", "..")
export const PKG = path.join(ROOT, "packages", "localcoder")
export const DESKTOP = path.join(ROOT, "packages", "desktop")
export const VSCODE = path.join(ROOT, "sdks", "vscode")
export const EXE = path.join(PKG, "dist", "localcoder-windows-x64", "bin", "localcoder.exe")
export const DESKTOP_EXE = path.join(DESKTOP, "dist", "win-unpacked", "LocalCoder.exe")
export const DESKTOP_INSTALLER = path.join(DESKTOP, "dist", "localcoder-desktop-win-x64.exe")

export function resolveBun(): string {
  const exe = process.execPath
  if (/bun(\.exe)?$/i.test(exe)) return exe
  const home = process.env.USERPROFILE || process.env.HOME || ""
  const candidates = [
    path.join(process.env.APPDATA || "", "npm", "node_modules", "bun", "bin", "bun.exe"),
    path.join(home, ".bun", "bin", "bun.exe"),
    "bun.exe",
    "bun",
  ]
  for (const c of candidates) {
    if (c && (c === "bun" || c === "bun.exe" || fs.existsSync(c))) return c
  }
  return exe
}

export function findPortableExe(): string | undefined {
  const dist = path.join(DESKTOP, "dist")
  if (!fs.existsSync(dist)) return undefined
  return fs.readdirSync(dist).find((f) => f.endsWith("-portable.exe"))
}

export function fileSizeMb(filePath: string): string {
  return (fs.statSync(filePath).size / (1024 * 1024)).toFixed(1)
}
