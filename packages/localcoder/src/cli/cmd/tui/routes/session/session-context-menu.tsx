import type { useDialog } from "@tui/ui/dialog"
import type { PromptRef } from "@tui/component/prompt"
import type { useToast } from "@tui/ui/toast"
import { useRenderer } from "@opentui/solid"
import { openReadonlySelectionMenu } from "@tui/util/selection-actions"

export function openSessionContextMenu(input: {
  dialog: ReturnType<typeof useDialog>
  toast: ReturnType<typeof useToast>
  prompt?: PromptRef
}) {
  const renderer = useRenderer()
  openReadonlySelectionMenu({ ...input, renderer })
}
