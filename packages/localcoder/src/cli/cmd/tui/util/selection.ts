import * as Clipboard from "./clipboard"

type Toast = {
  show: (input: { message: string; variant: "info" | "success" | "warning" | "error" }) => void
  error: (err: unknown) => void
}

type Renderer = {
  getSelection: () => { getSelectedText: () => string } | null
  clearSelection: () => void
}

export function selectedText(renderer: Renderer): string | undefined {
  const text = renderer.getSelection()?.getSelectedText()
  if (!text || text.length === 0) return undefined
  return text
}

export function copy(renderer: Renderer, toast: Toast): boolean {
  const text = selectedText(renderer)
  if (!text) return false

  Clipboard.copy(text)
    .then(() => toast.show({ message: "Copied to clipboard", variant: "info" }))
    .catch(toast.error)

  renderer.clearSelection()
  return true
}

export function cut(renderer: Renderer, toast: Toast): boolean {
  const text = selectedText(renderer)
  if (!text) return false

  Clipboard.copy(text)
    .then(() => toast.show({ message: "Cut to clipboard", variant: "info" }))
    .catch(toast.error)

  renderer.clearSelection()
  return true
}

/** Copy when the user finishes a mouse selection (mouseup). */
export function copyOnMouseUp(renderer: Renderer, toast: Toast): boolean {
  return copy(renderer, toast)
}

export * as Selection from "./selection"
