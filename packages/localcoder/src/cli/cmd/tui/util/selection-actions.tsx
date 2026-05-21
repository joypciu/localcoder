import { DialogSelect } from "@tui/ui/dialog-select"
import type { useDialog } from "@tui/ui/dialog"
import type { useToast } from "@tui/ui/toast"
import * as Clipboard from "./clipboard"
import * as Selection from "./selection"
import type { PromptRef } from "@tui/component/prompt"

export type SelectionActionHandlers = {
  getSelectedText: () => string | undefined
  clearSelection: () => void
  onCopy: (text: string) => void | Promise<void>
  onCut?: (text: string) => void | Promise<void>
  onDelete?: () => void
  onPaste?: () => void | Promise<void>
}

export function openSelectionActionsMenu(input: {
  dialog: ReturnType<typeof useDialog>
  toast: ReturnType<typeof useToast>
  title?: string
  editable?: boolean
  handlers: SelectionActionHandlers
}) {
  const selected = input.handlers.getSelectedText()
  const hasSelection = !!selected && selected.length > 0
  const editable = input.editable ?? false

  const options = [
    {
      title: "Copy",
      value: "copy" as const,
      description: hasSelection ? `${selected!.length} characters` : "Select text first",
      disabled: !hasSelection,
    },
    ...(editable
      ? [
          {
            title: "Cut",
            value: "cut" as const,
            description: "Copy and remove from input",
            disabled: !hasSelection,
          },
          {
            title: "Delete",
            value: "delete" as const,
            description: "Remove selection without copying",
            disabled: !hasSelection,
          },
        ]
      : [
          {
            title: "Cut to prompt",
            value: "cut_to_prompt" as const,
            description: hasSelection ? "Replace prompt with selection" : "Select text first",
            disabled: !hasSelection,
          },
        ]),
    {
      title: "Paste",
      value: "paste" as const,
      description: editable ? "Insert clipboard at cursor" : "Insert clipboard into prompt",
      disabled: !input.handlers.onPaste,
    },
    ...(hasSelection
      ? [
          {
            title: "Clear selection",
            value: "clear" as const,
            description: "Deselect without changing clipboard",
          },
        ]
      : []),
  ]

  input.dialog.replace(() => (
    <DialogSelect
      title={input.title ?? "Selection"}
      options={options}
      onSelect={(option) => {
        void (async () => {
          const text = input.handlers.getSelectedText()
          if (option.value === "copy" && text) {
            await input.handlers.onCopy(text)
          }
          if (option.value === "cut" && text && input.handlers.onCut) {
            await input.handlers.onCut(text)
          }
          if (option.value === "delete" && input.handlers.onDelete) {
            input.handlers.onDelete()
          }
          if (option.value === "cut_to_prompt" && text && input.handlers.onCut) {
            await input.handlers.onCut(text)
          }
          if (option.value === "paste" && input.handlers.onPaste) {
            await input.handlers.onPaste()
          }
          if (option.value === "clear") {
            input.handlers.clearSelection()
          }
          input.dialog.clear()
        })()
      }}
    />
  ))
}

export async function pasteTextFromClipboard(input: {
  toast: ReturnType<typeof useToast>
  insert: (text: string) => void
  focus?: () => void
}) {
  const content = await Clipboard.read()
  if (content?.mime === "text/plain" && content.data) {
    input.insert(content.data)
    input.focus?.()
    input.toast.show({ message: "Pasted", variant: "info" })
    return true
  }
  input.toast.show({ message: "No text in clipboard", variant: "warning" })
  return false
}


export function openReadonlySelectionMenu(input: {
  dialog: ReturnType<typeof useDialog>
  toast: ReturnType<typeof useToast>
  renderer: { getSelection: () => { getSelectedText: () => string } | null; clearSelection: () => void }
  prompt?: PromptRef
}) {
  openSelectionActionsMenu({
    dialog: input.dialog,
    toast: input.toast,
    title: "Text actions",
    editable: false,
    handlers: {
      getSelectedText: () => Selection.selectedText(input.renderer),
      clearSelection: () => input.renderer.clearSelection(),
      onCopy: async (text) => {
        await Clipboard.copy(text)
        input.toast.show({ message: "Copied to clipboard", variant: "info" })
        input.renderer.clearSelection()
      },
      onCut: async (text) => {
        await Clipboard.copy(text)
        input.prompt?.set({ input: text, parts: [] })
        input.prompt?.focus()
        input.renderer.clearSelection()
        input.toast.show({ message: "Cut to prompt", variant: "info" })
      },
      onPaste: async () => {
        await pasteTextFromClipboard({
          toast: input.toast,
          insert: (t) => input.prompt?.append(t),
          focus: () => input.prompt?.focus(),
        })
      },
    },
  })
}
