import type { Config } from "@/config/config"
import type { Provider } from "@/provider/provider"
import { ProviderTransform } from "@/provider/transform"
import type { MessageV2 } from "./message-v2"

const COMPACTION_BUFFER = 20_000

export function usable(input: { cfg: Config.Info; model: Provider.Model }) {
  const context = input.model.limit.context
  if (context === 0) return 0

  const maxOut = ProviderTransform.maxOutputTokens(input.model)
  const defaultReserved =
    context <= 32_768
      ? Math.min(4_096, Math.floor(context * 0.2))
      : Math.min(COMPACTION_BUFFER, maxOut)
  const reserved = input.cfg.compaction?.reserved ?? defaultReserved

  if (input.model.limit.input) {
    return Math.max(0, input.model.limit.input - reserved)
  }
  return Math.max(0, context - maxOut - reserved)
}

export function isOverflow(input: { cfg: Config.Info; tokens: MessageV2.Assistant["tokens"]; model: Provider.Model }) {
  if (input.cfg.compaction?.auto === false) return false
  if (input.model.limit.context === 0) return false

  const count =
    input.tokens.total || input.tokens.input + input.tokens.output + input.tokens.cache.read + input.tokens.cache.write
  return count >= usable(input)
}
