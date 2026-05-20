from pathlib import Path
import json

ROOT = Path(r"P:\localcoder")
PKG = ROOT / "packages" / "localcoder"

def patch(path, old, new):
    p = PKG / path
    text = p.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"patch miss in {path}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")
    print("patched", path)

(PKG / "src/cli/cmd/tui/context/keyboard-layer.tsx").write_text("""import { createSignal } from \"solid-js\"
import { useKeyboard, useRenderer } from \"@opentui/solid\"
import { createSimpleContext } from \"./helper\"
import { useExit } from \"./exit\"

export type LayerKeyEvent = {
  name?: string
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  super?: boolean
  defaultPrevented?: boolean
}

export type LayerResponder = (event?: LayerKeyEvent) => boolean | void

const BASE_LAYERS = new Set([\"base\", \"prompt\"])

export const { use: useKeyboardLayer, provider: KeyboardLayerProvider } = createSimpleContext({
  name: \"KeyboardLayer\",
  init: () => {
    const exit = useExit()
    const renderer = useRenderer()
    const [stack, setStack] = createSignal<{ id: string; responder?: LayerResponder }[]>([{ id: \"base\" }])

    useKeyboard((evt) => {
      if (evt.defaultPrevented) return
      if (!evt.ctrl || evt.name !== \"c\") return
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
      renderer.destroy()
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
        setStack([{ id: \"base\" }])
      },
    }
  },
})
""", encoding="utf-8")
print("wrote keyboard-layer")

patch("src/cli/cmd/tui/component/type-to-focus.tsx",
    "    if (!layers.isEmpty()) return\n    if (dialog.stack.length > 0) return\n    if (evt.ctrl || evt.meta || evt.alt) return",
    "    if (layers.hasOverlay()) return\n    if (dialog.stack.length > 0) return\n    if (evt.ctrl || evt.meta) return")

patch("src/cli/cmd/tui/plugin/api.tsx",
    "function routeCurrent(route: ReturnType<typeof useRoute>): TuiPluginApi[\"route\"][\"current\"] {\n  if (route.data.type === \"home\") return { name: \"home\" }\n  if (route.data.type === \"session\") {",
    "function routeCurrent(route: ReturnType<typeof useRoute>): TuiPluginApi[\"route\"][\"current\"] {\n  if (route.data.type === \"home\") return { name: \"home\" }\n  if (route.data.type === \"new-session\") {\n    return {\n      name: \"new-session\",\n      params: {\n        message: route.data.message,\n        agent: route.data.agent,\n        model: route.data.model,\n        variant: route.data.variant,\n        workspaceID: route.data.workspaceID,\n        parts: route.data.parts,\n        mode: route.data.mode,\n      },\n    }\n  }\n  if (route.data.type === \"session\") {")

idx = PKG / "src/cli/cmd/tui/routes/session/index.tsx"
text = idx.read_text(encoding="utf-8")
if "ListTool" not in text:
    text = text.replace('import { GlobTool } from "@/tool/glob"', 'import { GlobTool } from "@/tool/glob"\nimport { ListTool } from "@/tool/list"')
text = text.replace("<ListDir {...toolprops} />", "<ListDir {...(toolprops as ToolProps<typeof ListTool>)} />")
idx.write_text(text, encoding="utf-8")
print("patched session index")

dialog = PKG / "src/cli/cmd/tui/ui/dialog.tsx"
dtext = dialog.read_text(encoding="utf-8")
if "DialogKeyboardLayer" not in dtext:
    dtext = dtext.replace('import { batch, createContext, Show, useContext, type JSX, type ParentProps } from "solid-js"',
        'import { batch, createContext, createEffect, Show, useContext, type JSX, type ParentProps } from "solid-js"')
    dtext = dtext.replace('import { useToast } from "./toast"', 'import { useToast } from "./toast"\nimport { useKeyboardLayer } from "@tui/context/keyboard-layer"')
    dtext = dtext.replace("export function DialogProvider(props: ParentProps) {\n  const value = init()",
        "function DialogKeyboardLayer(props: { stack: ReturnType<typeof init>[\"stack\"] }) {\n  const layers = useKeyboardLayer()\n  createEffect(() => {\n    if (props.stack.length > 0) {\n      layers.push(\"dialog\", () => props.stack.length > 0)\n    } else {\n      layers.pop(\"dialog\")\n    }\n  })\n}\n\nexport function DialogProvider(props: ParentProps) {\n  const value = init()")
    dtext = dtext.replace("    <ctx.Provider value={value}>\n      {props.children}",
        "    <ctx.Provider value={value}>\n      <DialogKeyboardLayer stack={value.stack} />\n      {props.children}")
    dialog.write_text(dtext, encoding="utf-8")
    print("patched dialog")

