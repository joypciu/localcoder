import { TextAttributes } from "@opentui/core"
import { createMemo, Show } from "solid-js"
import { useLocal } from "@tui/context/local"
import { useTheme } from "@tui/context/theme"
import { Locale } from "@/util/locale"

export function StatusBar(props: { mode?: "normal" | "shell" }) {
  const local = useLocal()
  const { theme } = useTheme()
  const agent = createMemo(() => local.agent.current())

  const agentColor = createMemo(() => {
    if (props.mode === "shell") return theme.primary
    const a = agent()
    if (!a) return theme.textMuted
    if (a.name === "plan") return theme.accent
    return local.agent.color(a.name)
  })

  const agentLabel = createMemo(() => {
    if (props.mode === "shell") return "Shell"
    const a = agent()
    if (!a) return "Agent"
    return a.name === "plan" ? "Plan" : a.name === "build" ? "Build" : Locale.titlecase(a.name)
  })

  return (
    <box flexDirection="row" gap={1} flexShrink={0}>
      <text fg={agentColor()} attributes={props.mode === "shell" ? TextAttributes.BOLD : undefined}>
        {agentLabel()}
      </text>
      <Show when={props.mode !== "shell" && agent()}>
        <text attributes={TextAttributes.DIM} fg={theme.textMuted}>
          ›
        </text>
        <text fg={theme.text}>{local.model.parsed().model}</text>
        <text fg={theme.textMuted}>{local.model.parsed().provider}</text>
      </Show>
    </box>
  )
}
