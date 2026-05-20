from pathlib import Path
p = Path(r"P:/localcoder/packages/localcoder/src/cli/cmd/tui/component/prompt/index.tsx")
t = p.read_text(encoding="utf-8")
old = """    if (sessionID == null) {
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
      })"""
new = """    if (sessionID == null) {
      const fileParts = store.prompt.parts.filter((part) => part.type === "file")
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
        parts: fileParts,
        mode: store.mode,
      })"""
if old in t:
    p.write_text(t.replace(old, new), encoding="utf-8")
    print("fixed file parts order")
