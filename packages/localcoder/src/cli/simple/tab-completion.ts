import fs from "fs/promises"
import path from "path"
import type { localcoderClient } from "@localcoder-ai/sdk/v2"
import { UI } from "@/cli/ui"

export type CompletionContext =
  | { type: "slash"; prefix: string }
  | { type: "file"; prefix: string }
  | { type: "history"; prefix: string }
  | { type: "session"; prefix: string }
  | { type: "none" }

export function detectContext(text: string): CompletionContext {
  const trimmed = text.trimStart()
  if (trimmed.startsWith("/")) {
    const space = trimmed.indexOf(" ")
    const cmd = space === -1 ? trimmed : trimmed.slice(0, space)
    // Only complete the command itself, not arguments
    if (space === -1) return { type: "slash", prefix: cmd.slice(1) }
    // For file-related commands, complete files
    const arg = trimmed.slice(space + 1)
    if (["/session", "/resume", "/delete-session", "/rename-session"].some((c) => cmd === c)) {
      return { type: "session", prefix: arg }
    }
    return { type: "none" }
  }
  // @ mentions for files
  if (trimmed.includes("@")) {
    const at = trimmed.lastIndexOf("@")
    const after = trimmed.slice(at + 1)
    if (!after.includes(" ")) return { type: "file", prefix: after }
  }
  return { type: "none" }
}

export interface SlashCommand {
  name: string
  description: string
  aliases?: string[]
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: "help", description: "Show available commands and usage", aliases: ["h", "?"] },
  { name: "exit", description: "Exit the CLI", aliases: ["quit", "q"] },
  { name: "new", description: "Start a new chat session", aliases: ["clear", "cls"] },
  { name: "status", description: "Show current session status and model info", aliases: ["info"] },
  { name: "thinking", description: "Toggle reasoning/thinking mode", aliases: ["think"] },
  { name: "timing", description: "Show timing statistics for last response" },
  { name: "tips", description: "Show usage tips and keyboard shortcuts" },
  { name: "shortcuts", description: "Show all keyboard shortcuts", aliases: ["keys", "keybinds"] },
  { name: "permissions", description: "Manage tool permissions", aliases: ["permission", "perms"] },
  { name: "connect", description: "Connect to a remote server or provider" },
  { name: "llama", description: "Configure local llama.cpp server", aliases: ["llamacpp", "local"] },
  { name: "context", description: "Show current context window usage", aliases: ["ctx", "tokens"] },
  { name: "providers", description: "List available model providers", aliases: ["provider", "connectors", "connector"] },
  { name: "model", description: "Switch to a different model", aliases: ["models"] },
  { name: "agent", description: "Switch to a different agent", aliases: ["agents"] },
  { name: "sessions", description: "List all saved sessions" },
  { name: "session", description: "Switch to a session by name", aliases: ["switch"] },
  { name: "resume", description: "Resume a previously saved session" },
  { name: "search", description: "Search conversation history", aliases: ["find"] },
  { name: "history", description: "Show recent conversation history", aliases: ["messages", "hist"] },
  { name: "history-delete", description: "Delete specific messages from history", aliases: ["delete-history", "history-rm"] },
  { name: "clear-history", description: "Clear all conversation history", aliases: ["history-clear", "wipe-history"] },
  { name: "clear-history-file", description: "Delete the history file from disk" },
  { name: "delete-session", description: "Delete a saved session", aliases: ["session-delete", "del-session", "rm-session"] },
  { name: "rename-session", description: "Rename the current session", aliases: ["session-rename"] },
  { name: "revert", description: "Revert the last assistant response", aliases: ["undo"] },
  { name: "fork", description: "Fork the current conversation branch", aliases: ["branch"] },
  { name: "compact", description: "Compact conversation by summarizing", aliases: ["summarize", "shrink"] },
  { name: "abort", description: "Cancel the current streaming response", aliases: ["stop", "cancel"] },
  { name: "commands", description: "List all available slash commands", aliases: ["cmds"] },
  { name: "editor", description: "Open an external editor for input", aliases: ["edit", "vi", "vim", "nano"] },
  { name: "multiline", description: "Toggle multiline input mode", aliases: ["multi"] },
  { name: "input", description: "Show current input mode settings" },
  { name: "copy", description: "Copy last response to clipboard", aliases: ["clipboard", "paste"] },
  { name: "markdown", description: "Toggle markdown rendering", aliases: ["md"] },
  { name: "theme", description: "Toggle between dark and light theme", aliases: ["dark", "light"] },
  { name: "version", description: "Show version information", aliases: ["v"] },
]

