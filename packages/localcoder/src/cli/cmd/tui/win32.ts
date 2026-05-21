import { dlopen, ptr } from "bun:ffi"
import type { ReadStream } from "node:tty"

const STD_INPUT_HANDLE = -10
const ENABLE_PROCESSED_INPUT = 0x0001
const ENABLE_MOUSE_INPUT = 0x0010
const ENABLE_QUICK_EDIT_MODE = 0x0040
const ENABLE_EXTENDED_FLAGS = 0x0080

const kernel = () =>
  dlopen("kernel32.dll", {
    GetStdHandle: { args: ["i32"], returns: "ptr" },
    GetConsoleMode: { args: ["ptr", "ptr"], returns: "i32" },
    SetConsoleMode: { args: ["ptr", "u32"], returns: "i32" },
    FlushConsoleInputBuffer: { args: ["ptr"], returns: "i32" },
  })

let k32: ReturnType<typeof kernel> | undefined

function load() {
  if (process.platform !== "win32") return false
  try {
    k32 ??= kernel()
    return true
  } catch {
    return false
  }
}

/** Console mode for in-app mouse selection (not conhost Quick Edit mark/copy). */
export function targetWin32ConsoleMode(mode: number): number {
  let next = mode
  next &= ~ENABLE_PROCESSED_INPUT
  next &= ~ENABLE_QUICK_EDIT_MODE
  next |= ENABLE_EXTENDED_FLAGS
  next |= ENABLE_MOUSE_INPUT
  return next
}

function applyWin32ConsoleMode() {
  if (process.platform !== "win32") return
  if (!process.stdin.isTTY) return
  if (!load()) return

  const handle = k32!.symbols.GetStdHandle(STD_INPUT_HANDLE)
  const buf = new Uint32Array(1)
  if (k32!.symbols.GetConsoleMode(handle, ptr(buf)) === 0) return

  const mode = buf[0]!
  const next = targetWin32ConsoleMode(mode)
  if (next === mode) return
  k32!.symbols.SetConsoleMode(handle, next)
}

/**
 * Configure stdin console for TUI mouse (disable Quick Edit, enable mouse input).
 */
export function win32DisableProcessedInput() {
  applyWin32ConsoleMode()
}

export function win32FlushInputBuffer() {
  if (process.platform !== "win32") return
  if (!process.stdin.isTTY) return
  if (!load()) return

  const handle = k32!.symbols.GetStdHandle(STD_INPUT_HANDLE)
  k32!.symbols.FlushConsoleInputBuffer(handle)
}

let unhook: (() => void) | undefined

export function win32InstallCtrlCGuard() {
  if (process.platform !== "win32") return
  if (!process.stdin.isTTY) return
  if (!load()) return
  if (unhook) return unhook

  const stdin = process.stdin as ReadStream
  const original = stdin.setRawMode

  const handle = k32!.symbols.GetStdHandle(STD_INPUT_HANDLE)
  const buf = new Uint32Array(1)

  if (k32!.symbols.GetConsoleMode(handle, ptr(buf)) === 0) return
  const initial = buf[0]!

  const enforce = () => applyWin32ConsoleMode()

  const later = () => {
    enforce()
    setImmediate(enforce)
  }

  let wrapped: ReadStream["setRawMode"] | undefined

  if (typeof original === "function") {
    wrapped = (mode: boolean) => {
      const result = original.call(stdin, mode)
      later()
      return result
    }

    stdin.setRawMode = wrapped
  }

  later()

  const interval = setInterval(enforce, 100)
  interval.unref()

  let done = false
  unhook = () => {
    if (done) return
    done = true

    clearInterval(interval)
    if (wrapped && stdin.setRawMode === wrapped) {
      stdin.setRawMode = original
    }

    k32!.symbols.SetConsoleMode(handle, initial)
    unhook = undefined
  }

  return unhook
}


/** SGR + cell-motion mouse (drag to select). Complements OpenTUI native enableMouse. */
export function enableWindowsMouseTracking() {
  if (process.platform !== "win32") return
  if (!process.stdout.isTTY) return
  try {
    process.stdout.write("\x1b[?1002h\x1b[?1006h")
  } catch {}
}
