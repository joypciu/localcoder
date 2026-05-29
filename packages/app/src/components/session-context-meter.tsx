import { Show, createMemo } from "solid-js"
import { Button } from "@localcoder-ai/ui/button"
import { useSync } from "@/context/sync"
import { useLanguage } from "@/context/language"
import { useProviders } from "@/hooks/use-providers"
import { useCommand } from "@/context/command"
import { getSessionContextMetrics } from "@/components/session/session-context-metrics"
import { useSessionLayout } from "@/pages/session/session-layout"

function fillClass(usage: number | null | undefined) {
  if (usage == null) return ""
  if (usage >= 90) return "bg-red-500"
  if (usage >= 75) return "bg-amber-500"
  return "bg-text-base"
}

export function SessionContextMeter() {
  const sync = useSync()
  const language = useLanguage()
  const providers = useProviders()
  const command = useCommand()
  const { params } = useSessionLayout()

  const messages = createMemo(() => (params.id ? (sync.data.message[params.id] ?? []) : []))
  const metrics = createMemo(() => getSessionContextMetrics(messages(), providers.all()))
  const context = createMemo(() => metrics().context)

  const usageText = createMemo(() => {
    const ctx = context()
    if (!ctx) return ""
    const parts: string[] = []
    if (ctx.input || ctx.output) {
      parts.push(`${ctx.input.toLocaleString(language.intl())} in · ${ctx.output.toLocaleString(language.intl())} out`)
    }
    if (ctx.limit) {
      const pct = ctx.usage ?? Math.min(100, Math.round((ctx.total / ctx.limit) * 100))
      parts.push(
        `${ctx.total.toLocaleString(language.intl())}/${ctx.limit.toLocaleString(language.intl())} ctx (${pct}%)`,
      )
    } else if (ctx.total) {
      parts.push(`${ctx.total.toLocaleString(language.intl())} ${language.t("context.usage.tokens").toLowerCase()}`)
    }
    return parts.join(" · ")
  })

  const barWidth = createMemo(() => {
    const ctx = context()
    if (!ctx?.limit) return 0
    return Math.min(100, ctx.usage ?? Math.round((ctx.total / ctx.limit) * 100))
  })

  const compactDisabled = createMemo(() => messages().filter((m) => m.role === "user").length === 0)

  return (
    <Show when={params.id && context()}>
      <div
        data-component="session-context-meter"
        class="mb-2 flex items-center gap-2 rounded-md border border-border-weak-base bg-background-base px-3 py-1.5 text-11-regular text-text-weak"
      >
        <span class="min-w-0 flex-1 truncate font-mono">{usageText()}</span>
        <Show when={barWidth() > 0}>
          <div
            class="h-1 w-[72px] shrink-0 overflow-hidden rounded-sm bg-background-stronger"
            title={language.t("context.usage.usage")}
          >
            <div class={`h-full transition-[width] duration-200 ${fillClass(barWidth())}`} style={{ width: `${barWidth()}%` }} />
          </div>
        </Show>
        <Button
          type="button"
          variant="ghost"
          size="small"
          class="h-6 shrink-0 px-2 text-11-regular"
          disabled={compactDisabled()}
          onClick={() => command.trigger("session.compact")}
          title={language.t("command.session.compact.description")}
        >
          {language.t("command.session.compact")}
        </Button>
      </div>
    </Show>
  )
}
