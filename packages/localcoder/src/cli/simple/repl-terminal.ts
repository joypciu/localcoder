import type { Interface as ReadlineInterface } from "readline"

/** Release stdin from readline before @clack/prompts (raw mode). */
export function pauseReadlineForPrompts(rl: ReadlineInterface) {
  rl.pause()
  if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
    try {
      process.stdin.setRawMode(false)
    } catch {
      // ignore
    }
  }
}

export type ResumeReadlineOptions = {
  /** After @clack/prompts: extra newline so the › prompt is on a fresh line (no cancel() — that draws └). */
  afterClack?: boolean
}

/**
 * Restore the terminal after clack or streaming. Recreates readline — required on Windows
 * after interactive selects, or the › prompt stops accepting keystrokes.
 */
export function resumeReadlineAfterPrompts(
  rl: ReadlineInterface,
  recreate: () => ReadlineInterface,
  options?: ResumeReadlineOptions,
): ReadlineInterface {
  if (options?.afterClack) {
    process.stdout.write("\n")
  }
  if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
    try {
      process.stdin.setRawMode(false)
    } catch {
      // ignore
    }
  }
  if (process.stdin.isPaused()) {
    process.stdin.resume()
  }

  try {
    rl.close()
  } catch {
    // already closed
  }

  const next = recreate()
  if (process.stdout.isTTY) {
    process.stdout.write("\x1b[?25h")
  }
  return next
}
