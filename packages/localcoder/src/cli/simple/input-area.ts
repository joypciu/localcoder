import { stdin, stdout } from "process"
import { copyToClipboard, pasteFromClipboard } from "./clipboard"
import { findSuggestion } from "./inline-suggest"
import { detectContext, getCompletions, renderCompletionMenu, getSlashCommandNames } from "./tab-completion"
import type { localcoderClient } from "@localcoder-ai/sdk/v2"

export interface ReadInputOptions {
  prompt: string
  history: string[]
  signal?: AbortSignal
  multiline?: boolean
  sdk?: localcoderClient
  cwd?: string
}

export interface ReadInputResult {
  text: string
  cancelled: boolean
}

type ParsedKey =
  | { type: "char"; char: string; shift?: boolean; ctrl?: boolean; alt?: boolean }
  | { type: "enter" }
  | { type: "backspace" }
  | { type: "delete" }
  | { type: "up" }
  | { type: "down" }
  | { type: "left" }
  | { type: "right" }
  | { type: "home" }
  | { type: "end" }
  | { type: "ctrl_a" }
  | { type: "ctrl_c" }
  | { type: "ctrl_d" }
  | { type: "ctrl_x" }
  | { type: "ctrl_v" }
  | { type: "ctrl_j" }
  | { type: "alt_enter" }
  | { type: "esc" }
  | { type: "tab" }
  | { type: "paste_start" }
  | { type: "paste_end" }
  | { type: "kitty_enter"; shift?: boolean; ctrl?: boolean; alt?: boolean }
  | { type: "f2" }
  | { type: "ctrl_w" }
  | { type: "ctrl_k" }
  | { type: "ctrl_u" }
  | { type: "ctrl_e" }
  | { type: "ctrl_b" }
  | { type: "ctrl_f" }
  | { type: "alt_left" }
  | { type: "alt_right" }
  | { type: "unknown" }

function wrapTextWithIndices(text: string, maxWidth: number): { line: string; start: number }[] {
  const result: { line: string; start: number }[] = []
  let current = ""
  let currentWidth = 0
  let lineStart = 0
  let idx = 0

  for (const char of text) {
    const w = Bun.stringWidth(char)
    if (char === "\n") {
      result.push({ line: current, start: lineStart })
      current = ""
      currentWidth = 0
      lineStart = idx + 1
    } else if (currentWidth + w > maxWidth && currentWidth > 0) {
      result.push({ line: current, start: lineStart })
      current = char
      currentWidth = w
      lineStart = idx
    } else {
      current += char
      currentWidth += w
    }
    idx++
  }

  if (current.length > 0 || result.length === 0) {
    result.push({ line: current, start: lineStart })
  }
  return result
}

function wrapText(text: string, maxWidth: number): string[] {
  const lines: string[] = []
  let current = ""
  let currentWidth = 0

  for (const char of text) {
    const w = Bun.stringWidth(char)
    if (char === "\n") {
      lines.push(current)
      current = ""
      currentWidth = 0
      continue
    }
    if (currentWidth + w > maxWidth && currentWidth > 0) {
      lines.push(current)
      current = char
      currentWidth = w
    } else {
      current += char
      currentWidth += w
    }
  }

  if (current.length > 0 || lines.length === 0) {
    lines.push(current)
  }
  return lines
}

function cursorVisualPos(text: string, cursor: number, maxWidth: number): { line: number; col: number } {
  let line = 0
  let col = 0
  let currentWidth = 0

  for (let i = 0; i < cursor; i++) {
    const char = text[i]
    const w = Bun.stringWidth(char)
    if (char === "\n") {
      line++
      col = 0
      currentWidth = 0
    } else if (currentWidth + w > maxWidth && currentWidth > 0) {
      line++
      col = w
      currentWidth = w
    } else {
      col += w
      currentWidth += w
    }
  }
  return { line, col }
}

