from pathlib import Path
ROOT = Path("packages/localcoder")
PROMPT = ROOT / "src/cli/cmd/tui/component/prompt/index.tsx"
SESSION = ROOT / "src/cli/cmd/tui/routes/session/index.tsx"
HOME = ROOT / "src/cli/cmd/tui/routes/home.tsx"
OLD_CREATE = """    const variant = local.model.variant.current()
    let sessionID = props.sessionID
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
    }

    const messageID = MessageID.ascending()
    let inputText = store.prompt.input

    // Expand pasted text inline before submitting
    const allExtmarks = input.extmarks.getAllForTypeId(promptPartTypeId)
    const sortedExtmarks = allExtmarks.sort((a: { start: number }, b: { start: number }) => b.start - a.start)

    for (const extmark of sortedExtmarks) {
      const partIndex = store.extmarkToPartIndex.get(extmark.id)
      if (partIndex !== undefined) {
        const part = store.prompt.parts[partIndex]
        if (part?.type === "text" && part.text) {
          const before = inputText.slice(0, extmark.start)
          const after = inputText.slice(extmark.end)
          inputText = before + part.text + after
        }
      }
    }

    // Filter out text parts (pasted content) since they're now expanded inline
    const nonTextParts = store.prompt.parts.filter((part) => part.type !== "text")

    // Capture mode before it gets reset
    const currentMode = store.mode"""
NEW_CREATE = """    const variant = local.model.variant.current()

    let inputText = store.prompt.input
    const allExtmarks = input.extmarks.getAllForTypeId(promptPartTypeId)
    const sortedExtmarks = allExtmarks.sort((a: { start: number }, b: { start: number }) => b.start - a.start)

    for (const extmark of sortedExtmarks) {
      const partIndex = store.extmarkToPartIndex.get(extmark.id)
      if (partIndex !== undefined) {
        const part = store.prompt.parts[partIndex]
        if (part?.type === "text" && part.text) {
          const before = inputText.slice(0, extmark.start)
          const after = inputText.slice(extmark.end)
          inputText = before + part.text + after
        }
      }
    }

    const nonTextParts = store.prompt.parts.filter((part) => part.type !== "text")
    const currentMode = store.mode

    if (props.sessionID == null) {
      const workspace = workspaceSelection()
      const selectedWorkspaceID = iife(() => {
        if (props.workspaceID) return props.workspaceID
        if (!workspace) return undefined
        if (workspace.type === "none") return undefined
        if (workspace.type === "existing") return workspace.workspaceID
        return undefined
      })

      route.navigate({
        type: "new-session",
        message: inputText,
        agent: agent.name,
        model: {
          providerID: selectedModel.providerID,
          modelID: selectedModel.modelID,
        },
        variant,
        workspaceID: selectedWorkspaceID,
        parts: nonTextParts,
        mode: currentMode,
      })

      history.append({
        input: inputText,
        parts: nonTextParts,
        mode: currentMode,
      })
      input.extmarks.clear()
      setStore("prompt", { input: "", parts: [] })
      setStore("extmarkToPartIndex", new Map())
      props.onSubmit?.()
      input.clear()
      return true
    }

    const sessionID = props.sessionID
    const messageID = MessageID.ascending()"""
OLD_NAV = """    props.onSubmit?.()

    // temporary hack to make sure the message is sent
    if (!props.sessionID)
      setTimeout(() => {
        route.navigate({
          type: "session",
          sessionID,
        })
      }, 50)
    input.clear()"""
NEW_NAV = """    props.onSubmit?.()
    input.clear()"""
OLD_BIND = """    if (seeded || !route.prompt || !r) return
    seeded = true
    r.set(route.prompt)
  }"""
NEW_BIND = """    if (seeded || !route.prompt || !r) return
    seeded = true
    r.set(route.prompt)
    setTimeout(() => setTimeout(() => r.submit(), 0), 0)
  }"""
def patch(path, old, new, label):
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(label + ": not found")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")
    print("OK", label)
patch(PROMPT, OLD_CREATE, NEW_CREATE, "prompt")
patch(PROMPT, OLD_NAV, NEW_NAV, "nav")
patch(SESSION, OLD_BIND, NEW_BIND, "session")
home = HOME.read_text(encoding="utf-8")
if "InputShortcutsInline" not in home:
    home = home.replace('import { TuiPluginRuntime } from "@/cli/cmd/tui/plugin/runtime"', 'import { TuiPluginRuntime } from "@/cli/cmd/tui/plugin/runtime"\nimport { InputShortcutsInline } from "@tui/component/input-shortcuts"', 1)
    home = home.replace("""            />
          </TuiPluginRuntime.Slot>
        </box>
        <TuiPluginRuntime.Slot name="home_bottom" />""", """            />
          </TuiPluginRuntime.Slot>
          <InputShortcutsInline />
        </box>
        <TuiPluginRuntime.Slot name="home_bottom" />""", 1)
    HOME.write_text(home, encoding="utf-8")
    print("OK home")
else:
    print("skip home")
