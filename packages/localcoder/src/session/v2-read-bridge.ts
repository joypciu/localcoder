/**
 * Bridge helpers for migrating v1 message reads to v2 SessionMessageTable projections.
 * Full MessageV2.WithParts mapping is deferred until agent loop v2 lands.
 */
import type { SessionMessage } from "@/v2/session-message"

export type V2ReadSummary = {
  id: string
  type: SessionMessage.Message["type"]
  text: string
  agent?: string
}

export function summarizeV2Message(message: SessionMessage.Message): V2ReadSummary {
  const textParts: string[] = []
  if ("text" in message && typeof message.text === "string") {
    textParts.push(message.text)
  }
  if ("content" in message && Array.isArray(message.content)) {
    for (const part of message.content) {
      if (part && typeof part === "object" && "type" in part && part.type === "text" && "text" in part) {
        textParts.push(String(part.text))
      }
    }
  }
  return {
    id: message.id,
    type: message.type,
    text: textParts.join("\n"),
    agent: "agent" in message ? message.agent : undefined,
  }
}

export function v2SummariesMatchV1Text(v2: V2ReadSummary[], v1TextByRole: { user: string[]; assistant: string[] }) {
  const users = v2.filter((m) => m.type === "user").map((m) => m.text)
  const assistants = v2.filter((m) => m.type === "assistant").map((m) => m.text)
  return (
    users.length === v1TextByRole.user.length &&
    assistants.length === v1TextByRole.assistant.length &&
    users.every((t, i) => t === v1TextByRole.user[i]) &&
    assistants.every((t, i) => t === v1TextByRole.assistant[i])
  )
}
