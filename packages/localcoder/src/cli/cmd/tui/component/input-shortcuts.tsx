import { TextAttributes } from "@opentui/core"
import { Show } from "solid-js"
import { useTheme } from "@tui/context/theme"
import { windowsInputHint } from "@/util/windows-terminal"

/** On-screen reminder of rich input / mouse shortcuts. */
export function InputShortcuts(props: { compact?: boolean }) {
  const { theme } = useTheme()
  const full = windowsInputHint()
  const short = process.platform === "win32" ? "Enter · Ctrl+Enter send" : "Shift+Enter · RMB · MMB"
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
