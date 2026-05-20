import type { AssistantMessage } from "@localcoder-ai/sdk/v2"
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@localcoder-ai/plugin/tui"
import { createMemo, Show } from "solid-js"
import { computeContextUsage, contextLevelColor, tokensFromAssistant, formatSessionCost, isLocalProvider } from "@tui/util/context-usage"

const id = "internal:sidebar-context"

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

function View(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const msg = createMemo(() => props.api.state.session.messages(props.session_id))
  const cost = createMemo(() => {
    const total = msg().reduce((sum, item) => sum + (item.role === "assistant" ? item.cost : 0), 0)
    const pid = msg().findLast((m) => m.role === "assistant")?.providerID
    return formatSessionCost(total, pid) ?? (pid && isLocalProvider(pid) ? undefined : total)
  })

  const state = createMemo(() => {
    const last = msg().findLast((item): item is AssistantMessage => item.role === "assistant" && item.tokens.output > 0)
    if (!last) {
      return { tokens: 0, ctx: undefined as ReturnType<typeof computeContextUsage> }
    }

    const tokens = tokensFromAssistant(last)
    const model = props.api.state.provider.find((item) => item.id === last.providerID)?.models[last.modelID]
    const ctx = computeContextUsage({ tokens, model, cfg: props.api.state.config })
    return { tokens, ctx }
  })

  return (
    <box>
      <text fg={theme().text}>
        <b>Context</b>
      </text>
      <text fg={theme().textMuted}>
        {state().ctx ? state().ctx.detail : `${state().tokens.toLocaleString()} tokens`}
      </text>
      <text fg={state().ctx ? contextLevelColor(state().ctx.level, theme()) : theme().textMuted}>
        {state().ctx ? `${state().ctx.percent}% of usable context` : "—"}
      </text>
      <text fg={theme().textMuted}>
        {state().ctx?.compactHint ? "Auto-compact on overflow · /compact now" : "Auto-compact enabled"}
      </text>
      <Show when={cost() !== undefined} fallback={<text fg={theme().textMuted}>Local model — no API cost</text>}>
        <text fg={theme().textMuted}>{money.format(cost()!)} spent</text>
      </Show>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 100,
    slots: {
      sidebar_content(_ctx, props) {
        return <View api={api} session_id={props.session_id} />
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id,
  tui,
}

export default plugin