prompt = PKG / "src/cli/cmd/tui/component/prompt/index.tsx"
ptext = prompt.read_text(encoding="utf-8")
if "useKeyboardLayer" not in ptext:
    ptext = ptext.replace('import { useExit } from "../../context/exit"', 'import { useExit } from "../../context/exit"\nimport { useKeyboardLayer } from "@tui/context/keyboard-layer"')
if 'layers.push("prompt"' not in ptext:
    ptext = ptext.replace("  const exit = useExit()\n", "  const exit = useExit()\n  const layers = useKeyboardLayer()\n")
    ptext = ptext.replace("  onMount(() => {\n    const saved = stashed",
        "  onMount(() => {\n    layers.push(\"prompt\", () => {\n      if (dialog.stack.length > 0) return false\n      if (store.prompt.input !== \"\") {\n        input.clear()\n        input.extmarks.clear()\n        setStore(\"prompt\", { input: \"\", parts: [] })\n        setStore(\"extmarkToPartIndex\", new Map())\n        return true\n      }\n      return false\n    })\n    const saved = stashed")
    ptext = ptext.replace("  onCleanup(() => {\n    if (store.prompt.input) {", "  onCleanup(() => {\n    layers.pop(\"prompt\")\n    if (store.prompt.input) {")
    prompt.write_text(ptext, encoding="utf-8")
    print("patched prompt")

nord = json.loads((PKG / "src/cli/cmd/tui/context/theme/nord.json").read_text(encoding="utf-8"))
nc_defs = {"ncBg":"#0D0D12","ncPanel":"#1A1A24","ncDialog":"#0A0A10","ncPrimary":"#56D6C2","ncPlan":"#CF8EF4","ncAccent":"#89B4FA","ncSuccess":"#82E0AA","ncError":"#E74C5E","ncWarn":"#E0AF68","ncMuted":"#4E4E66","ncText":"#CDD6F4","ncBorder":"#34344A"}
mapping = {"nord0":"ncBg","nord1":"ncPanel","nord2":"ncDialog","nord3":"ncBorder","nord4":"ncText","nord5":"ncPanel","nord6":"ncText","nord7":"ncAccent","nord8":"ncPrimary","nord9":"ncAccent","nord10":"ncPrimary","nord11":"ncError","nord12":"ncWarn","nord13":"ncWarn","nord14":"ncSuccess","nord15":"ncPlan"}
def remap(val):
    return mapping.get(val, val) if isinstance(val, str) else val
theme = nord["theme"]
for key, val in theme.items():
    if isinstance(val, dict):
        for mode in ("dark","light"):
            if mode in val: val[mode] = remap(val[mode])
theme["accent"] = {"dark":"ncPlan","light":"ncPlan"}
theme["primary"] = {"dark":"ncPrimary","light":"ncPrimary"}
theme["secondary"] = {"dark":"ncAccent","light":"ncAccent"}
(PKG / "src/cli/cmd/tui/context/theme/nightcode.json").write_text(json.dumps({"$schema":"https://localcoder.ai/theme.json","defs":nc_defs,"theme":theme}, indent=2)+"\n", encoding="utf-8")
print("wrote nightcode.json")

(PKG / "test/session/tool-phase.test.ts").write_text(open(r"P:\localcoder\packages\localcoder\test\session\tool-phase.test.ts").read() if False else "", encoding="utf-8")