/** Get all primary and alias names for filtering */
export function getSlashCommandNames(): string[] {
  const names: string[] = []
  for (const cmd of SLASH_COMMANDS) {
    names.push(cmd.name)
    if (cmd.aliases) names.push(...cmd.aliases)
  }
  return names
}

/** Look up a command by name or alias */
export function findSlashCommand(name: string): SlashCommand | undefined {
  const lower = name.toLowerCase()
  return SLASH_COMMANDS.find((c) => c.name === lower || (c.aliases?.includes(lower) ?? false))
}

export async function getCompletions(
  ctx: CompletionContext,
  sdk?: localcoderClient,
  directory?: string,
): Promise<string[]> {
  switch (ctx.type) {
    case "slash": {
      const prefix = ctx.prefix.toLowerCase()
      const results: string[] = []
      for (const cmd of SLASH_COMMANDS) {
        if (cmd.name.startsWith(prefix)) {
          results.push(cmd.name)
          continue
        }
        if (cmd.aliases?.some((a) => a.startsWith(prefix))) {
          results.push(cmd.name)
        }
      }
      return [...new Set(results)]
    }
    case "file": {
      if (!directory) return []
      try {
        const entries = await fs.readdir(directory, { withFileTypes: true })
        const files = entries
          .filter((e) => e.name.toLowerCase().startsWith(ctx.prefix.toLowerCase()))
          .map((e) => (e.isDirectory() ? e.name + "/" : e.name))
        return files.slice(0, 20)
      } catch {
        return []
      }
    }
    case "session": {
      if (!sdk) return []
      try {
        const list = await sdk.session.list()
        const sessions = list.data ?? []
        return sessions
          .filter((s) => !s.parentID)
          .map((s) => s.title || s.id.slice(0, 8))
          .filter((t) => t.toLowerCase().startsWith(ctx.prefix.toLowerCase()))
          .slice(0, 20)
      } catch {
        return []
      }
    }
    case "none":
    default:
      return []
  }
}

export function renderCompletionMenu(
  completions: string[],
  selectedIndex: number,
  maxWidth: number = 60,
): string {
  if (completions.length === 0) return ""

  const header = UI.Style.TEXT_DIM + "  ── Commands ──" + UI.Style.TEXT_NORMAL
  let out = header + "\n"

  for (let i = 0; i < completions.length; i++) {
    const name = completions[i]!
    const cmd = findSlashCommand(name)
    const desc = cmd?.description ?? ""
    const displayName = "/" + name
    const nameWidth = Math.min(18, Math.max(8, Math.floor(maxWidth * 0.35)))
    const descWidth = Math.max(10, maxWidth - nameWidth - 4)

    const paddedName = displayName.padEnd(nameWidth).slice(0, nameWidth)
    const truncatedDesc = desc.length > descWidth ? desc.slice(0, descWidth - 1) + "…" : desc.padEnd(descWidth)

    if (i === selectedIndex) {
      out += UI.Style.TEXT_HIGHLIGHT_BOLD + "  › " + paddedName + " " + truncatedDesc + UI.Style.TEXT_NORMAL + "\n"
    } else {
      out += UI.Style.TEXT_DIM + "    " + paddedName + " " + truncatedDesc + UI.Style.TEXT_NORMAL + "\n"
    }
  }

  const footer = UI.Style.TEXT_DIM + "  ↑↓ navigate · Enter accept · Esc dismiss" + UI.Style.TEXT_NORMAL
  out += footer
  return out
}