function parseNextKey(data: Buffer, index: number): { key: ParsedKey; nextIndex: number } | null {
  if (index >= data.length) return null
  const byte = data[index]

  // ESC sequences
  if (byte === 0x1b) {
    if (index + 1 >= data.length) return null
    const next = data[index + 1]

    // Alt+Enter / Alt+Return
    if (next === 0x0d || next === 0x0a) {
      return { key: { type: "alt_enter" }, nextIndex: index + 2 }
    }

    // CSI
    if (next === 0x5b) {
      if (index + 2 >= data.length) return null
      return parseCsi(data, index + 2)
    }

    // SS3 (older terminals, e.g. F1-F4: ESC O P/Q/R/S)
    if (next === 0x4f) {
      if (index + 2 >= data.length) return null
      const ss3Cmd = data[index + 2]
      if (ss3Cmd === 0x51) return { key: { type: "f2" }, nextIndex: index + 3 } // ESC O Q
      return { key: { type: "unknown" }, nextIndex: index + 3 }
    }

    // Alt+char
    if (next >= 0x20 && next < 0x7f) {
      return {
        key: { type: "char", char: String.fromCharCode(next), alt: true },
        nextIndex: index + 2,
      }
    }

    return { key: { type: "esc" }, nextIndex: index + 1 }
  }

  // Enter (CR) — treat CRLF as a single Enter
  if (byte === 0x0d) {
    if (index + 1 < data.length && data[index + 1] === 0x0a) {
      return { key: { type: "enter" }, nextIndex: index + 2 }
    }
    return { key: { type: "enter" }, nextIndex: index + 1 }
  }

  // Ctrl+J (LF) → newline insert
  if (byte === 0x0a) {
    return { key: { type: "ctrl_j" }, nextIndex: index + 1 }
  }

  // Backspace
  if (byte === 0x7f) {
    return { key: { type: "backspace" }, nextIndex: index + 1 }
  }

  // Tab
  if (byte === 0x09) {
    return { key: { type: "tab" }, nextIndex: index + 1 }
  }

  // Ctrl+A
  if (byte === 0x01) {
    return { key: { type: "ctrl_a" }, nextIndex: index + 1 }
  }

  // Ctrl+C
  if (byte === 0x03) {
    return { key: { type: "ctrl_c" }, nextIndex: index + 1 }
  }

  // Ctrl+D
  if (byte === 0x04) {
    return { key: { type: "ctrl_d" }, nextIndex: index + 1 }
  }

  // Ctrl+X
  if (byte === 0x18) {
    return { key: { type: "ctrl_x" }, nextIndex: index + 1 }
  }

  // Ctrl+V
  if (byte === 0x16) {
    return { key: { type: "ctrl_v" }, nextIndex: index + 1 }
  }

  // Ctrl+B (move back one char)
  if (byte === 0x02) {
    return { key: { type: "ctrl_b" }, nextIndex: index + 1 }
  }

  // Ctrl+E (end of line)
  if (byte === 0x05) {
    return { key: { type: "ctrl_e" }, nextIndex: index + 1 }
  }

  // Ctrl+F (move forward one char)
  if (byte === 0x06) {
    return { key: { type: "ctrl_f" }, nextIndex: index + 1 }
  }

  // Ctrl+K (kill to end of line)
  if (byte === 0x0b) {
    return { key: { type: "ctrl_k" }, nextIndex: index + 1 }
  }

  // Ctrl+U (kill to start of line)
  if (byte === 0x15) {
    return { key: { type: "ctrl_u" }, nextIndex: index + 1 }
  }

  // Ctrl+W (delete word backward)
  if (byte === 0x17) {
    return { key: { type: "ctrl_w" }, nextIndex: index + 1 }
  }

  // Printable ASCII
  if (byte >= 0x20 && byte < 0x7f) {
    return { key: { type: "char", char: String.fromCharCode(byte) }, nextIndex: index + 1 }
  }

  // UTF-8 multi-byte
  let len = 0
  if ((byte & 0xe0) === 0xc0) len = 2
  else if ((byte & 0xf0) === 0xe0) len = 3
  else if ((byte & 0xf8) === 0xf0) len = 4

  if (len > 0) {
    if (index + len > data.length) return null
    const char = data.subarray(index, index + len).toString("utf-8")
    return { key: { type: "char", char }, nextIndex: index + len }
  }

  // Unknown byte — skip
  return { key: { type: "unknown" }, nextIndex: index + 1 }
}

