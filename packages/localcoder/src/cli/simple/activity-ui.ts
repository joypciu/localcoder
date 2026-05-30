import { UI } from "@/cli/ui"
import { clearStatusLine, finishStatusLine, writeStatusLine } from "./stderr-line"

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const

/** Live spinner + elapsed seconds while waiting for the model. */
export class TurnActivity {
  private startedAt = Date.now()
  private frame = 0
  private label = "Working"
  private timer?: ReturnType<typeof setInterval>
  private active = false

  start(label = "Working") {
    this.stop()
    this.label = label
    this.startedAt = Date.now()
    this.frame = 0
    this.active = true
    this.tick()
    this.timer = setInterval(() => this.tick(), 120)
  }

  setLabel(label: string) {
    this.label = label
    if (this.active) this.tick()
  }

  private elapsedSec() {
    return ((Date.now() - this.startedAt) / 1000).toFixed(1)
  }

  private tick() {
    if (!this.active) return
    const icon = FRAMES[this.frame % FRAMES.length]!
    this.frame++
    writeStatusLine(
      UI.Style.TEXT_DIM +
        `  ${icon} ${this.label}` +
        UI.Style.TEXT_NORMAL +
        UI.Style.TEXT_DIM +
        ` · ${this.elapsedSec()}s` +
        UI.Style.TEXT_NORMAL,
    )
  }

  /** Clear spinner line without printing a summary. */
  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
    if (this.active) clearStatusLine()
    this.active = false
  }

  /** Clear spinner and print a one-line summary (e.g. after turn). */
  finish(summary?: string) {
    const ms = Date.now() - this.startedAt
    this.stop()
    if (summary) {
      finishStatusLine(
        UI.Style.TEXT_DIM + `  ${summary} · ${(ms / 1000).toFixed(1)}s` + UI.Style.TEXT_NORMAL,
      )
    }
    return ms
  }

  elapsedMs() {
    return Date.now() - this.startedAt
  }
}
