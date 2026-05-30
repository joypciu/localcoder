import { EOL } from "os"
import { UI } from "@/cli/ui"

function flush(stream: NodeJS.WriteStream) {
  if (typeof (stream as NodeJS.WriteStream & { flush?: () => void }).flush === "function") {
    ;(stream as NodeJS.WriteStream & { flush: () => void }).flush()
  }
}

/** Overwrite the current stderr line (spinner / thinking timer). */
export function writeStatusLine(line: string) {
  process.stderr.write("\x1b[2K\r" + line)
  flush(process.stderr)
}

export function clearStatusLine() {
  process.stderr.write("\x1b[2K\r")
  flush(process.stderr)
}

export function finishStatusLine(finalLine?: string) {
  clearStatusLine()
  if (finalLine) {
    process.stderr.write(finalLine + EOL)
    flush(process.stderr)
  }
}
