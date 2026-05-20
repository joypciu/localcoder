from pathlib import Path

ROOT = Path(r"P:\localcoder")
PKG = ROOT / "packages" / "localcoder"
CORE = ROOT / "packages" / "core"

def patch(path, old, new, base=PKG):
    p = base / path
    t = p.read_text(encoding="utf-8")
    if old not in t:
        raise SystemExit(f"MISS {path}: {old[:60]!r}")
    p.write_text(t.replace(old, new, 1), encoding="utf-8")
    print("ok", path)

# 1. Enable copy-on-select on Windows by default
patch(
    "src/flag/flag.ts",
    "  LOCALCODER_EXPERIMENTAL_DISABLE_COPY_ON_SELECT:\n    copy === undefined ? process.platform === \"win32\" : truthy(\"LOCALCODER_EXPERIMENTAL_DISABLE_COPY_ON_SELECT\"),",
    "  LOCALCODER_EXPERIMENTAL_DISABLE_COPY_ON_SELECT:\n    copy === undefined ? false : truthy(\"LOCALCODER_EXPERIMENTAL_DISABLE_COPY_ON_SELECT\"),",
    base=CORE,
)

# 2. shift+enter alias for newline
patch(
    "src/config/keybinds.ts",
    '  input_newline: keybind("shift+return,ctrl+return,alt+return,ctrl+j", "Insert newline in input"),',
    '  input_newline: keybind("shift+return,shift+enter,ctrl+return,ctrl+enter,alt+return,ctrl+j", "Insert newline in input"),',
)

# 3. textarea hardcoded shift+enter
patch(
    "src/cli/cmd/tui/component/textarea-keybindings.ts",
    '    { name: "return", shift: true, action: "newline" },',
    '    { name: "return", shift: true, action: "newline" },\n    { name: "enter", shift: true, action: "newline" },',
)

# 4. tui schema copy_on_select
patch(
    "src/cli/cmd/tui/config/tui-schema.ts",
    '  mouse: z.boolean().optional().describe("Enable or disable mouse capture (default: true)"),',
    '  mouse: z.boolean().optional().describe("Enable or disable mouse capture (default: true)"),\n  copy_on_select: z\n    .boolean()\n    .optional()\n    .describe("Copy selected text to clipboard when you release the mouse (default: true)"),',
)

# 5. selection util enhancements
sel = PKG / "src/cli/cmd/tui/util/selection.ts"
sel.write_text('''import * as Clipboard from "./clipboard"

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
''', encoding="utf-8")
print("ok selection.ts")

# 6. app.tsx - respect tui copy_on_select + improve mouse up
app = PKG / "src/cli/cmd/tui/app.tsx"
t = app.read_text(encoding="utf-8")
if "copyOnSelectEnabled" not in t:
    t = t.replace(
        "  const tuiConfig = useTuiConfig()",
        "  const tuiConfig = useTuiConfig()\n  const copyOnSelectEnabled = createMemo(\n    () => tuiConfig.copy_on_select ?? !Flag.LOCALCODER_EXPERIMENTAL_DISABLE_COPY_ON_SELECT,\n  )",
    )
    t = t.replace(
        "  renderer.on(CliRenderEvents.SELECTION, () => {\n    if (Flag.LOCALCODER_EXPERIMENTAL_DISABLE_COPY_ON_SELECT) return\n    Selection.copy(renderer, toast)\n  })",
        "  renderer.on(CliRenderEvents.SELECTION, () => {\n    if (!copyOnSelectEnabled()) return\n    Selection.copy(renderer, toast)\n  })",
    )
    t = t.replace(
        "      onMouseUp={() => Selection.copy(renderer, toast)}",
        "      onMouseUp={() => {\n        if (!copyOnSelectEnabled()) return\n        Selection.copyOnMouseUp(renderer, toast)\n      }}",
    )
    app.write_text(t, encoding="utf-8")
    print("ok app.tsx")

