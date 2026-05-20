import { useRenderer } from "@opentui/solid"
import { DialogSelect } from "@tui/ui/dialog-select"
import type { useDialog } from "@tui/ui/dialog"
import type { PromptRef } from "@tui/component/prompt"
import * as Clipboard from "@tui/util/clipboard"
import * as Selection from "@tui/util/selection"
import type { useToast } from "@tui/ui/toast"

export function openSessionContextMenu(input: {
  dialog: ReturnType<typeof useDialog>
  toast: ReturnType<typeof useToast>
  prompt?: PromptRef
}) {
  const renderer = useRenderer()
  const selected = Selection.selectedText(renderer)

  input.dialog.replace(() => (
    <DialogSelect
      title="Text actions"
      options={[
        {
          title: "Copy selection",
          value: "copy" as const,
          description: selected ? `${selected.length} characters selected` : "Select text with the mouse first",
          disabled: !selected,
        },
        {
          title: "Paste into prompt",
          value: "paste" as const,
          description: "Insert clipboard at the prompt cursor",
        },
        {
          title: "Cut selection to prompt",
          value: "cut" as const,
          description: selected ? "Copy selection, then replace the prompt" : "Select text first",
          disabled: !selected,
        },
      ]}
      onSelect={(option) => {
        void (async () => {
          if (option.value === "copy" && selected) {
            await Clipboard.copy(selected)
            input.toast.show({ message: "Copied to clipboard", variant: "info" })
            renderer.clearSelection()
          }
          if (option.value === "paste") {
            const content = await Clipboard.read()
            if (content?.mime === "text/plain" && content.data) {
              input.prompt?.append(content.data)
              input.prompt?.focus()
              input.toast.show({ message: "Pasted into prompt", variant: "info" })
            } else {
              input.toast.show({ message: "No text in clipboard", variant: "warning" })
            }
          }
          if (option.value === "cut" && selected) {
            await Clipboard.copy(selected)
            input.prompt?.set({ input: selected, parts: [] })
            input.prompt?.focus()
            renderer.clearSelection()
            input.toast.show({ message: "Cut to prompt", variant: "info" })
          }
          input.dialog.clear()
        })()
      }}
    />
  ))
}
