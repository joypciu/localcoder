import type { Config } from "@/config/config"
import type { Provider } from "@/provider/provider"
import { ProviderTransform } from "@/provider/transform"
import type { MessageV2 } from "./message-v2"

const COMPACTION_BUFFER = 20_000

export function tokenCount(tokens: MessageV2.Assistant["tokens"]) {
  if (tokens.total) return tokens.total
  return tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write
}

function outputReserve(model: Provider.Model, maxOut: number) {
  const context = model.limit.context
  // Local llama.cpp models often run at 16K ctx with a large agent system prompt.
  // Reserve less output headroom so short chats are not treated as overflow immediately.
  if (model.providerID === "llamacpp" && context <= 32_768) {
    return Math.min(maxOut, Math.max(1024, Math.floor(context * 0.125)))
  }
  return maxOut
}

function compactionReserve(input: { cfg: Config.Info; model: Provider.Model; defaultReserved: number }) {
  const reserved = input.cfg.compaction?.reserved ?? input.defaultReserved
  const context = input.model.limit.context
  if (input.model.providerID === "llamacpp" && context <= 32_768) {
    return Math.min(reserved, Math.max(512, Math.floor(context * 0.08)))
  }
  return reserved
}

export function usable(input: { cfg: Config.Info; model: Provider.Model }) {
  const context = input.model.limit.context
  if (context === 0) return 0

  const maxOut = outputReserve(input.model, ProviderTransform.maxOutputTokens(input.model))
  const defaultReserved =
    context <= 32_768
      ? Math.min(4_096, Math.floor(context * 0.2))
      : Math.min(COMPACTION_BUFFER, maxOut)
  const reserved = compactionReserve({ cfg: input.cfg, model: input.model, defaultReserved })

  if (input.model.providerID === "llamacpp" && context <= 32_768) {
    // Small local models already run near ctx capacity because of the agent system prompt.
    // Only reserve output headroom; skip the extra compaction buffer used for cloud APIs.
    return Math.max(0, context - maxOut)
  }

  if (input.model.limit.input) {
    // Reserve output headroom the same way as context-only models — otherwise compaction
    // triggers too late and the next turn has no room for the model response (#10634).
    return Math.max(0, input.model.limit.input - maxOut - reserved)
  }
  return Math.max(0, context - maxOut - reserved)
}

export function isOverflow(input: { cfg: Config.Info; tokens: MessageV2.Assistant["tokens"]; model: Provider.Model }) {
  if (input.cfg.compaction?.auto === false) return false
  if (input.model.limit.context === 0) return false

  return tokenCount(input.tokens) >= usable(input)
}

export function isSmallLocalContext(model: Provider.Model) {
  return model.providerID === "llamacpp" && model.limit.context <= 32_768
}

/** True when the ctx meter is at 100% and auto-compaction should run. */
export function isAutoCompactDue(input: {
  cfg: Config.Info
  tokens: MessageV2.Assistant["tokens"]
  model: Provider.Model
}) {
  return isOverflow(input)
}
