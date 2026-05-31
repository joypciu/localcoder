import { homedir } from "os"
import path from "path"
import fs from "fs/promises"

const HISTORY_FILE = path.join(homedir(), ".localcoder", "cli-history.jsonl")
const MAX_HISTORY = 2000

export interface HistoryEntry {
  text: string
  timestamp: number
  directory: string
}

/** Load persisted CLI input history. */
export async function loadHistory(): Promise<string[]> {
  try {
    const data = await fs.readFile(HISTORY_FILE, "utf-8")
    const lines = data.split(/\r?\n/).filter(Boolean)
    const entries: string[] = []
    for (const line of lines) {
      try {
        const obj = JSON.parse(line) as HistoryEntry
        if (obj.text && typeof obj.text === "string") {
          entries.push(obj.text)
        }
      } catch {
        // skip corrupt line
      }
    }
    return entries
  } catch {
    return []
  }
}

/** Append a single entry to the history file. */
export async function appendHistory(text: string, directory: string): Promise<void> {
  if (!text.trim()) return
  try {
    await fs.mkdir(path.dirname(HISTORY_FILE), { recursive: true })
    const entry: HistoryEntry = {
      text: text.trim(),
      timestamp: Date.now(),
      directory,
    }
    const line = JSON.stringify(entry) + "\n"
    await fs.appendFile(HISTORY_FILE, line)

    // Trim file if too large
    const stat = await fs.stat(HISTORY_FILE).catch(() => null)
    if (stat && stat.size > MAX_HISTORY * 200) {
      const data = await fs.readFile(HISTORY_FILE, "utf-8")
      const lines = data.split(/\r?\n/).filter(Boolean)
      if (lines.length > MAX_HISTORY) {
        const keep = lines.slice(-MAX_HISTORY)
        await fs.writeFile(HISTORY_FILE, keep.join("\n") + "\n")
      }
    }
  } catch {
    // non-fatal
  }
}

/** Clear all persisted history. */
export async function clearPersistedHistory(): Promise<void> {
  try {
    await fs.unlink(HISTORY_FILE)
  } catch {
    // non-fatal
  }
}
