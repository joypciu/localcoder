import type { AssistantMessage } from "@localcoder-ai/sdk/v2"
import type { localcoderClient } from "@localcoder-ai/sdk/v2"
import * as Bootstrap from "@/llamacpp/bootstrap"
import * as Setup from "@/llamacpp/setup"
import { tokenCount } from "@/session/overflow"
import { parseModelRef } from "./provider-pick"

export type SessionMeter = {
  tokens: number
  contextLimit?: number
  short: string
  overflow?: boolean
}

/** Match TUI: context meter uses the latest assistant message token count, not session history sum. */
export function tokensFromLastAssistant(messages: { info: { role: string }; parts: unknown[] }[]) {
  let last: AssistantMessage | undefined
  for (const row of messages) {
    if (row.info.role === "assistant") {
      last = row.info as AssistantMessage
    }
  }
  return last?.tokens ? tokenCount(last.tokens) : 0
}

async function resolveContextLimit(
  sdk: localcoderClient,
  providerID: string,
  modelID: string,
): Promise<number | undefined> {
  if (providerID === "llamacpp") {
    const saved = Setup.loadUserLlamaConfig().ctx
    if (saved && saved > 0) return saved
    try {
      const status = await Bootstrap.getPublicStatus()
      if (status.configuredCtx > 0) return status.configuredCtx
    } catch {
      // fall through
    }
  }

  const list = await sdk.provider.list()
  const provider = list.data?.all.find((p) => p.id === providerID)
  const model = provider?.models[modelID] as { limit?: { context?: number } } | undefined
  const fromCatalog = model?.limit?.context
  if (fromCatalog && fromCatalog > 0) return fromCatalog

  return undefined
}

export async function fetchSessionMeter(
  sdk: localcoderClient,
  input: { sessionID?: string; directory: string; model?: string },
): Promise<SessionMeter | undefined> {
  if (!input.sessionID) return undefined

  const messages = await sdk.session.messages({
    sessionID: input.sessionID,
    directory: input.directory,
  })

  const rows = messages.data ?? []
  const tokens = tokensFromLastAssistant(rows)
  if (tokens <= 0) return undefined

  const ref = input.model ? parseModelRef(input.model) : undefined
  const contextLimit =
    ref ? await resolveContextLimit(sdk, ref.providerID, ref.modelID) : undefined

  if (contextLimit && contextLimit > 0) {
    const overflow = tokens > contextLimit
    const pct = Math.round((tokens / contextLimit) * 100)
    const short = overflow
      ? `${tokens.toLocaleString()}/${contextLimit.toLocaleString()} tok (overflow — /compact)`
      : pct >= 85
        ? `${tokens.toLocaleString()}/${contextLimit.toLocaleString()} tok (${pct}% — /compact soon)`
        : `${tokens.toLocaleString()}/${contextLimit.toLocaleString()} tok (${pct}%)`
    return { tokens, contextLimit, short, overflow }
  }

  return { tokens, short: `~${tokens.toLocaleString()} tok (last turn)` }
}

export async function applySessionMeterToContext(
  sdk: localcoderClient,
  ctx: { sessionID?: string; directory: string; model?: string; meterShort?: string },
) {
  const meter = await fetchSessionMeter(sdk, {
    sessionID: ctx.sessionID,
    directory: ctx.directory,
    model: ctx.model,
  })
  ctx.meterShort = meter?.short
  return meter
}
