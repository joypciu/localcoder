import { spawn } from "child_process"
import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Filesystem } from "@/util/filesystem"

function defaultEditor(): string | undefined {
  return process.env["VISUAL"] || process.env["EDITOR"] || (process.platform === "win32" ? "notepad.exe" : "vi")
}

/**
 * Open the system default editor with initial text.
 * Blocks until the editor process exits, then reads the saved file.
 * The temp file is always deleted.
 */
export async function openEditor(initial: string): Promise<string | undefined> {
  const editor = defaultEditor()
  if (!editor) {
    return undefined
  }

  const filepath = join(tmpdir(), `localcoder-${Date.now()}.md`)

  try {
    await Filesystem.write(filepath, initial)

    const parts = editor.split(" ")
    const proc = spawn(parts[0], [...parts.slice(1), filepath], {
      stdio: "inherit",
      shell: process.platform === "win32",
      windowsHide: false,
    })

    await new Promise<void>((resolve, reject) => {
      proc.once("exit", () => resolve())
      proc.once("error", (err) => reject(err))
    })

    const content = await Filesystem.readText(filepath).catch(() => undefined)
    return content || undefined
  } finally {
    await rm(filepath, { force: true }).catch(() => {})
  }
}
