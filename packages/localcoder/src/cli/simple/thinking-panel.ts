import { EOL } from "os"
import { UI } from "@/cli/ui"
import { clearStatusLine, writeStatusLine } from "./stderr-line"

const INNER = 58

function visibleLen(s: string) {
  return s.replace(/\x1b\[[0-9;]*m/g, "").length
}

/** Bordered reasoning stream with live seconds and character count. */
export class ThinkingPanel {
  private startedAt = Date.now()
  private timer?: ReturnType<typeof setInterval>
  private chars = 0
  private open = false
  private boxOpen = false
  private lineBuf = ""

  isActive() {
    return this.open
  }

  begin() {
    if (this.open) return
    this.open = true
    this.startedAt = Date.now()
    this.chars = 0
    this.lineBuf = ""
    this.boxOpen = false
    UI.empty()
    this.drawStatus()
    this.timer = setInterval(() => this.drawStatus(), 200)
  }

  private elapsedSec() {
    return ((Date.now() - this.startedAt) / 1000).toFixed(1)
  }

  private drawStatus() {
    if (!this.open) return
    const count =
      this.chars >= 1000 ? `${(this.chars / 1000).toFixed(1)}k chars` : `${this.chars} chars`
    writeStatusLine(
      UI.Style.TEXT_INFO_BOLD +
        "  ◆ Thinking" +
        UI.Style.TEXT_NORMAL +
        UI.Style.TEXT_DIM +
        ` · ${this.elapsedSec()}s · ${count}` +
        UI.Style.TEXT_NORMAL,
    )
  }

  private openBox() {
    if (this.boxOpen) return
    clearStatusLine()
    UI.println(
      UI.Style.TEXT_INFO_BOLD +
        "  ◆ Thinking" +
        UI.Style.TEXT_NORMAL +
        UI.Style.TEXT_DIM +
        ` · ${this.elapsedSec()}s` +
        UI.Style.TEXT_NORMAL,
    )
    UI.println(UI.Style.TEXT_DIM + "  ╭" + "─".repeat(INNER) + "╮" + UI.Style.TEXT_NORMAL)
    this.boxOpen = true
    if (this.lineBuf) this.flushLineBuf(true)
  }

  private prefix() {
    return UI.Style.TEXT_DIM + "  │ " + UI.Style.TEXT_NORMAL
  }

  private emitLine(text: string, force = false) {
    const t = text.trimEnd()
    if (!t && !force) return
    process.stderr.write(this.prefix() + t + EOL)
    if (typeof (process.stderr as NodeJS.WriteStream & { flush?: () => void }).flush === "function") {
      ;(process.stderr as unknown as { flush: () => void }).flush()
    }
  }

  private flushLineBuf(force = false) {
    while (this.lineBuf.length > INNER || (force && this.lineBuf.length > 0)) {
      if (this.lineBuf.length <= INNER) {
        if (force) {
          this.emitLine(this.lineBuf)
          this.lineBuf = ""
        }
        break
      }
      let cut = INNER
      const slice = this.lineBuf.slice(0, INNER)
      const lastSpace = slice.lastIndexOf(" ")
      if (lastSpace > INNER * 0.4) cut = lastSpace
      this.emitLine(this.lineBuf.slice(0, cut))
      this.lineBuf = this.lineBuf.slice(cut).trimStart()
    }
    if (force && this.lineBuf.length > 0) {
      this.emitLine(this.lineBuf)
      this.lineBuf = ""
    }
  }

  append(delta: string) {
    if (!delta || !this.open) return
    this.chars += visibleLen(delta)
    if (!this.boxOpen) {
      this.lineBuf += delta
      if (this.lineBuf.includes("\n") || visibleLen(this.lineBuf) >= 24) this.openBox()
      return
    }

    for (const ch of delta) {
      if (ch === "\n") {
        this.flushLineBuf(true)
        continue
      }
      this.lineBuf += ch
      if (visibleLen(this.lineBuf) >= INNER) this.flushLineBuf(false)
    }
  }

  close() {
    if (!this.open) return { ms: 0, chars: 0 }
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
    const ms = Date.now() - this.startedAt
    if (!this.boxOpen) {
      clearStatusLine()
      const preview = this.lineBuf.replace(/\s+/g, " ").trim()
      if (preview && !preview.startsWith("[REDACTED]")) {
        UI.println(
          UI.Style.TEXT_INFO_BOLD +
            "  ◆ Thinking" +
            UI.Style.TEXT_NORMAL +
            UI.Style.TEXT_DIM +
            ` · ${(ms / 1000).toFixed(1)}s` +
            UI.Style.TEXT_NORMAL,
        )
        UI.println(UI.Style.TEXT_DIM + "  ╭" + "─".repeat(INNER) + "╮" + UI.Style.TEXT_NORMAL)
        this.emitLine(preview.length > INNER ? preview.slice(0, INNER - 1) + "…" : preview)
        this.boxOpen = true
      } else {
        clearStatusLine()
      }
    } else {
      clearStatusLine()
      this.flushLineBuf(true)
    }

    if (this.boxOpen) {
      const tail = ` done · ${(ms / 1000).toFixed(1)}s `
      const fill = Math.max(2, INNER - visibleLen(tail))
      UI.println(
        UI.Style.TEXT_DIM + "  ╰" + "─".repeat(fill) + tail + "╯" + UI.Style.TEXT_NORMAL,
      )
      UI.empty()
    }

    this.open = false
    this.boxOpen = false
    this.lineBuf = ""
    return { ms, chars: this.chars }
  }

  /** One-shot reasoning block (no stream). */
  static showCollapsed(text: string) {
    const t = text.trim()
    if (!t || t.startsWith("[REDACTED]")) return
    UI.println(
      UI.Style.TEXT_DIM +
        "  ◆ " +
        (t.length > 64 ? t.slice(0, 63) + "…" : t) +
        UI.Style.TEXT_NORMAL,
    )
  }
}
