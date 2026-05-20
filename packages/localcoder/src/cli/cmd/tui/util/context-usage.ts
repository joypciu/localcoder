import type { AssistantMessage } from "@localcoder-ai/sdk/v2"
import type { Config } from "@/config/config"
import type { Provider } from "@/provider/provider"
import { usable } from "@/session/overflow"
import { Locale } from "@/util/locale"

export type ContextLevel = "ok" | "warn" | "high" | "critical" | "overflow"

export type ContextUsage = {
  tokens: number
  contextLimit: number
  usable: number
  remaining: number
  percent: number
  level: ContextLevel
  compactHint: boolean
  bar: string
  short: string
  detail: string
}

export function tokensFromAssistant(msg: AssistantMessage) {
  return (
    msg.tokens.input +
    msg.tokens.output +
    msg.tokens.reasoning +
    msg.tokens.cache.read +
    msg.tokens.cache.write
  )
}

export function computeContextUsage(input: {
  tokens: number
  model?: Provider.Model
  cfg: Config.Info
}): ContextUsage | undefined {
  const contextLimit = input.model?.limit.context ?? 0
  if (contextLimit <= 0 || input.tokens <= 0) return undefined

  const usableLimit =
    input.model !== undefined ? usable({ model: input.model, cfg: input.cfg }) : contextLimit
  const budget = usableLimit > 0 ? usableLimit : contextLimit
  const percent = Math.min(100, Math.round((input.tokens / budget) * 100))
  const remaining = Math.max(0, budget - input.tokens)

  const level: ContextLevel =
    input.tokens >= budget
      ? "overflow"
      : percent >= 95
        ? "critical"
        : percent >= 85
          ? "high"
          : percent >= 70
            ? "warn"
            : "ok"

  const filled = Math.min(10, Math.max(0, Math.round(percent / 10)))
  const bar = `${"\u2588".repeat(filled)}${"\u2591".repeat(10 - filled)}`

  const short = `${Locale.number(input.tokens)}/${Locale.number(budget)} (${percent}%)`
  const detail = `ctx ${bar} ${short} \u00b7 ${Locale.number(remaining)} left`
  const compactHint = percent >= 70

  return {
    tokens: input.tokens,
    contextLimit,
    usable: budget,
    remaining,
    percent,
    level,
    compactHint,
    bar,
    short,
    detail,
  }
}

export function isLocalProvider(providerID: string) {
  return providerID === "llamacpp"
}

export function formatSessionCost(cost: number, providerID?: string) {
  if (cost <= 0) return undefined
  if (providerID && isLocalProvider(providerID)) return undefined
  return cost
}

export function homeModelHint(input: {
  model?: { providerID: string; modelID: string }
  providers: Array<{ id: string; models: Record<string, unknown> }>
}) {
  if (input.model) {
    return `${input.model.providerID}/${input.model.modelID}`
  }
  const llama = input.providers.find((p) => p.id === "llamacpp")
  if (llama && Object.keys(llama.models).length > 0) {
    return "llamacpp ready — /llama to manage"
  }
  return "No model — /connect or /llama"
}

export function contextLevelColor(
  level: ContextLevel,
  theme: { textMuted: string; warning?: string; error?: string; secondary?: string },
) {
  switch (level) {
    case "overflow":
    case "critical":
      return theme.error ?? theme.warning ?? theme.textMuted
    case "high":
      return theme.warning ?? theme.secondary ?? theme.textMuted
    case "warn":
      return theme.secondary ?? theme.textMuted
    default:
      return theme.textMuted
  }
}
