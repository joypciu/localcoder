from pathlib import Path

ROOT = Path(r"P:/localcoder/packages/localcoder/src")
TUI = ROOT / "cli/cmd/tui"

def patch(path, old, new):
    t = path.read_text(encoding="utf-8")
    if old not in t:
        print("SKIP", path.name)
        return
    path.write_text(t.replace(old, new, 1), encoding="utf-8")
    print("OK", path.name)

# theme nightcode
p = TUI / "context/theme.tsx"
t = p.read_text(encoding="utf-8")
if "nightcode" not in t:
    t = t.replace(
        'import localcoder from "./theme/localcoder.json" with { type: "json" }',
        'import localcoder from "./theme/localcoder.json" with { type: "json" }\nimport nightcode from "./theme/nightcode.json" with { type: "json" }',
    )
    t = t.replace("  localcoder,", "  localcoder,\n  nightcode,", 1)
    p.write_text(t, encoding="utf-8")
    print("theme")

# app.tsx
p = TUI / "app.tsx"
t = p.read_text(encoding="utf-8")
if "NewSession" not in t:
    t = t.replace('import { Home } from "@tui/routes/home"', 'import { Home } from "@tui/routes/home"\nimport { NewSession } from "@tui/routes/new-session"\nimport { TypeToFocus } from "@tui/component/type-to-focus"')
    t = t.replace(
        '<Match when={route.data.type === "session"}>\n            <Session />\n          </Match>',
        '<Match when={route.data.type === "new-session"}>\n            <NewSession />\n          </Match>\n          <Match when={route.data.type === "session"}>\n            <Session />\n          </Match>',
    )
    t = t.replace("<TuiPluginRuntime.Slot name=\"app\" />", "<TypeToFocus />\n      <TuiPluginRuntime.Slot name=\"app\" />")
    p.write_text(t, encoding="utf-8")
    print("app")

# prompt submit -> new-session
p = TUI / "component/prompt/index.tsx"
t = p.read_text(encoding="utf-8")
old = """    let sessionID = props.sessionID
    if (sessionID == null) {
      const workspace = workspaceSelection()
      const workspaceID = iife(() => {
        if (!workspace) return undefined
        if (workspace.type === "none") return undefined
        if (workspace.type === "existing") return workspace.workspaceID
        return undefined
      })

      const res = await sdk.client.session.create({
        workspace: props.workspaceID,
        agent: agent.name,
        model: {
          providerID: selectedModel.providerID,
          id: selectedModel.modelID,
          variant,
        },
      })

      if (res.error) {
        console.log("Creating a session failed:", res.error)

        toast.show({
          message: "Creating a session failed. Open console for more details.",
          variant: "error",
        })

        return true
      }

      sessionID = res.data.id
    }"""
new = """    let sessionID = props.sessionID
    if (sessionID == null) {
      history.append({
        ...store.prompt,
        mode: store.mode,
      })
      input.extmarks.clear()
      setStore("prompt", { input: "", parts: [] })
      setStore("extmarkToPartIndex", new Map())
      input.clear()
      route.navigate({
        type: "new-session",
        message: trimmed,
        agent: agent.name,
        model: {
          providerID: selectedModel.providerID,
          modelID: selectedModel.modelID,
        },
        variant,
        workspaceID: props.workspaceID,
        parts: store.prompt.parts.filter((x) => x.type === "file"),
        mode: store.mode,
      })
      props.onSubmit?.()
      return true
    }"""
if old in t:
    patch(p, old, new)
    # remove duplicate setTimeout navigate at end if sessionID was null path
    t = p.read_text(encoding="utf-8")
    t = t.replace(
        """    // temporary hack to make sure the message is sent
    if (!props.sessionID)
      setTimeout(() => {
        route.navigate({
          type: "session",
          sessionID,
        })
      }, 50)
    input.clear()""",
        "    input.clear()",
    )
    p.write_text(t, encoding="utf-8")
    print("prompt navigate")

