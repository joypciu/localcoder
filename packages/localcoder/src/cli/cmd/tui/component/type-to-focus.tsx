import { useKeyboard } from "@opentui/solid"
import { usePromptRef } from "@tui/context/prompt"
import { useKeyboardLayer } from "@tui/context/keyboard-layer"
import { useDialog } from "@tui/ui/dialog"

const PRINTABLE = /^[a-z0-9`~!@#$%^&*()_\-+=[\]{}|;':",./<>? ]$/i

/** OpenCode-style: typing focuses the prompt when no overlay is active. */
export function TypeToFocus() {
  const promptRef = usePromptRef()
  const layers = useKeyboardLayer()
  const dialog = useDialog()

  useKeyboard((evt) => {
    if (evt.defaultPrevented) return
    if (layers.hasOverlay()) return
    if (dialog.stack.length > 0) return
    if (evt.ctrl || evt.meta) return
    if (!evt.name || evt.name.length !== 1) return
    if (!PRINTABLE.test(evt.name)) return
    const ref = promptRef.current
    if (!ref || ref.focused) return
    ref.focus()
  })

  return null
}
