import { UI } from "@/cli/ui"
import { Locale } from "@/util/locale"

const WIDTH = 72

export function rule(width = WIDTH) {
  return UI.Style.TEXT_DIM + "─".repeat(width) + UI.Style.TEXT_NORMAL
}

export function section(title: string) {
  UI.empty()
  UI.println(UI.Style.TEXT_INFO_BOLD + title + UI.Style.TEXT_NORMAL)
  UI.println(rule(Math.min(WIDTH, title.length + 8)))
}

export function keyValue(key: string, value: string) {
  UI.println(UI.Style.TEXT_DIM + `  ${key.padEnd(14)}` + UI.Style.TEXT_NORMAL + value)
}

export function hint(...lines: string[]) {
  for (const line of lines) {
    UI.println(UI.Style.TEXT_DIM + "  " + line + UI.Style.TEXT_NORMAL)
  }
}

export function welcome(directory: string, thinking: boolean) {
  UI.empty()
  UI.println(UI.Style.TEXT_DIM + `LocalCoder · ${directory}` + UI.Style.TEXT_NORMAL)
  UI.println(rule(56))
  hint(
    "Type a message · /help · /shortcuts · !shell · @files",
    "/session · /sessions · /history · Ctrl+C stops the current turn",
    thinking
      ? "Reasoning panel on (◆ + seconds) — /thinking to hide"
      : "Reasoning off — /thinking to show (llamacpp)",
    "Type /tips anytime for hints",
  )
  UI.empty()
}

export function previewText(text: string, max = 70) {
  const one = text.replace(/\s+/g, " ").trim()
  if (one.length <= max) return one
  return one.slice(0, max - 1) + "…"
}

/** User message label (stderr — keeps stdout for assistant text). */
export function turnUser(text: string) {
  UI.println(
    UI.Style.TEXT_INFO_BOLD +
      "you" +
      UI.Style.TEXT_NORMAL +
      UI.Style.TEXT_DIM +
      " › " +
      previewText(text) +
      UI.Style.TEXT_NORMAL,
  )
}

export function turnAgent(agent: string, modelID: string) {
  UI.println(
    UI.Style.TEXT_HIGHLIGHT +
      "▸ " +
      agent +
      UI.Style.TEXT_DIM +
      " · " +
      modelID +
      UI.Style.TEXT_NORMAL,
  )
}

export function turnTiming(totalMs: number, thinkingMs?: number) {
  const parts = [Locale.duration(totalMs)]
  if (thinkingMs && thinkingMs > 50) {
    parts.push(`think ${Locale.duration(thinkingMs)}`)
  }
  UI.println(UI.Style.TEXT_DIM + `  ⏱ ${parts.join(" · ")}` + UI.Style.TEXT_NORMAL)
}

export function turnContext(meter: string, warn = false) {
  const style = warn ? UI.Style.TEXT_WARNING : UI.Style.TEXT_DIM
  UI.println(style + `  context ${meter}` + UI.Style.TEXT_NORMAL)
}

export function turnDivider() {
  UI.println(UI.Style.TEXT_DIM + "  " + "·".repeat(56) + UI.Style.TEXT_NORMAL)
}

export function promptLabel() {
  return UI.Style.TEXT_HIGHLIGHT_BOLD + "› " + UI.Style.TEXT_NORMAL
}

export function promptHint(text: string) {
  return UI.Style.TEXT_DIM + ` (${text})` + UI.Style.TEXT_NORMAL
}

export function toolLine(icon: string, title: string, detail?: string) {
  const suffix = detail ? UI.Style.TEXT_DIM + ` — ${detail}` + UI.Style.TEXT_NORMAL : ""
  UI.println(UI.Style.TEXT_DIM + "  " + icon + " " + UI.Style.TEXT_NORMAL + title + suffix)
}

export function toolBlock(icon: string, title: string, body?: string) {
  UI.empty()
  toolLine(icon, title)
  if (body?.trim()) {
    for (const line of body.trim().split(/\r?\n/)) {
      UI.println(UI.Style.TEXT_DIM + "    " + line + UI.Style.TEXT_NORMAL)
    }
  }
  UI.empty()
}
