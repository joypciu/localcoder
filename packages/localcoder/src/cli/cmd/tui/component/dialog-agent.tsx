import { createMemo } from "solid-js"
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
