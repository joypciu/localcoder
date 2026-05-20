import { TextAttributes } from "@opentui/core"
import { Show } from "solid-js"
import { useTheme } from "@tui/context/theme"

/** On-screen reminder of rich input / mouse shortcuts. */
export function InputShortcuts(props: { compact?: boolean }) {
  const { theme } = useTheme()
  const full =
    "Shift+Enter newline · drag to select · release copies · right-click menu · middle-click paste · Ctrl+C/X in prompt"
  const short = "Shift+Enter · drag select · RMB menu · MMB paste"
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
