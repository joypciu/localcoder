from pathlib import Path
PKG = Path(r"P:/localcoder/packages/localcoder")
p = PKG / "src/cli/cmd/tui/component/prompt/index.tsx"
t = p.read_text(encoding="utf-8")

def once(old, new):
    global t
    if old not in t:
        return False
    t = t.replace(old, new, 1)
    return True

patches = [
("imports", 'import { useExit } from "../../context/exit"', 'import { useExit } from "../../context/exit"\nimport { useKeyboardLayer } from "@tui/context/keyboard-layer"\nimport { InputShortcutsInline } from "@tui/component/input-shortcuts"'),
("type", """export type PromptRef = {
  focused: boolean
  current: PromptInfo
  set(prompt: PromptInfo): void
  reset(): void
  blur(): void
  focus(): void
  submit(): void
}""", """export type PromptRef = {
  focused: boolean
  current: PromptInfo
  set(prompt: PromptInfo): void
  append(text: string): void
  reset(): void
  blur(): void
  focus(): void
  submit(): void
}"""),
]
for name, a, b in patches:
    print(name, once(a,b))
# append ref
old = """    reset() {
      input.clear()
      input.extmarks.clear()
      setStore("prompt", {
        input: "",
        parts: [],
      })
      setStore("extmarkToPartIndex", new Map())
    },
    submit() {
      void submit()
    },
  }"""
new = """    append(text: string) {
      if (!text) return
      input.insertText(text)
      setStore("prompt", "input", input.plainText)
    },
    reset() {
      input.clear()
      input.extmarks.clear()
      setStore("prompt", {
        input: "",
        parts: [],
      })
      setStore("extmarkToPartIndex", new Map())
    },
    submit() {
      void submit()
    },
  }"""
print("ref", once(old,new))
print("layers var", once("  const exit = useExit()\n", "  const exit = useExit()\n  const layers = useKeyboardLayer()\n"))
print("mount", once("  onMount(() => {\n    const saved = stashed", "  onMount(() => {\n    layers.push(\"prompt\", () => {\n      if (dialog.stack.length > 0) return false\n      if (store.prompt.input !== \"\") {\n        input.clear()\n        input.extmarks.clear()\n        setStore(\"prompt\", { input: \"\", parts: [] })\n        setStore(\"extmarkToPartIndex\", new Map())\n        return true\n      }\n      return false\n    })\n    const saved = stashed"))
print("cleanup", once("  onCleanup(() => {\n    if (store.prompt.input) {", "  onCleanup(() => {\n    layers.pop(\"prompt\")\n    if (store.prompt.input) {"))
print("placeholder", once('    return `Ask anything... "${list()[store.placeholder % list().length]}"`', '    return `Ask anything... "${list()[store.placeholder % list().length]}" · Shift+Enter · drag select · RMB · MMB paste`'))
print("inline", once("""              </Show>
            </box>
          </box>
        </box>
        <box
          height={1}
          border={["left"]}
          borderColor={borderHighlight()}""", """              </Show>
            </box>
            <InputShortcutsInline />
          </box>
        </box>
        <box
          height={1}
          border={["left"]}
          borderColor={borderHighlight()}"""))
p.write_text(t, encoding="utf-8")
print("done")
