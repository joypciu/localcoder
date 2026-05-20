from pathlib import Path
PKG = Path(r"P:\localcoder\packages\localcoder")
p = PKG / "src/cli/cmd/tui/routes/session/index.tsx"
t = p.read_text(encoding="utf-8")
t = t.replace("\n  const keybind = useKeybind()\n  const dialog = useDialog()\n  const renderer = useRenderer()","\n  const keybind = useKeybind()\n  const renderer = useRenderer()")
p.write_text(t, encoding="utf-8")
p2 = PKG / "src/cli/cmd/tui/component/prompt/index.tsx"
t2 = p2.read_text(encoding="utf-8")
if "append(text: string)" not in t2.split("export type PromptRef")[1][:400]:
    t2 = t2.replace("  set(prompt: PromptInfo): void\n  reset(): void","  set(prompt: PromptInfo): void\n  append(text: string): void\n  reset(): void")
    p2.write_text(t2, encoding="utf-8")
p3 = PKG / "src/cli/cmd/tui/routes/session/session-mouse.ts"
t3 = p3.read_text(encoding="utf-8")
old = "    async onMouseUp(evt: MouseEvent) {\n      if (evt.button !== MouseButton.LEFT) return\n      const text = Selection.selectedText(renderer)\n      if (!text) return\n      await Clipboard.copy(text)\n      input.toast.show({ message: \"Copied to clipboard\", variant: \"info\" })\n    },"
new = "    onMouseUp(_evt: MouseEvent) {},"
if old in t3:
    t3 = t3.replace(old, new)
    p3.write_text(t3, encoding="utf-8")
print("ok")
