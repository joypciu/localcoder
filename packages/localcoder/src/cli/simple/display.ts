import { UI } from "@/cli/ui"

const DEFAULT_WIDTH = 72

export function rule(width = DEFAULT_WIDTH) {
  return UI.Style.TEXT_DIM + "─".repeat(width) + UI.Style.TEXT_NORMAL
}

export function section(title: string) {
  UI.empty()
  UI.println(UI.Style.TEXT_INFO_BOLD + title + UI.Style.TEXT_NORMAL)
  UI.println(rule(title.length + 4))
}

export function keyValue(key: string, value: string) {
  UI.println(
    UI.Style.TEXT_DIM + `  ${key.padEnd(14)}` + UI.Style.TEXT_NORMAL + value,
  )
}

export function hint(...lines: string[]) {
  for (const line of lines) {
    UI.println(UI.Style.TEXT_DIM + "  " + line + UI.Style.TEXT_NORMAL)
  }
}

export function banner(lines: string[]) {
  UI.empty()
  for (const line of lines) {
    UI.println(UI.Style.TEXT_DIM + "  " + line + UI.Style.TEXT_NORMAL)
  }
  UI.println(rule())
  UI.empty()
}
