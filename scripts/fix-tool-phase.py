from pathlib import Path
p = Path(r"P:/localcoder/packages/localcoder/src/session/tool-phase.ts")
p.write_text("""import type { MessageV2 } from "./message-v2"

export function hasPendingClientTools(msg: MessageV2.WithParts | undefined): boolean {
  if (!msg) return false
  return msg.parts.some(
    (part) =>
      part.type === "tool" &&
      !part.metadata?.providerExecuted &&
      (part.state.status === "pending" || part.state.status === "running"),
  )
}

function hasUnresolvedToolParts(msg: MessageV2.WithParts | undefined): boolean {
  if (!msg) return false
  return msg.parts.some((part) => part.type === "tool" && !part.metadata?.providerExecuted)
}

/** Returns true when the agent loop should run another step (mirror AI SDK auto-continue on tool calls). */
export function shouldContinueToolLoop(input: {
  lastUser: MessageV2.User
  lastAssistant: MessageV2.Assistant | undefined
  lastAssistantMsg: MessageV2.WithParts | undefined
}): boolean {
  const { lastUser, lastAssistant, lastAssistantMsg } = input
  if (!lastAssistant) return true
  if (hasPendingClientTools(lastAssistantMsg)) return true
  if (hasUnresolvedToolParts(lastAssistantMsg)) return true
  if (!lastAssistant.finish) return true
  if (lastAssistant.finish === "tool-calls") return true
  if (lastAssistant.finish === "unknown") return true
  if (lastUser.id >= lastAssistant.id) return true
  return false
}
""", encoding="utf-8")
print("fixed tool-phase")