# prompt.ts tool loop
p = ROOT / "session/prompt.ts"
t = p.read_text(encoding="utf-8")
if "shouldContinueToolLoop" not in t:
    t = t.replace(
        'import { SessionCompaction } from "./compaction"',
        'import { SessionCompaction } from "./compaction"\nimport { shouldContinueToolLoop } from "./tool-phase"',
    )
    old_loop = """          const hasToolCalls =
            lastAssistantMsg?.parts.some((part) => part.type === "tool" && !part.metadata?.providerExecuted) ?? false

          if (
            lastAssistant?.finish &&
            !["tool-calls"].includes(lastAssistant.finish) &&
            !hasToolCalls &&
            lastUser.id < lastAssistant.id
          ) {
            yield* slog.info("exiting loop")
            break
          }"""
    new_loop = """          if (
            !shouldContinueToolLoop({
              lastUser,
              lastAssistant,
              lastAssistantMsg: lastAssistantMsg,
            })
          ) {
            yield* slog.info("exiting loop")
            break
          }"""
    if old_loop in t:
        t = t.replace(old_loop, new_loop)
        p.write_text(t, encoding="utf-8")
        print("prompt loop")

# agent plan list permission
p = ROOT / "agent/agent.ts"
t = p.read_text(encoding="utf-8")
if '"list"' not in t.split("plan:")[1][:800] if "plan:" in t else t:
    t = t.replace(
        """                edit: {
                  "*": "deny",
                  [path.join(".localcoder", "plans", "*.md")]: "allow",""",
        """                list: "allow",
                edit: {
                  "*": "deny",
                  [path.join(".localcoder", "plans", "*.md")]: "allow",""",
    )
    p.write_text(t, encoding="utf-8")
    print("agent plan list")

# autocomplete keyboard layer
p = TUI / "component/prompt/autocomplete.tsx"
t = p.read_text(encoding="utf-8")
if "useKeyboardLayer" not in t:
    t = t.replace(
        'import { useCommandDialog } from "@tui/component/dialog-command"',
        'import { useCommandDialog } from "@tui/component/dialog-command"\nimport { useKeyboardLayer } from "@tui/context/keyboard-layer"',
    )
    t = t.replace(
        "  const command = useCommandDialog()",
        "  const command = useCommandDialog()\n  const layers = useKeyboardLayer()",
    )
    # show function
    t = t.replace(
        """  function show(mode: "@" | "/") {
    command.keybinds(false)
    setStore({
      visible: mode,
      index: props.input().cursorOffset,
    })
  }""",
        """  function show(mode: "@" | "/") {
    command.keybinds(false)
    layers.push(mode === "/" ? "command" : "mention", (e) => {
      if (e.name === "escape") {
        hide()
        return true
      }
      return false
    })
    setStore({
      visible: mode,
      index: props.input().cursorOffset,
    })
  }""",
    )
    t = t.replace(
        """  function hide() {
    const text = props.input().plainText
    if (store.visible === "/" && !text.endsWith(" ") && text.startsWith("/")) {
      const cursor = props.input().logicalCursor
      props.input().deleteRange(0, 0, cursor.row, cursor.col)
      // Sync the prompt store immediately since onContentChange is async
      props.setPrompt((draft) => {
        draft.input = props.input().plainText
      })
    }
    command.keybinds(true)
    setStore("visible", false)
  }""",
        """  function hide() {
    const text = props.input().plainText
    if (store.visible === "/" && !text.endsWith(" ") && text.startsWith("/")) {
      const cursor = props.input().logicalCursor
      props.input().deleteRange(0, 0, cursor.row, cursor.col)
      props.setPrompt((draft) => {
        draft.input = props.input().plainText
      })
    }
    layers.pop("command")
    layers.pop("mention")
    command.keybinds(true)
    setStore("visible", false)
  }""",
    )
    p.write_text(t, encoding="utf-8")
    print("autocomplete layers")

print("batch 3 done")
