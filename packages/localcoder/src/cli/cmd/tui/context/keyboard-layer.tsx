import { createSignal } from "solid-js"
import { useKeyboard, useRenderer } from "@opentui/solid"
import { createSimpleContext } from "./helper"
import { useExit } from "./exit"
import { useToast } from "../ui/toast"
import * as Clipboard from "../util/clipboard"
import * as Selection from "../util/selection"

export type LayerKeyEvent = {
  name?: string
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  super?: boolean
  defaultPrevented?: boolean
}

export type LayerResponder = (event?: LayerKeyEvent) => boolean | void

const BASE_LAYERS = new Set(["base", "prompt"])

export const { use: useKeyboardLayer, provider: KeyboardLayerProvider } = createSimpleContext({
  name: "KeyboardLayer",
  init: () => {
    const exit = useExit()
    const renderer = useRenderer()
    const toast = useToast()
    const [stack, setStack] = createSignal<{ id: string; responder?: LayerResponder }[]>([{ id: "base" }])

    useKeyboard((evt) => {
      if (evt.defaultPrevented) return
      if (!evt.ctrl || evt.shift || evt.meta || evt.super) return
      const name = evt.name?.toLowerCase()
      if (name !== "c" && name !== "x") return

      const event: LayerKeyEvent = {
        name: evt.name,
        ctrl: evt.ctrl,
        meta: evt.meta,
        shift: evt.shift,
        super: evt.super,
        defaultPrevented: evt.defaultPrevented,
      }

      for (const layer of [...stack()].reverse()) {
        if (layer.responder?.(event)) {
          evt.preventDefault()
          evt.stopPropagation()
          return
        }
      }

      // Read-only renderer selection (chat messages, etc.)
      const rendererText = Selection.selectedText(renderer)
      if (rendererText) {
        if (name === "c") {
          Selection.copy(renderer, toast)
        } else {
          void Clipboard.copy(rendererText)
            .then(() => toast.show({ message: "Cut to clipboard", variant: "info" }))
            .catch(toast.error)
          renderer.clearSelection()
        }
        evt.preventDefault()
        evt.stopPropagation()
        return
      }

      // Ctrl+C with no selection: exit only (standard interrupt when nothing to copy)
      if (name === "c") void exit()
    })

    return {
      push(id: string, responder?: LayerResponder) {
        setStack((s) => [...s.filter((x) => x.id !== id), { id, responder }])
      },
      pop(id: string) {
        setStack((s) => s.filter((x) => x.id !== id))
      },
      top() {
        const s = stack()
        return s[s.length - 1]
      },
      isTopLayer(id: string) {
        const s = stack()
        return s.length > 0 && s[s.length - 1]?.id === id
      },
      isEmpty() {
        return stack().length === 0
      },
      hasOverlay() {
        return stack().some((layer) => !BASE_LAYERS.has(layer.id))
      },
      handle(event: LayerKeyEvent) {
        for (const layer of [...stack()].reverse()) {
          if (layer.responder?.(event)) return true
        }
        return false
      },
      clear() {
        setStack([{ id: "base" }])
      },
    }
  },
})
