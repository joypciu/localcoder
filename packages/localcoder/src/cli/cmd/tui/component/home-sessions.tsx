import { createMemo, For, Show } from "solid-js"
import { useSync } from "@tui/context/sync"
import { useRoute } from "@tui/context/route"
import { useTheme } from "@tui/context/theme"
import { Locale } from "@/util/locale"
import { SplitBorder } from "@tui/component/border"

const MAX_VISIBLE = 8

export function HomeSessions() {
  const sync = useSync()
  const route = useRoute()
  const { theme } = useTheme()

  const sessions = createMemo(() => {
    return [...sync.data.session]
      .filter((s) => !s.parentID)
      .sort((a, b) => b.time.updated - a.time.updated)
      .slice(0, MAX_VISIBLE)
  })

  return (
    <Show when={sync.ready && sessions().length > 0}>
      <box width="100%" maxWidth={75} flexShrink={0} marginBottom={1}>
        <text fg={theme.textMuted} marginBottom={1}>
          Recent sessions
        </text>
        <For each={sessions()}>
          {(session) => (
            <box
              marginTop={1}
              border={["left"]}
              borderColor={theme.border}
              customBorderChars={SplitBorder.customBorderChars}
              onMouseUp={() => {
                route.navigate({
                  type: "session",
                  sessionID: session.id,
                  })
              }}
            >
              <box paddingLeft={2} paddingTop={1} paddingBottom={1} backgroundColor={theme.backgroundPanel}>
                <text fg={theme.text}>{Locale.truncate(session.title || "Untitled", 60)}</text>
                <text fg={theme.textMuted}>{Locale.todayTimeOrDateTime(session.time.updated)}</text>
              </box>
            </box>
          )}
        </For>
        <text fg={theme.textMuted} marginTop={1}>
          /sessions · Ctrl+P commands
        </text>
      </box>
    </Show>
  )
}

