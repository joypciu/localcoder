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
  "bash.exe",
  "wsl.exe",
  "mintty.exe",
])

function existsFile(p: string) {
  try {
    return fs.existsSync(p)
  } catch {
    return false
  }
}

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
 * Explorer double-click: parent is explorer.exe (or conhost). Bun still reports isTTY.
 * Prefer opening the GUI over a broken blank TUI console.
 */
export function isWindowsGuiLaunch(args: string[]): boolean {
  if (process.platform !== "win32") return false
  if (args.length > 0) return false
  const parent = getParentProcessName()
  if (parent === "explorer.exe") return true
  if (parent === "conhost.exe") return true
  if (parent && TERMINAL_PARENTS.has(parent)) return false
  if (!parent) return true
  return !(process.stdin.isTTY && process.stderr.isTTY)
}

export function resolveDesktopGuiExe(cliExePath: string): string | undefined {
  const candidates: string[] = []
  const env = process.env.LOCALCODER_DESKTOP_EXE
  if (env) candidates.push(env)

  const cliDir = path.dirname(cliExePath)
  candidates.push(
    path.join(cliDir, "LocalCoder.exe"),
    path.join(cliDir, "..", "LocalCoder.exe"),
    path.join(cliDir, "..", "..", "..", "..", "desktop", "dist", "win-unpacked", "LocalCoder.exe"),
  )

  const localApp = process.env.LOCALAPPDATA
  if (localApp) {
    candidates.push(
      path.join(localApp, "Programs", "LocalCoder", "LocalCoder.exe"),
      path.join(localApp, "Programs", "LocalCoder Dev", "LocalCoder Dev.exe"),
      path.join(localApp, "Programs", "localcoder-desktop", "LocalCoder.exe"),
    )
  }

  const programFiles = process.env.ProgramFiles
  if (programFiles) {
    candidates.push(path.join(programFiles, "LocalCoder", "LocalCoder.exe"))
  }

  for (const c of candidates) {
    const resolved = path.resolve(c)
    if (existsFile(resolved)) return resolved
  }
  return undefined
}

/** Launch native Electron app, or fall back to browser UI with no console window. */
export function openWindowsGuiLauncher(exePath: string): void {
  const desktop = resolveDesktopGuiExe(exePath)
  if (desktop) {
    cp.spawn(desktop, [], { detached: true, stdio: "ignore", windowsHide: false }).unref()
    return
  }

  cp.spawn(exePath, ["ui", "--hostname", "127.0.0.1"], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  }).unref()
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
