from pathlib import Path
R = Path(r"P:/localcoder/packages/localcoder/src")

# footer
f = R / "cli/cmd/tui/routes/session/footer.tsx"
t = f.read_text(encoding="utf-8")
if "sessionBusy" not in t:
    t = t.replace(
        "  const connected = useConnected()",
        """  const sessionBusy = createMemo(() => {
    if (route.data.type !== "session") return false
    const st = sync.data.session_status?.[route.data.sessionID]
    return st != null && st.type !== "idle"
  })
  const connected = useConnected()""",
    )
    t = t.replace(
        """        <Show when={route.data.type === "session"}>
          <StatusBar />
        </Show>""",
        """        <Show when={route.data.type === "session"}>
          <StatusBar />
        </Show>
        <Show when={sessionBusy()}>
          <text fg={theme.warning}>esc interrupt</text>
        </Show>""",
    )
    f.write_text(t, encoding="utf-8")
    print("footer")

# dialog-agent
(R / "cli/cmd/tui/component/dialog-agent.tsx").write_text("""import { createMemo } from "solid-js"
import { useLocal } from "@tui/context/local"
import { DialogSelect } from "@tui/ui/dialog-select"
import { useDialog } from "@tui/ui/dialog"

const MODES = ["build", "plan"] as const

export function DialogAgent() {
  const local = useLocal()
  const dialog = useDialog()

  const options = createMemo(() => {
    const all = local.agent.list()
    const modes = MODES.filter((n) => all.some((a) => a.name === n)).map((name) => {
      const item = all.find((a) => a.name === name)!
      return {
        value: name,
        title: name === "plan" ? "Plan" : "Build",
        description:
          name === "plan"
            ? "Read-only — explore and draft a plan"
            : "Full access — implement changes",
        category: "Mode",
      }
    })
    const rest = all
      .filter((a) => !MODES.includes(a.name as (typeof MODES)[number]))
      .map((item) => ({
        value: item.name,
        title: item.name,
        description: item.native ? "native" : item.description,
        category: "Agent",
      }))
    return [...modes, ...rest]
  })

  return (
    <DialogSelect
      title="Select agent"
      current={local.agent.current()?.name}
      options={options()}
      onSelect={(option) => {
        local.agent.set(option.value)
        dialog.clear()
      }}
    />
  )
}
""", encoding="utf-8")
print("dialog-agent")

# autocomplete priority
ac = R / "cli/cmd/tui/component/prompt/autocomplete.tsx"
at = ac.read_text(encoding="utf-8")
if "priority.findIndex" not in at:
    at = at.replace(
        "    results.sort((a, b) => a.display.localeCompare(b.display))",
        """    const priority = ["agents", "models", "sessions", "theme", "new", "connect", "status"]
    results.sort((a, b) => {
      const ap = priority.findIndex((p) => a.display.includes("/" + p))
      const bp = priority.findIndex((p) => b.display.includes("/" + p))
      const ai = ap === -1 ? 999 : ap
      const bi = bp === -1 ? 999 : bp
      if (ai !== bi) return ai - bi
      return a.display.localeCompare(b.display)
    })""",
    )
    ac.write_text(at, encoding="utf-8")
    print("autocomplete")

# app keyboard layer
app = R / "cli/cmd/tui/app.tsx"
apt = app.read_text(encoding="utf-8")
if "KeyboardLayerProvider" not in apt:
    apt = apt.replace(
        'import { KeybindProvider, useKeybind } from "@tui/context/keybind"',
        'import { KeybindProvider, useKeybind } from "@tui/context/keybind"\nimport { KeyboardLayerProvider } from "@tui/context/keyboard-layer"',
    )
    apt = apt.replace("<KeybindProvider>", "<KeyboardLayerProvider>\n        <KeybindProvider>", 1)
    apt = apt.replace("</KeybindProvider>", "</KeybindProvider>\n      </KeyboardLayerProvider>", 1)
    app.write_text(apt, encoding="utf-8")
    print("app")

print("p5 done")
