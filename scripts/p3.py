from pathlib import Path
R = Path(r"P:/localcoder/packages/localcoder/src")

# keyboard layer
kb = R / "cli/cmd/tui/context/keyboard-layer.tsx"
if not kb.exists():
    kb.write_text("""import { createSignal } from \"solid-js\"
import { createSimpleContext } from \"./helper\"

type KeyEvent = { name?: string; ctrl?: boolean; meta?: boolean; shift?: boolean }
type Responder = (event: KeyEvent) => boolean | void

export const { use: useKeyboardLayer, provider: KeyboardLayerProvider } = createSimpleContext({
  name: \"KeyboardLayer\",
  init: () => {
    const [stack, setStack] = createSignal<{ id: string; responder?: Responder }[]>([])
    return {
      push(id: string, responder?: Responder) {
        setStack((s) => [...s.filter((x) => x.id !== id), { id, responder }])
      },
      pop(id: string) {
        setStack((s) => s.filter((x) => x.id !== id))
      },
      handle(event: KeyEvent) {
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
""", encoding="utf-8")
    print("keyboard-layer")

# prompt interrupt
p = R / "cli/cmd/tui/component/prompt/index.tsx"
t = p.read_text(encoding="utf-8")
old = """          setStore(\"interrupt\", store.interrupt + 1)

          setTimeout(() => {
            setStore(\"interrupt\", 0)
          }, 5000)

          if (store.interrupt >= 2) {
            void sdk.client.session.abort({
              sessionID: props.sessionID,
            })
            setStore(\"interrupt\", 0)
          }"""
new = """          void sdk.client.session.abort({
              sessionID: props.sessionID,
            })"""
if old in t:
    t = t.replace(old, new)
    print("interrupt command")

t = t.replace(
    """                <text fg={store.interrupt > 0 ? theme.primary : theme.text}>
                  esc{\" \"}
                  <span style={{ fg: store.interrupt > 0 ? theme.primary : theme.textMuted }}>
                    {store.interrupt > 0 ? \"again to interrupt\" : \"interrupt\"}
                  </span>
                </text>""",
    """                <text fg={theme.textMuted}>
                  esc <span style={{ fg: theme.textMuted }}>to interrupt</span>
                </text>""",
)

needle = '                if (store.mode === "normal") autocomplete.onKeyDown(e)'
ins = """                if (
                  e.name === "escape" &&
                  props.sessionID &&
                  status().type !== "idle" &&
                  !autocomplete.visible
                ) {
                  e.preventDefault()
                  void sdk.client.session.abort({ sessionID: props.sessionID })
                  return
                }
                if (store.mode === "normal") autocomplete.onKeyDown(e)"""
if ins not in t and needle in t:
    t = t.replace(needle, ins, 1)
    print("escape abort")

p.write_text(t, encoding="utf-8")
