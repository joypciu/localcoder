import type { AssistantMessage } from "@localcoder-ai/sdk/v2"
import { useSync } from "@tui/context/sync"
import { useLocal } from "@tui/context/local"
import { DialogAlert } from "@tui/ui/dialog-alert"
import { useDialog } from "@tui/ui/dialog"
import { computeContextUsage, tokensFromAssistant, isLocalProvider } from "@tui/util/context-usage"
import { usable } from "@/session/overflow"

export function buildSessionContextReport(sessionID: string, sync: ReturnType<typeof useSync>, local: ReturnType<typeof useLocal>) {
  const msg = sync.data.message[sessionID] ?? []
  const last = msg.findLast(
    (item): item is AssistantMessage => item.role === "assistant" && item.tokens.output > 0,
  )
  const current = local.model.current()
  const model = last
    ? sync.data.provider.find((item) => item.id === last.providerID)?.models[last.modelID]
    : current
      ? sync.data.provider.find((p) => p.id === current.providerID)?.models[current.modelID]
      : undefined

  const tokens = last ? tokensFromAssistant(last) : 0
  const ctx = computeContextUsage({ tokens, model, cfg: sync.data.config })
  const budget = model ? usable({ model, cfg: sync.data.config }) : 0
  const compacting = sync.session.status(sessionID) === "compacting"

  return [
    "Session context",
    "",
    last
      ? `Model: ${last.providerID}/${last.modelID}${isLocalProvider(last.providerID) ? " (local)" : ""}`
      : current
        ? `Model: ${current.providerID}/${current.modelID}`
        : "Model: (none selected)",
    model ? `Context window: ${model.limit.context.toLocaleString()} tokens` : "",
    model ? `Max output reserve: ${model.limit.output.toLocaleString()} tokens` : "",
    budget ? `Usable for chat: ~${budget.toLocaleString()} tokens` : "",
    "",
    ctx
      ? `Used: ${ctx.tokens.toLocaleString()} (${ctx.percent}%)\nRemaining: ~${ctx.remaining.toLocaleString()}\n${ctx.bar}`
      : tokens > 0
        ? `Tokens: ${tokens.toLocaleString()}`
        : "No usage yet — send a message first",
    "",
    compacting ? "Status: compacting…" : "",
    "Compression: auto-compact + auto-prune enabled",
    "Manual: /compact",
    ctx?.compactHint && !compacting ? "Tip: run /compact before long sessions." : "",
  ]
    .filter(Boolean)
    .join("\n")
}

export function useSessionContextDialog() {
  const dialog = useDialog()
  const sync = useSync()
  const local = useLocal()
  return (sessionID: string) => {
    void DialogAlert.show(dialog, "Context usage", buildSessionContextReport(sessionID, sync, local))
  }
}