function parseCsi(data: Buffer, start: number): { key: ParsedKey; nextIndex: number } | null {
  let i = start
  while (i < data.length) {
    const b = data[i]
    if (b >= 0x30 && b <= 0x3f) {
      i++
    } else if (b >= 0x20 && b <= 0x2f) {
      i++
    } else if (b >= 0x40 && b <= 0x7e) {
      const params = data.subarray(start, i).toString("utf-8")
      const cmd = String.fromCharCode(b)

      // Kitty keyboard protocol: [13u or [13;2u etc.
      if (cmd === "u" && params.startsWith("13")) {
        const parts = params.split(";")
        const flags = parts.length > 1 ? Number(parts[1]) || 0 : 0
        return {
          key: {
            type: "kitty_enter",
            shift: (flags & 1) !== 0,
            alt: (flags & 2) !== 0,
            ctrl: (flags & 4) !== 0,
          },
          nextIndex: i + 1,
        }
      }

      // Bracketed paste
      if (cmd === "~" && params === "200") {
        return { key: { type: "paste_start" }, nextIndex: i + 1 }
      }
      if (cmd === "~" && params === "201") {
        return { key: { type: "paste_end" }, nextIndex: i + 1 }
      }

      // Standard navigation
      if (cmd === "A") return { key: { type: "up" }, nextIndex: i + 1 }
      if (cmd === "B") return { key: { type: "down" }, nextIndex: i + 1 }
      if (cmd === "H") return { key: { type: "home" }, nextIndex: i + 1 }
      if (cmd === "F") return { key: { type: "end" }, nextIndex: i + 1 }

      // Alt+Left / Alt+Right  (ESC [ 1 ; 3 D/C  or ESC [ 3 D/C)
      if (cmd === "D" && (params === "1;3" || params === "3"))
        return { key: { type: "alt_left" }, nextIndex: i + 1 }
      if (cmd === "C" && (params === "1;3" || params === "3"))
        return { key: { type: "alt_right" }, nextIndex: i + 1 }

      // Plain Left/Right (no modifier)
      if (cmd === "C") return { key: { type: "right" }, nextIndex: i + 1 }
      if (cmd === "D") return { key: { type: "left" }, nextIndex: i + 1 }

      const p = Number(params) || 1
      if (cmd === "~" && p === 1) return { key: { type: "home" }, nextIndex: i + 1 }
      if (cmd === "~" && p === 3) return { key: { type: "delete" }, nextIndex: i + 1 }
      if (cmd === "~" && p === 4) return { key: { type: "end" }, nextIndex: i + 1 }
      if (cmd === "~" && p === 12) return { key: { type: "f2" }, nextIndex: i + 1 }

      return { key: { type: "unknown" }, nextIndex: i + 1 }
    } else {
      i++
    }
  }
  return null // incomplete CSI
}

function readLineFromPipe(): Promise<ReadInputResult> {
  return new Promise((resolve) => {
    let buffer = ""
    const onData = (data: Buffer) => {
      buffer += data.toString("utf-8")
      const idx = buffer.indexOf("\n")
      if (idx !== -1) {
        const line = buffer.slice(0, idx).replace(/\r$/, "")
        buffer = buffer.slice(idx + 1)
        stdin.off("data", onData)
        stdin.off("end", onEnd)
        resolve({ text: line, cancelled: false })
      }
    }
    const onEnd = () => {
      stdin.off("data", onData)
      const line = buffer.replace(/\r$/, "")
      if (line.length > 0) {
        resolve({ text: line, cancelled: false })
      } else {
        resolve({ text: "", cancelled: true })
      }
    }
    stdin.on("data", onData)
    stdin.once("end", onEnd)
  })
}

