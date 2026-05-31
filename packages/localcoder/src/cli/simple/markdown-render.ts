import { UI } from "@/cli/ui"

// Simple markdown → ANSI renderer for the Simple CLI.
// Supports: headers, bold, italic, inline code, code blocks, lists, blockquotes, horizontal rules.

const ANSI_BOLD = "\x1b[1m"
const ANSI_DIM = "\x1b[2m"
const ANSI_ITALIC = "\x1b[3m"
const ANSI_RESET = "\x1b[0m"
const ANSI_CYAN = "\x1b[36m"
const ANSI_YELLOW = "\x1b[33m"
const ANSI_GREEN = "\x1b[32m"
const ANSI_BLUE = "\x1b[34m"
const ANSI_MAGENTA = "\x1b[35m"
const ANSI_RED = "\x1b[31m"
const ANSI_GRAY = "\x1b[38;5;245m"
const ANSI_BG_GRAY = "\x1b[48;5;236m"

interface LineResult {
  text: string
  prefix: string
}

function prefixFromDepth(depth: number): string {
  return "  ".repeat(depth)
}

export function renderMarkdown(text: string): string {
  const lines = text.split(/\r?\n/)
  const out: string[] = []
  let inCodeBlock = false
  let codeBlockLang = ""
  let listDepth = 0
  let inBlockquote = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!

    // Code block toggle
    if (line.startsWith("```")) {
      if (!inCodeBlock) {
        inCodeBlock = true
        codeBlockLang = line.slice(3).trim()
        out.push(`${ANSI_GRAY}─── ${codeBlockLang || "code"} ───${ANSI_RESET}`)
      } else {
        inCodeBlock = false
        codeBlockLang = ""
        out.push(`${ANSI_GRAY}────────────────────${ANSI_RESET}`)
      }
      continue
    }

    if (inCodeBlock) {
      out.push(ANSI_BG_GRAY + line + ANSI_RESET)
      continue
    }

    // Horizontal rule
    if (/^(---|___|\*\*\*)$/.test(line.trim())) {
      out.push(ANSI_GRAY + "────────────────────────────────────────" + ANSI_RESET)
      continue
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const content = line.slice(2)
      out.push(ANSI_DIM + "  │ " + ANSI_RESET + renderInline(content))
      inBlockquote = true
      continue
    } else if (inBlockquote && line.trim() === "") {
      inBlockquote = false
    }

    // Headers
    if (line.startsWith("# ")) {
      out.push(ANSI_BOLD + ANSI_YELLOW + line.slice(2) + ANSI_RESET)
      continue
    }
    if (line.startsWith("## ")) {
      out.push(ANSI_BOLD + ANSI_CYAN + "  " + line.slice(3) + ANSI_RESET)
      continue
    }
    if (line.startsWith("### ")) {
      out.push(ANSI_BOLD + ANSI_GREEN + "    " + line.slice(4) + ANSI_RESET)
      continue
    }
    if (line.startsWith("#### ")) {
      out.push(ANSI_BOLD + ANSI_GRAY + "      " + line.slice(5) + ANSI_RESET)
      continue
    }

    // Lists
    const unorderedMatch = line.match(/^(\s*)[-*+]\s+(.*)$/)
    if (unorderedMatch) {
      const depth = Math.floor(unorderedMatch[1].length / 2)
      const content = unorderedMatch[2]
      out.push(prefixFromDepth(depth) + ANSI_CYAN + "• " + ANSI_RESET + renderInline(content))
      continue
    }

    const orderedMatch = line.match(/^(\s*)\d+\.\s+(.*)$/)
    if (orderedMatch) {
      const depth = Math.floor(orderedMatch[1].length / 2)
      const num = line.match(/^\s*(\d+)\.\s+/)?.[1] ?? "•"
      const content = orderedMatch[2]
      out.push(prefixFromDepth(depth) + ANSI_CYAN + num + ". " + ANSI_RESET + renderInline(content))
      continue
    }

    // Empty line
    if (line.trim() === "") {
      out.push("")
      continue
    }

    // Normal paragraph with inline formatting
    out.push("  " + renderInline(line))
  }

  return out.join("\n")
}

export function renderInline(text: string): string {
  let result = text

  // Inline code `...`
  result = result.replace(/`([^`]+)`/g, `${ANSI_BG_GRAY}${ANSI_GREEN}$1${ANSI_RESET}`)

  // Bold **...** or __...__
  result = result.replace(/\*\*(.+?)\*\*/g, `${ANSI_BOLD}$1${ANSI_RESET}`)
  result = result.replace(/__(.+?)__/g, `${ANSI_BOLD}$1${ANSI_RESET}`)

  // Italic *...* or _..._
  result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, `${ANSI_ITALIC}$1${ANSI_RESET}`)
  result = result.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, `${ANSI_ITALIC}$1${ANSI_RESET}`)

  // Links [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, `${ANSI_BLUE}${ANSI_UNDERLINE}$1${ANSI_RESET}`)

  // Strikethrough ~~...~~
  result = result.replace(/~~(.+?)~~/g, `${ANSI_DIM}${ANSI_STRIKETHROUGH}$1${ANSI_RESET}`)

  return result
}

const ANSI_UNDERLINE = "\x1b[4m"
const ANSI_STRIKETHROUGH = "\x1b[9m"

/** Strip ANSI escape sequences from text. */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, "")
}
