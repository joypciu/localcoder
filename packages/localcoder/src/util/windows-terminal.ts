import * as cp from "child_process"
import * as fs from "fs"
import * as path from "path"
import { getParentProcessName } from "@/util/windows-gui"

const MODERN_TERMINALS = new Set([
  "wt.exe",
  "windowsterminal.exe",
  "openconsole.exe",
  "code.exe",
  "cursor.exe",
])

const LEGACY_TERMINALS = new Set(["cmd.exe", "conhost.exe"])

function findWindowsTerminalExe(): string | undefined {
  const local = process.env.LOCALAPPDATA
  const candidates = [
    local ? path.join(local, "Microsoft", "WindowsApps", "wt.exe") : undefined,
  ].filter(Boolean) as string[]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  const r = cp.spawnSync("where", ["wt"], { encoding: "utf8", windowsHide: true })
  if (r.status === 0) {
    const line = (r.stdout || "").split(/\r?\n/).find((l) => l.trim().toLowerCase().endsWith("wt.exe"))
    if (line?.trim()) return line.trim()
  }
  return undefined
}

export function isLegacyWindowsConsole(): boolean {
  if (process.platform !== "win32") return false
  if (process.env.LOCALCODER_IN_WT === "1") return false
  const parent = getParentProcessName()
  if (!parent) return false
  if (MODERN_TERMINALS.has(parent)) return false
  if (LEGACY_TERMINALS.has(parent)) return true
  return false
}

export function tryRelaunchInWindowsTerminal(argv: string[]): boolean {
  if (process.platform !== "win32") return false
  if (process.env.LOCALCODER_IN_WT === "1") return false
  if (process.env.LOCALCODER_LEGACY_TERMINAL === "1") return false
  if (!isLegacyWindowsConsole()) return false

  const wt = findWindowsTerminalExe()
  if (!wt) return false

  const env = { ...process.env, LOCALCODER_IN_WT: "1" }
  const childArgs = ["-w", "0", "nt", "--title", "LocalCoder", "--", process.execPath, ...argv.slice(2)]

  cp.spawn(wt, childArgs, { detached: true, stdio: "ignore", windowsHide: false, env }).unref()
  return true
}

export function windowsInputHint(): string {
  if (process.platform !== "win32") {
    return "Shift+Enter newline · Enter send · drag select · RMB menu · Del deletes selection"
  }
  if (process.env.LOCALCODER_LEGACY_TERMINAL === "1" || isLegacyWindowsConsole()) {
    return "Enter newline · Ctrl+Enter send · drag select · RMB menu · Del/Backspace delete · Ctrl+X cut"
  }
  return "Shift+Enter newline · Enter send · drag select · RMB menu · Del/Backspace delete · Ctrl+X cut"
}