export async function readInput(options: ReadInputOptions): Promise<ReadInputResult> {
  if (!stdin.isTTY) {
    return readLineFromPipe()
  }

  const prompt = options.prompt
  const history = options.history
  const signal = options.signal

  let text = ""
  let cursor = 0
  let selectionStart = -1
  let selectionEnd = -1
  let historyIndex = -1
  let originalText = ""
  let prevLineCount = 1
  let width = stdout.columns ?? 80
  let inPaste = false
  let pasteBuffer = ""
  let buf = Buffer.alloc(0)
  let resolved = false
  let multiline = options.multiline ?? false

  // Inline suggestion (fish-style ghost text)
  let suggestion: string | null = null

  // Tab completion state
  let completions: string[] = []
  let completionIndex = -1
  let showingCompletions = false
  let completionMenuLines = 0

  function wordStart(pos: number): number {
    let i = pos - 1
    while (i > 0 && /\s/.test(text[i - 1]!)) i--
    while (i > 0 && !/\s/.test(text[i - 1]!)) i--
    return i
  }

  function wordEnd(pos: number): number {
    let i = pos
    while (i < text.length && /\s/.test(text[i]!)) i++
    while (i < text.length && !/\s/.test(text[i]!)) i++
    return i
  }

  function dismissCompletions() {
    completions = []
    completionIndex = -1
    showingCompletions = false
    completionMenuLines = 0
  }

  function updateSuggestion() {
    suggestion = !showingCompletions && cursor === text.length
      ? findSuggestion(text, options.history)
      : null
  }

  function maybeAutoComplete() {
    const trimmed = text.trimStart()
    if (!trimmed.startsWith("/") || trimmed.includes(" ")) {
      dismissCompletions()
      return
    }
    const ctx = detectContext(text)
    if (ctx.type !== "slash") {
      dismissCompletions()
      return
    }
    const results = getSlashCommandNames().filter((c) => c.startsWith(ctx.prefix.toLowerCase()))
    if (results.length === 0) {
      dismissCompletions()
      return
    }
    completions = results
    completionIndex = 0
    showingCompletions = true
  }

  const promptWidth = Bun.stringWidth(prompt)
  const maxLineWidth = () => Math.max(1, width - promptWidth)

  function wrap(): string[] {
    return wrapText(text, maxLineWidth())
  }

  function render() {
    if (resolved) return

    updateSuggestion()

    const linesWithIdx = wrapTextWithIndices(text, maxLineWidth())
    const totalLines = Math.max(linesWithIdx.length, 1)
    const selMin = hasSelection() ? Math.min(selectionStart, selectionEnd) : -1
    const selMax = hasSelection() ? Math.max(selectionStart, selectionEnd) : -1

    // Count extra lines for completion menu
    let extraLines = 0
    if (showingCompletions && completions.length > 0) {
      const cols = Math.max(1, Math.floor(maxLineWidth() / 20))
      completionMenuLines = Math.ceil(completions.length / cols)
      extraLines = completionMenuLines
    }

    stdout.write("\x1b[?25l") // hide cursor

    // Move to the first line of the previous render
    for (let i = 0; i < prevLineCount - 1; i++) stdout.write("\x1b[1A")
    stdout.write("\x1b[1G") // column 1

    // Clear every line that was used
    for (let i = 0; i < prevLineCount; i++) {
      stdout.write("\x1b[2K")
      if (i < prevLineCount - 1) stdout.write("\x1b[1B\x1b[1G")
    }

    // Move back up to the first line
    for (let i = 0; i < prevLineCount - 1; i++) stdout.write("\x1b[1A")
    stdout.write("\x1b[1G")

    // Draw text lines with selection highlighting
    for (let i = 0; i < linesWithIdx.length; i++) {
      const { line, start } = linesWithIdx[i]!
      const prefix = i === 0 ? prompt : " ".repeat(promptWidth)
      stdout.write(prefix)

      if (selMin >= 0 && selMax > selMin) {
        // Render with ANSI reverse-video selection highlight
        let j = 0
        let inSel = false
        for (const char of line) {
          const textIdx = start + j
          if (!inSel && textIdx >= selMin && textIdx < selMax) {
            stdout.write("\x1b[7m")
            inSel = true
          } else if (inSel && textIdx >= selMax) {
            stdout.write("\x1b[27m")
            inSel = false
          }
          stdout.write(char)
          j++
        }
        if (inSel) stdout.write("\x1b[27m")
      } else {
        stdout.write(line)
      }

      // Ghost text suggestion on the last input line when cursor is at end
      if (i === linesWithIdx.length - 1 && suggestion && cursor === text.length && !hasSelection()) {
        stdout.write("\x1b[2m" + suggestion + "\x1b[22m")
      }

      if (i < linesWithIdx.length - 1) stdout.write("\n")
    }

    // Completion menu below the input
    if (showingCompletions && completions.length > 0) {
      stdout.write("\n" + renderCompletionMenu(completions, completionIndex, maxLineWidth()))
    }

    // Move cursor back to prompt position
    const { line: curLine, col } = cursorVisualPos(text, cursor, maxLineWidth())
    const linesBelow = linesWithIdx.length - 1 - curLine + extraLines
    if (linesBelow > 0) {
      for (let i = 0; i < linesBelow; i++) stdout.write("\x1b[1A")
    }
    stdout.write(`\x1b[${promptWidth + col + 1}G`)
    stdout.write("\x1b[?25h") // show cursor

    prevLineCount = totalLines + extraLines
  }

  function insert(str: string) {
    text = text.slice(0, cursor) + str + text.slice(cursor)
    cursor += str.length
  }

  function clearSelection() {
    selectionStart = -1
    selectionEnd = -1
  }

  function hasSelection() {
    return selectionStart !== -1 && selectionEnd !== -1
  }

  function deleteSelection() {
    if (!hasSelection()) return
    const start = Math.min(selectionStart, selectionEnd)
    const end = Math.max(selectionStart, selectionEnd)
    text = text.slice(0, start) + text.slice(end)
    cursor = start
    clearSelection()
  }

  function submit() {
    if (resolved) return
    if (text.length > 0) {
      if (history.length === 0 || history[history.length - 1] !== text) {
        history.push(text)
      }
    }
    stdout.write("\n")
    finish({ text, cancelled: false })
  }

  function cancel() {
    if (resolved) return
    stdout.write("\n")
    finish({ text: "", cancelled: true })
  }

  function finish(result: ReadInputResult) {
    if (resolved) return
    resolved = true
    cleanup()
    resolve(result)
  }

  let cleanup = () => {}
  let resolve: (r: ReadInputResult) => void = () => {}

  return new Promise<ReadInputResult>((res) => {
    resolve = res

    const onResize = () => {
      width = stdout.columns ?? 80
      render()
    }

    const onData = (data: Buffer) => {
      if (resolved) return
      buf = Buffer.concat([buf, data])
      let i = 0
      while (i < buf.length && !resolved) {
        const result = parseNextKey(buf, i)
        if (result === null) {
          // Incomplete sequence — keep remaining bytes
          buf = buf.subarray(i)
          return
        }
        i = result.nextIndex
        handleKey(result.key)
      }
      if (!resolved) {
        buf = Buffer.alloc(0)
      }
    }

    const onAbort = () => {
      cancel()
    }

    cleanup = () => {
      stdin.off("data", onData)
      stdout.off("resize", onResize)
      if (signal) signal.removeEventListener("abort", onAbort)
      if (stdin.isTTY) {
        try {
          stdin.setRawMode(false)
        } catch {}
      }
      stdout.write("\x1b[?2004l") // disable bracketed paste
      stdout.write("\x1b[<1u") // pop kitty protocol
      stdout.write("\x1b[?25h") // show cursor
    }

    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true })
      if (signal.aborted) {
        cancel()
        return
      }
    }

    // Ensure stdin is flowing — @clack/prompts and readline may leave it paused
    if (stdin.isPaused()) {
      stdin.resume()
    }
    if (stdin.isTTY) {
      try {
        stdin.setRawMode(true)
      } catch {
        // ignore
      }
    }
    stdout.write("\x1b[?2004h") // enable bracketed paste
    stdout.write("\x1b[>1u") // push kitty keyboard protocol (level 1)

    stdin.on("data", onData)
    stdout.on("resize", onResize)

    render()
  })

  function handleKey(key: ParsedKey) {
    if (resolved) return

    // Bracketed paste handling
    if (inPaste) {
      if (key.type === "paste_end") {
        inPaste = false
        const cleanPaste = pasteBuffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
        if (hasSelection()) {
          deleteSelection()
        }
        insert(cleanPaste)
        pasteBuffer = ""
        render()
      } else if (key.type === "char" && key.char) {
        pasteBuffer += key.char
      } else if (key.type === "enter") {
        pasteBuffer += "\n"
      } else if (key.type === "tab") {
        pasteBuffer += "\t"
      } else if (key.type === "ctrl_j") {
        pasteBuffer += "\n"
      }
      return
    }

    if (key.type === "paste_start") {
      inPaste = true
      pasteBuffer = ""
      return
    }

    switch (key.type) {
      case "char": {
        if (key.char) {
          if (hasSelection()) deleteSelection()
          if (showingCompletions) dismissCompletions()
          insert(key.char)
          maybeAutoComplete()
          render()
        }
        break
      }

      case "enter": {
        if (showingCompletions && completions.length > 0) {
          // Accept selected completion
          const selected = completions[completionIndex]
          if (selected) {
            const prefix = "/" + (detectContext(text) as { prefix: string }).prefix
            const prefixStart = text.lastIndexOf(prefix)
            if (prefixStart !== -1) {
              const replacement = "/" + selected
              text = text.slice(0, prefixStart) + replacement + text.slice(prefixStart + prefix.length)
              cursor = prefixStart + replacement.length
            }
          }
          dismissCompletions()
          render()
          break
        }
        if (multiline) {
          if (hasSelection()) deleteSelection()
          insert("\n")
          render()
        } else {
          submit()
        }
        break
      }

      case "kitty_enter": {
        if (key.shift || key.ctrl || key.alt) {
          if (hasSelection()) deleteSelection()
          insert("\n")
          render()
        } else if (multiline) {
          if (hasSelection()) deleteSelection()
          insert("\n")
          render()
        } else {
          submit()
        }
        break
      }

      case "alt_enter":
      case "ctrl_j":
      case "f2": {
        if (hasSelection()) deleteSelection()
        insert("\n")
        render()
        break
      }

      case "ctrl_d": {
        if (multiline && text.length > 0) {
          submit()
        } else {
          cancel()
        }
        break
      }

      case "backspace": {
        if (hasSelection()) {
          deleteSelection()
        } else if (cursor > 0) {
          text = text.slice(0, cursor - 1) + text.slice(cursor)
          cursor--
        }
        maybeAutoComplete()
        render()
        break
      }

      case "delete": {
        if (hasSelection()) {
          deleteSelection()
        } else if (cursor < text.length) {
          text = text.slice(0, cursor) + text.slice(cursor + 1)
        }
        maybeAutoComplete()
        render()
        break
      }

      case "right": {
        // Accept suggestion if cursor is at end
        if (suggestion && cursor === text.length) {
          text += suggestion
          cursor = text.length
          suggestion = null
          dismissCompletions()
          render()
          break
        }
        if (cursor < text.length) cursor++
        clearSelection()
        render()
        break
      }

      case "up": {
        if (showingCompletions && completions.length > 0) {
          completionIndex = completionIndex > 0 ? completionIndex - 1 : completions.length - 1
          render()
          break
        }
        if (history.length > 0 && historyIndex < history.length - 1) {
          if (historyIndex === -1) originalText = text
          historyIndex++
          text = history[history.length - 1 - historyIndex]
          cursor = text.length
          clearSelection()
          render()
        }
        break
      }

      case "down": {
        if (showingCompletions && completions.length > 0) {
          completionIndex = completionIndex < completions.length - 1 ? completionIndex + 1 : 0
          render()
          break
        }
        if (historyIndex > -1) {
          historyIndex--
          if (historyIndex === -1) {
            text = originalText
          } else {
            text = history[history.length - 1 - historyIndex]
          }
          cursor = text.length
          clearSelection()
          render()
        }
        break
      }

      case "home": {
        cursor = 0
        clearSelection()
        render()
        break
      }

      case "ctrl_a": {
        selectionStart = 0
        selectionEnd = text.length
        render()
        break
      }

      case "ctrl_c": {
        if (hasSelection()) {
          const selected = text.slice(Math.min(selectionStart, selectionEnd), Math.max(selectionStart, selectionEnd))
          copyToClipboard(selected).catch(() => {})
          clearSelection()
          render()
        } else if (text.length > 0) {
          text = ""
          cursor = 0
          clearSelection()
          dismissCompletions()
          render()
        } else {
          cancel()
        }
        break
      }

      case "ctrl_x": {
        if (hasSelection()) {
          const selected = text.slice(Math.min(selectionStart, selectionEnd), Math.max(selectionStart, selectionEnd))
          copyToClipboard(selected).catch(() => {})
          deleteSelection()
          dismissCompletions()
          render()
        }
        break
      }

      case "ctrl_v": {
        // Async paste; re-render after
        pasteFromClipboard().then((pasted) => {
          if (!pasted || resolved) return
          if (hasSelection()) deleteSelection()
          insert(pasted.replace(/\r\n/g, "\n").replace(/\r/g, "\n"))
          dismissCompletions()
          render()
        }).catch(() => {})
        break
      }

      case "tab": {
        // Accept suggestion first if at end of input
        if (suggestion && cursor === text.length) {
          text += suggestion
          cursor = text.length
          suggestion = null
          dismissCompletions()
          render()
          break
        }

        if (showingCompletions && completions.length > 0) {
          // Cycle through completion menu
          completionIndex = (completionIndex + 1) % completions.length
          render()
          break
        }

        // Compute completions async
        const ctx = detectContext(text)
        if (ctx.type === "none") {
          if (hasSelection()) deleteSelection()
          insert("  ")
          render()
          break
        }
        getCompletions(ctx, options.sdk, options.cwd).then((results) => {
          if (resolved) return
          if (results.length === 0) {
            // No completions — insert spaces
            if (hasSelection()) deleteSelection()
            insert("  ")
            render()
            return
          }
          if (results.length === 1) {
            // Single match — inline replace prefix
            const prefix = ctx.type === "slash" ? "/" + ctx.prefix
              : ctx.type === "file" ? "@" + ctx.prefix
              : ctx.prefix
            const prefixStart = text.lastIndexOf(prefix)
            if (prefixStart !== -1) {
              const replacement = ctx.type === "slash" ? "/" + results[0]!
                : ctx.type === "file" ? "@" + results[0]!
                : results[0]!
              text = text.slice(0, prefixStart) + replacement + text.slice(prefixStart + prefix.length)
              cursor = prefixStart + replacement.length
            }
            dismissCompletions()
          } else {
            completions = results
            completionIndex = 0
            showingCompletions = true
          }
          render()
        }).catch(() => {})
        break
      }

      case "ctrl_w": {
        // Delete word backward
        if (hasSelection()) {
          deleteSelection()
        } else if (cursor > 0) {
          const newPos = wordStart(cursor)
          text = text.slice(0, newPos) + text.slice(cursor)
          cursor = newPos
        }
        dismissCompletions()
        render()
        break
      }

      case "ctrl_k": {
        // Kill to end of line
        const lineEnd = text.indexOf("\n", cursor)
        if (lineEnd === -1) {
          text = text.slice(0, cursor)
        } else {
          text = text.slice(0, cursor) + text.slice(lineEnd + 1)
        }
        clearSelection()
        dismissCompletions()
        render()
        break
      }

      case "ctrl_u": {
        // Kill to start of line
        const lineStart = text.lastIndexOf("\n", cursor - 1)
        const killFrom = lineStart === -1 ? 0 : lineStart + 1
        text = text.slice(0, killFrom) + text.slice(cursor)
        cursor = killFrom
        clearSelection()
        dismissCompletions()
        render()
        break
      }

      case "ctrl_e":
      case "end": {
        cursor = text.length
        clearSelection()
        render()
        break
      }

      case "ctrl_b":
      case "left": {
        if (cursor > 0) cursor--
        clearSelection()
        dismissCompletions()
        render()
        break
      }

      case "ctrl_f": {
        if (cursor < text.length) cursor++
        clearSelection()
        render()
        break
      }

      case "alt_left": {
        cursor = wordStart(cursor)
        clearSelection()
        render()
        break
      }

      case "alt_right": {
        cursor = wordEnd(cursor)
        clearSelection()
        render()
        break
      }

      case "esc": {
        if (showingCompletions) {
          dismissCompletions()
          render()
        } else if (hasSelection()) {
          clearSelection()
          render()
        }
        break
      }
    }
  }
}
