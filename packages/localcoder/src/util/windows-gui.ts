import * as cp from "child_process"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"

const TERMINAL_PARENTS = new Set([
  "cmd.exe",
  "powershell.exe",
  "pwsh.exe",
  "windowsterminal.exe",
  "wt.exe",
  "code.exe",
  "cursor.exe",
  "conhost.exe",
  "bash.exe",
  "wsl.exe",
  "mintty.exe",
])

export function getParentProcessName(): string | undefined {
  if (process.platform !== "win32") return undefined
  try {
    const script =
      "$p = (Get-CimInstance Win32_Process -Filter \"ProcessId=$PID\").ParentProcessId; " +
      "(Get-CimInstance Win32_Process -Filter \"ProcessId=$p\").Name"
    const r = cp.spawnSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { encoding: "utf8", timeout: 5000, windowsHide: true },
    )
    if (r.status !== 0) return undefined
    return (r.stdout || "").trim().toLowerCase() || undefined
  } catch {
    return undefined
  }
}

/**
 * Explorer double-click: parent is explorer.exe. Bun still reports isTTY and a console hwnd.
 */
export function isWindowsGuiLaunch(args: string[]): boolean {
  if (process.platform !== "win32") return false
  if (args.length > 0) return false
  const parent = getParentProcessName()
  if (!parent) return false
  if (parent === "explorer.exe") return true
  if (TERMINAL_PARENTS.has(parent)) return false
  // Unknown parent (e.g. CI): prefer TUI when stderr is a TTY
  return !(process.stdin.isTTY || process.stderr.isTTY)
}

export function openWindowsConsoleLauncher(version: string, exePath: string): void {
  const bat = path.join(os.tmpdir(), `localcoder-launch-${process.pid}.cmd`)
  const exe = exePath.replace(/"/g, "\"\"")
  const lines = [
    "@echo off",
    "title LocalCoder",
    "color 0A",
    "cls",
    "echo.",
    "echo   LocalCoder " + version,
    "echo   ----------------",
    "echo.",
    "echo   LocalCoder is a terminal application.",
    "echo   Open Command Prompt or PowerShell and run:",
    "echo.",
    "echo     localcoder --help",
    "echo     localcoder",
    "echo.",
    `"${exe}" --help`,
    "echo.",
    "pause",
  ]
  fs.writeFileSync(bat, lines.join("\r\n"), "utf8")

  cp.spawn("cmd.exe", ["/c", "start", "cmd", "/k", bat], {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  }).unref()
}
