import { createSignal } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { createSimpleContext } from "./helper"
import { useExit } from "./exit"

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
    const [stack, setStack] = createSignal<{ id: string; responder?: LayerResponder }[]>([{ id: "base" }])

    useKeyboard((evt) => {
      if (evt.defaultPrevented) return
      if (!evt.ctrl || evt.name !== "c") return
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
      void exit()
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
