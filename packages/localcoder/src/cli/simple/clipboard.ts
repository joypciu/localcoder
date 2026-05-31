import { platform } from "os"
import { spawn } from "child_process"

/**
 * Copy text to the system clipboard.
 * Falls back through: OSC 52 → native tools → clipboardy
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    // OSC 52 escape sequence (works over SSH)
    if (process.stdout.isTTY) {
      const base64 = Buffer.from(text).toString("base64")
      const osc52 = `\x1b]52;c;${base64}\x07`
      const passthrough = process.env["TMUX"] || process.env["STY"]
      const sequence = passthrough ? `\x1bPtmux;\x1b${osc52}\x1b\\` : osc52
      process.stdout.write(sequence)
    }

    const os = platform()

    if (os === "darwin") {
      const escaped = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
      const proc = spawn("osascript", ["-e", `set the clipboard to "${escaped}"`], {
        stdio: "ignore",
      })
      await new Promise<void>((resolve) => proc.once("exit", () => resolve()))
      return true
    }

    if (os === "linux") {
      const cmd = process.env["WAYLAND_DISPLAY"] ? "wl-copy" : "xclip"
      const args = cmd === "xclip" ? ["-selection", "clipboard"] : []
      const proc = spawn(cmd, args, { stdio: ["pipe", "ignore", "ignore"] })
      if (proc.stdin) {
        proc.stdin.write(text)
        proc.stdin.end()
        await new Promise<void>((resolve) => proc.once("exit", () => resolve()))
        return true
      }
    }

    if (os === "win32") {
      const proc = spawn(
        "powershell.exe",
        [
          "-NonInteractive",
          "-NoProfile",
          "-Command",
          "[Console]::InputEncoding = [System.Text.Encoding]::UTF8; Set-Clipboard -Value ([Console]::In.ReadToEnd())",
        ],
        { stdio: ["pipe", "ignore", "ignore"] },
      )
      if (proc.stdin) {
        proc.stdin.write(text)
        proc.stdin.end()
        await new Promise<void>((resolve) => proc.once("exit", () => resolve()))
        return true
      }
    }

    // Final fallback: clipboardy
    const { default: clipboardy } = await import("clipboardy")
    await clipboardy.write(text)
    return true
  } catch {
    return false
  }
}

/**
 * Paste text from the system clipboard.
 * Returns null if unavailable or on error.
 */
export async function pasteFromClipboard(): Promise<string | null> {
  try {
    const os = platform()

    if (os === "darwin") {
      const proc = spawn("pbpaste", [], { stdio: ["ignore", "pipe", "ignore"] })
      return await new Promise<string | null>((resolve) => {
        let out = ""
        proc.stdout?.on("data", (d: Buffer) => { out += d.toString("utf-8") })
        proc.once("exit", () => resolve(out))
        proc.once("error", () => resolve(null))
      })
    }

    if (os === "linux") {
      const cmd = process.env["WAYLAND_DISPLAY"] ? "wl-paste" : "xclip"
      const args = cmd === "xclip" ? ["-selection", "clipboard", "-o"] : ["--no-newline"]
      const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "ignore"] })
      return await new Promise<string | null>((resolve) => {
        let out = ""
        proc.stdout?.on("data", (d: Buffer) => { out += d.toString("utf-8") })
        proc.once("exit", () => resolve(out))
        proc.once("error", () => resolve(null))
      })
    }

    if (os === "win32") {
      const proc = spawn(
        "powershell.exe",
        ["-NonInteractive", "-NoProfile", "-Command", "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Clipboard"],
        { stdio: ["ignore", "pipe", "ignore"] },
      )
      return await new Promise<string | null>((resolve) => {
        let out = ""
        proc.stdout?.on("data", (d: Buffer) => { out += d.toString("utf-8") })
        proc.once("exit", () => resolve(out.replace(/\r\n/g, "\n").replace(/\n$/, "")))
        proc.once("error", () => resolve(null))
      })
    }

    // Final fallback: clipboardy
    const { default: clipboardy } = await import("clipboardy")
    return await clipboardy.read()
  } catch {
    return null
  }
}
