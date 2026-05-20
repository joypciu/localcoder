from pathlib import Path

ROOT = Path(r"P:/localcoder/packages/localcoder/src")
TUI = ROOT / "cli/cmd/tui"

def w(path: Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print("write", path.relative_to(ROOT.parent.parent))

# --- session/tool-phase.ts ---
w(ROOT / "session/tool-phase.ts", '''import type { MessageV2 } from "./message-v2"

/** Whether the assistant message still has client-executed tools in flight. */
export function hasPendingClientTools(msg: MessageV2.WithParts | undefined): boolean {
  if (!msg) return false
  return msg.parts.some(
    (part) =>
      part.type === "tool" &&
      !part.metadata?.providerExecuted &&
      (part.state.status === "pending" || part.state.status === "running"),
  )
}

/** Whether the loop should continue after an assistant turn (NightCode: lastAssistantMessageIsCompleteWithToolCalls). */
export function shouldContinueToolLoop(input: {
  lastUser: MessageV2.User
  lastAssistant: MessageV2.Assistant | undefined
  lastAssistantMsg: MessageV2.WithParts | undefined
}): boolean {
  const { lastUser, lastAssistant, lastAssistantMsg } = input
  if (!lastAssistant) return true
  if (hasPendingClientTools(lastAssistantMsg)) return true
  if (lastAssistant.finish === "tool-calls") return true
  if (lastAssistantMsg?.parts.some((p) => p.type === "tool" && !p.metadata?.providerExecuted)) return true
  if (lastUser.id >= lastAssistant.id) return true
  if (!lastAssistant.finish || ["tool-calls", "unknown"].includes(lastAssistant.finish)) return true
  return false
}
''')

# --- nightcode theme ---
w(TUI / "context/theme/nightcode.json", '''{
  "$schema": "https://localcoder.ai/theme.json",
  "defs": {
    "ncBg": "#0D0D12",
    "ncPanel": "#1A1A24",
    "ncDialog": "#0A0A10",
    "ncPrimary": "#56D6C2",
    "ncPlan": "#CF8EF4",
    "ncAccent": "#89B4FA",
    "ncSuccess": "#82E0AA",
    "ncError": "#E74C5E",
    "ncWarn": "#E0AF68",
    "ncMuted": "#4E4E66",
    "ncText": "#CDD6F4",
    "ncBorder": "#34344A"
  },
  "theme": {
    "primary": { "dark": "ncPrimary", "light": "ncPrimary" },
    "secondary": { "dark": "ncAccent", "light": "ncAccent" },
    "accent": { "dark": "ncPlan", "light": "ncPlan" },
    "error": { "dark": "ncError", "light": "ncError" },
    "warning": { "dark": "ncWarn", "light": "ncWarn" },
    "success": { "dark": "ncSuccess", "light": "ncSuccess" },
    "info": { "dark": "ncPrimary", "light": "ncPrimary" },
    "text": { "dark": "ncText", "light": "ncText" },
    "textMuted": { "dark": "ncMuted", "light": "ncMuted" },
    "background": { "dark": "ncBg", "light": "ncBg" },
    "backgroundPanel": { "dark": "ncPanel", "light": "ncPanel" },
    "backgroundElement": { "dark": "ncDialog", "light": "ncDialog" },
    "backgroundMenu": { "dark": "ncPanel", "light": "ncPanel" },
    "border": { "dark": "ncBorder", "light": "ncBorder" },
    "borderActive": { "dark": "ncPrimary", "light": "ncPrimary" },
    "borderFaint": { "dark": "ncMuted", "light": "ncMuted" },
    "markdownText": { "dark": "ncText", "light": "ncText" },
    "markdownHeading": { "dark": "ncPrimary", "light": "ncPrimary" },
    "diffAdded": { "dark": "ncSuccess", "light": "ncSuccess" },
    "diffRemoved": { "dark": "ncError", "light": "ncError" }
  }
}
''')

# --- keyboard layer enhanced ---
w(TUI / "context/keyboard-layer.tsx", '''import { createSignal } from "solid-js"
import { createSimpleContext } from "./helper"

export type LayerKeyEvent = {
  name?: string
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  super?: boolean
  defaultPrevented?: boolean
}

export type LayerResponder = (event: LayerKeyEvent) => boolean | void

export const { use: useKeyboardLayer, provider: KeyboardLayerProvider } = createSimpleContext({
  name: "KeyboardLayer",
  init: () => {
    const [stack, setStack] = createSignal<{ id: string; responder?: LayerResponder }[]>([])

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
      isEmpty() {
        return stack().length === 0
      },
      handle(event: LayerKeyEvent) {
        for (const layer of [...stack()].reverse()) {
          if (layer.responder?.(event)) return true
        }
        return false
      },
      clear() {
        setStack([])
      },
    }
  },
})
''')

# --- type-to-focus ---
w(TUI / "component/type-to-focus.tsx", '''import { useKeyboard } from "@opentui/solid"
import { onMount, onCleanup } from "solid-js"
import { usePromptRef } from "@tui/context/prompt"
import { useKeyboardLayer } from "@tui/context/keyboard-layer"
import { useDialog } from "@tui/ui/dialog"

const PRINTABLE = /^[a-z0-9`~!@#$%^&*()_\-+=[\]{}|;':",./<>? ]$/i

/** OpenCode-style: typing focuses the prompt when no overlay consumes keys. */
export function TypeToFocus() {
  const promptRef = usePromptRef()
  const layers = useKeyboardLayer()
  const dialog = useDialog()

  useKeyboard((evt) => {
    if (evt.defaultPrevented) return
    if (!layers.isEmpty()) return
    if (dialog.stack.length > 0) return
    if (evt.ctrl || evt.meta || evt.alt) return
    if (!evt.name || evt.name.length !== 1) return
    if (!PRINTABLE.test(evt.name)) return
    const ref = promptRef.current
    if (!ref) return
    if (ref.focused) return
    ref.focus()
    ref.current // touch
    // insert the character
    evt.preventDefault()
  })

  return null
}
''')

print("batch 1 done")
