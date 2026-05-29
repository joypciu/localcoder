import { Show, createMemo } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { Button } from "@localcoder-ai/ui/button"
import { useSync } from "@/context/sync"
import { useLanguage } from "@/context/language"
import { useSessionLayout } from "@/pages/session/session-layout"
import { SessionContextUsage } from "@/components/session-context-usage"

function subagentLabel(title: string | undefined, fallback: string) {
  const match = title?.match(/@(\w+) subagent/)
  if (!match) return fallback
  return match[1].charAt(0).toUpperCase() + match[1].slice(1)
}

export function SessionSubagentBar() {
  const sync = useSync()
  const language = useLanguage()
  const navigate = useNavigate()
  const { params } = useSessionLayout()

  const info = createMemo(() => (params.id ? sync.session.get(params.id) : undefined))
  const parentID = createMemo(() => info()?.parentID)

  const siblings = createMemo(() => {
    const pid = parentID()
    if (!pid || !params.id) return []
    return (sync.data.session ?? [])
      .filter((s) => s.parentID === pid)
      .toSorted((a, b) => a.time.created - b.time.created)
  })

  const index = createMemo(() => siblings().findIndex((s) => s.id === params.id) + 1)
  const label = createMemo(() => subagentLabel(info()?.title, language.t("session.subagent.label")))

  const goParent = () => {
    const pid = parentID()
    if (pid) navigate(`/${params.dir}/session/${pid}`)
  }

  const goSibling = (delta: number) => {
    const list = siblings()
    const i = list.findIndex((s) => s.id === params.id)
    if (i < 0) return
    const next = list[i + delta]
    if (next) navigate(`/${params.dir}/session/${next.id}`)
  }

  return (
    <Show when={parentID()}>
      <div
        data-component="session-subagent-bar"
        class="mb-2 flex items-center justify-between gap-2 rounded-md border border-border-weak-base bg-background-base px-3 py-1.5 text-11-regular"
      >
        <div class="flex min-w-0 items-center gap-2">
          <span class="font-medium capitalize text-text-base">{label()}</span>
          <Show when={siblings().length > 1}>
            <span class="text-text-weak">
              ({index()} / {siblings().length})
            </span>
          </Show>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <SessionContextUsage variant="indicator" placement="bottom" />
          <Button type="button" size="small" variant="ghost" onClick={goParent}>
            {language.t("session.subagent.parent")}
          </Button>
          <Button type="button" size="small" variant="ghost" disabled={index() <= 1} onClick={() => goSibling(-1)}>
            {language.t("session.subagent.prev")}
          </Button>
          <Button
            type="button"
            size="small"
            variant="ghost"
            disabled={index() >= siblings().length}
            onClick={() => goSibling(1)}
          >
            {language.t("session.subagent.next")}
          </Button>
        </div>
      </div>
    </Show>
  )
}
