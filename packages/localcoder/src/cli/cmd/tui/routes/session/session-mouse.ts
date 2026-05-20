import { MouseButton, type MouseEvent } from "@opentui/core"
import { useRenderer } from "@opentui/solid"
import type { PromptRef } from "@tui/component/prompt"
import * as Clipboard from "@tui/util/clipboard"
import * as Selection from "@tui/util/selection"
import type { useToast } from "@tui/ui/toast"
import type { useDialog } from "@tui/ui/dialog"
import { openSessionContextMenu } from "./session-context-menu"

export function createSessionMouseHandlers(input: {
  dialog: ReturnType<typeof useDialog>
  toast: ReturnType<typeof useToast>
  getPrompt: () => PromptRef | undefined
}) {
  const renderer = useRenderer()

  async function pasteIntoPrompt() {
    const content = await Clipboard.read()
    if (content?.mime === "text/plain" && content.data) {
      input.getPrompt()?.append(content.data)
      input.getPrompt()?.focus()
      input.toast.show({ message: "Pasted into prompt", variant: "info" })
      return true
    }
    return false
  }

  return {
    async onMouseDown(evt: MouseEvent) {
      if (evt.button === MouseButton.MIDDLE) {
        evt.preventDefault()
        await pasteIntoPrompt()
        return
      }
      if (evt.button === MouseButton.RIGHT) {
        evt.preventDefault()
        if (Selection.selectedText(renderer)) {
          await Clipboard.copy(Selection.selectedText(renderer)!)
          input.toast.show({ message: "Copied to clipboard", variant: "info" })
          renderer.clearSelection()
          return
        }
        openSessionContextMenu({
          dialog: input.dialog,
          toast: input.toast,
          prompt: input.getPrompt(),
        })
      }
    },
    onMouseUp(_evt: MouseEvent) {},
  }
}
