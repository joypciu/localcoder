import { MouseButton, type MouseEvent } from "@opentui/core"
import { useRenderer } from "@opentui/solid"
import type { PromptRef } from "@tui/component/prompt"
import type { useToast } from "@tui/ui/toast"
import type { useDialog } from "@tui/ui/dialog"
import { openReadonlySelectionMenu, pasteTextFromClipboard } from "@tui/util/selection-actions"

export function createSessionMouseHandlers(input: {
  dialog: ReturnType<typeof useDialog>
  toast: ReturnType<typeof useToast>
  getPrompt: () => PromptRef | undefined
}) {
  const renderer = useRenderer()

  return {
    async onMouseDown(evt: MouseEvent) {
      if (evt.button === MouseButton.MIDDLE) {
        evt.preventDefault()
        await pasteTextFromClipboard({
          toast: input.toast,
          insert: (text) => input.getPrompt()?.append(text),
          focus: () => input.getPrompt()?.focus(),
        })
        return
      }
      if (evt.button === MouseButton.RIGHT) {
        evt.preventDefault()
        openReadonlySelectionMenu({
          dialog: input.dialog,
          toast: input.toast,
          renderer,
          prompt: input.getPrompt(),
        })
      }
    },
  }
}