# 7. session scrollbox mouse copy
idx = PKG / "src/cli/cmd/tui/routes/session/index.tsx"
t = idx.read_text(encoding="utf-8")
if "onMouseUp" not in t.split("scrollbox")[1][:400]:
    t = t.replace(
        """            <scrollbox
              ref={(r) => (scroll = r)}
              viewportOptions={{
                paddingRight: showScrollbar() ? 1 : 0,
              }}""",
        """            <scrollbox
              ref={(r) => (scroll = r)}
              onMouseUp={() => Selection.copy(renderer, toast)}
              viewportOptions={{
                paddingRight: showScrollbar() ? 1 : 0,
              }}""",
    )
    if "import * as Selection" not in t:
        t = t.replace(
            'import * as Clipboard from "../../util/clipboard"',
            'import * as Clipboard from "../../util/clipboard"\nimport * as Selection from "../../util/selection"',
        )
    idx.write_text(t, encoding="utf-8")
    print("ok session index")

# 8. prompt improvements
prompt = PKG / "src/cli/cmd/tui/component/prompt/index.tsx"
pt = prompt.read_text(encoding="utf-8")

if "INPUT_HINT" not in pt:
    pt = pt.replace(
        '    return `Ask anything... "${list()[store.placeholder % list().length]}"`',
        '    const hint = "Shift+Enter newline · drag to select · right-click paste"\n    return `Ask anything... "${list()[store.placeholder % list().length]}" · ${hint}`',
    )
    pt = pt.replace(
        '      return `Run a command... "${example}"`',
        '      return `Run a command... "${example}" · Shift+Enter newline`',
    )

if "lastMouseDown" not in pt:
    pt = pt.replace(
        "  let lastMouseUp = { time: 0, offset: 0 }",
        "  let lastMouseUp = { time: 0, offset: 0 }\n  let lastMouseDown = { time: 0, offset: 0, count: 0 }",
    )

old_mousedown = """              onMouseDown={async (r: MouseEvent) => {
                if (r.button === MouseButton.RIGHT || r.button === MouseButton.MIDDLE) {
                  r.preventDefault()
                  if (await copyOrCutPromptSelection(r.modifiers.shift)) return

                  const content = await Clipboard.read()
                  if (content?.mime === "text/plain" && content.data) {
                    input.insertText(content.data)
                  }
                  return
                }
                r.target?.focus()
              }}"""

new_mousedown = """              onMouseDown={async (r: MouseEvent) => {
                if (r.button === MouseButton.RIGHT || r.button === MouseButton.MIDDLE) {
                  r.preventDefault()
                  if (await copyOrCutPromptSelection(r.modifiers.shift)) return

                  const content = await Clipboard.read()
                  if (content?.mime === "text/plain" && content.data) {
                    input.insertText(content.data)
                  }
                  return
                }
                const now = Date.now()
                const offset = input.cursorOffset
                if (now - lastMouseDown.time < 500 && Math.abs(offset - lastMouseDown.offset) <= 1) {
                  lastMouseDown.count += 1
                } else {
                  lastMouseDown = { time: now, offset, count: 1 }
                }
                r.target?.focus()
              }}"""

if old_mousedown in pt:
    pt = pt.replace(old_mousedown, new_mousedown)

old_mouseup = """              onMouseUp={async (r: MouseEvent) => {
                if (await copyOrCutPromptSelection(r.modifiers.shift)) return
                if (r.button !== MouseButton.LEFT) return

                setTimeout(() => {
                  if (!input || input.isDestroyed) return
                  const now = Date.now()
                  const offset = input.cursorOffset
                  const doubleClick = now - lastMouseUp.time < 500 && Math.abs(offset - lastMouseUp.offset) <= 1
                  lastMouseUp = { time: now, offset }
                  if (!doubleClick) return

                  const range = wordRangeAt(input.plainText, offset)
                  if (!range) return
                  input.setSelection(range.start, range.end)
                  void copyOrCutPromptSelection(r.modifiers.shift)
                }, 0)
              }}"""

