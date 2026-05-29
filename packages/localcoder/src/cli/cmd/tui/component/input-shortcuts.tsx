import { TextAttributes } from "@opentui/core"
import { Show } from "solid-js"
import { useTheme } from "@tui/context/theme"
import { isLegacyWindowsConsole, windowsInputHint } from "@/util/windows-terminal"

/** On-screen reminder of rich input / mouse shortcuts. */
export function InputShortcuts(props: { compact?: boolean }) {
  const { theme } = useTheme()
  const full = windowsInputHint()
  const short =
    process.platform === "win32" && (process.env.LOCALCODER_LEGACY_TERMINAL === "1" || isLegacyWindowsConsole())
      ? "Enter newline · Ctrl+Enter send"
      : "Shift+Enter newline · Enter send"
  return (
    <Show when={!props.compact}>
      <text fg={theme.textMuted} attributes={TextAttributes.DIM}>
        {full}
      </text>
    </Show>
  )
}

export function InputShortcutsInline() {
  const { theme } = useTheme()
  return (
    <text fg={theme.textMuted} attributes={TextAttributes.DIM}>
      Shift+Enter · select · RMB · MMB paste
    </text>
  )
}