new_mouseup = """              onMouseUp={async (r: MouseEvent) => {
                if (r.button === MouseButton.RIGHT || r.button === MouseButton.MIDDLE) {
                  if (await copyOrCutPromptSelection(r.modifiers.shift)) return
                  return
                }
                if (r.button !== MouseButton.LEFT) return

                setTimeout(() => {
                  if (!input || input.isDestroyed) return
                  const now = Date.now()
                  const offset = input.cursorOffset

                  if (lastMouseDown.count >= 3) {
                    const text = input.plainText
                    const lines = text.split("\\n")
                    let lineStart = 0
                    let lineIdx = 0
                    for (let i = 0; i < lines.length; i++) {
                      const lineEnd = lineStart + lines[i].length
                      if (offset >= lineStart && offset <= lineEnd) {
                        lineIdx = i
                        break
                      }
                      lineStart = lineEnd + 1
                    }
                    const start = lineStart
                    const end = lineStart + lines[lineIdx].length
                    input.setSelection(start, end)
                    void copyOrCutPromptSelection(false)
                    lastMouseDown.count = 0
                    return
                  }

                  if (input.hasSelection()) {
                    const selected = input.getSelectedText()
                    if (selected) {
                      void Clipboard.copy(selected).then(() =>
                        toast.show({ message: "Copied to clipboard", variant: "info" }),
                      )
                    }
                    lastMouseUp = { time: now, offset }
                    return
                  }

                  const doubleClick = now - lastMouseUp.time < 500 && Math.abs(offset - lastMouseUp.offset) <= 1
                  lastMouseUp = { time: now, offset }
                  if (!doubleClick) return

                  const range = wordRangeAt(input.plainText, offset)
                  if (!range) return
                  input.setSelection(range.start, range.end)
                  void copyOrCutPromptSelection(r.modifiers.shift)
                }, 0)
              }}"""

if old_mouseup in pt:
    pt = pt.replace(old_mouseup, new_mouseup)

# meta+click select word
if 'keybind.match("input_select_word"' not in pt:
    pt = pt.replace(
        '                if (keybind.match("input_newline", e)) {',
        '                if (e.meta && e.name === "click") {\n                  const range = wordRangeAt(input.plainText, input.cursorOffset)\n                  if (range) {\n                    e.preventDefault()\n                    input.setSelection(range.start, range.end)\n                    return\n                  }\n                }\n                if (keybind.match("input_newline", e)) {',
    )

prompt.write_text(pt, encoding="utf-8")
print("ok prompt")

# 9. tips
tips = PKG / "src/cli/cmd/tui/feature-plugins/home/tips-view.tsx"
tt = tips.read_text(encoding="utf-8")
if "Drag to select" not in tt:
    tt = tt.replace(
        '  "Press {highlight}Shift+Enter{/highlight} or {highlight}Ctrl+J{/highlight} to add newlines in your prompt",',
        '  "Press {highlight}Shift+Enter{/highlight} or {highlight}Ctrl+J{/highlight} to add newlines in your prompt",\n  "Drag with the mouse to select words or sentences in messages and the prompt — release to copy",\n  "Right-click selected text in the prompt to copy; {highlight}Shift+right-click{/highlight} cuts",\n  "Double-click a word in the prompt to select it; triple-click selects the whole line",',
    )
    tips.write_text(tt, encoding="utf-8")
    print("ok tips")

# 10. test update
test = PKG / "test/cli/cmd/tui/textarea-keybindings.test.ts"
ts = test.read_text(encoding="utf-8")
if "shift+enter" not in ts:
    ts = ts.replace(
        'input_newline: Keybind.parse("shift+return,ctrl+return,alt+return,ctrl+j"),',
        'input_newline: Keybind.parse("shift+return,shift+enter,ctrl+return,ctrl+enter,alt+return,ctrl+j"),',
    )
    test.write_text(ts, encoding="utf-8")
    print("ok test")

print("done")
