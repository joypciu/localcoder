from pathlib import Path
s = Path(r"P:/localcoder/packages/localcoder/src/cli/cmd/tui/routes/session/index.tsx")
t = s.read_text(encoding="utf-8")

if "onCleanup," not in t[:700]:
    t = t.replace("  onMount,\n  Show,", "  onCleanup,\n  onMount,\n  Show,")

old_kb = "  const keybind = useKeybind()\n  const dialog = useDialog()"
new_kb = """  const [followScroll, setFollowScroll] = createSignal(true)
  const sessionBusy = createMemo(() => {
    const st = sync.data.session_status?.[route.sessionID]
    return st != null && st.type !== "idle"
  })

  onCleanup(() => {
    if (sessionBusy()) {
      void sdk.client.session.abort({ sessionID: route.sessionID }).catch(() => {})
    }
  })

  const keybind = useKeybind()
  const dialog = useDialog()"""
if "followScroll" not in t and old_kb in t:
    t = t.replace(old_kb, new_kb, 1)

if "function pauseScroll()" not in t:
    t = t.replace(
        "  function toBottom() {\n    setTimeout(() => {\n      if (!scroll || scroll.isDestroyed) return\n      scroll.scrollTo(scroll.scrollHeight)\n    }, 50)\n  }",
        "  function pauseScroll() {\n    setFollowScroll(false)\n  }\n\n  function toBottom() {\n    setFollowScroll(true)\n    setTimeout(() => {\n      if (!scroll || scroll.isDestroyed) return\n      scroll.scrollTo(scroll.scrollHeight)\n    }, 50)\n  }",
        1,
    )

t = t.replace("stickyScroll={true}", "stickyScroll={followScroll()}", 1)

for pat in [
    "scroll.scrollBy(-scroll.height / 2)",
    "scroll.scrollBy(scroll.height / 2)",
    "scroll.scrollBy(-1)",
    "scroll.scrollBy(1)",
    "scroll.scrollBy(-scroll.height / 4)",
    "scroll.scrollTo(0)",
]:
    old = f"        {pat}\n        dialog.clear()"
    new = f"        pauseScroll()\n        {pat}\n        dialog.clear()"
    if old in t:
        t = t.replace(old, new, 1)

if 'props.part.tool === "list"' not in t:
    t = t.replace(
        '<Match when={props.part.tool === "glob"}>\n          <Glob {...toolprops} />\n        </Match>',
        '<Match when={props.part.tool === "glob"}>\n          <Glob {...toolprops} />\n        </Match>\n        <Match when={props.part.tool === "list"}>\n          <ListDir {...toolprops} />\n        </Match>',
        1,
    )

if "function ListDir(" not in t:
    t = t.replace(
        "function Glob(props: ToolProps<typeof GlobTool>) {",
        """function ListDir(props: ToolProps<{ path?: string }>) {
  const { theme } = useTheme()
  const label = () => String((props.input as { path?: string })?.path ?? ".")
  return (
    <InlineTool icon="▤" pending="Listing directory..." complete={label()} part={props.part}>
      <Show when={props.output}>
        <box paddingLeft={2}>
          <text fg={theme.textMuted}>{props.output}</text>
        </box>
      </Show>
    </InlineTool>
  )
}

function Glob(props: ToolProps<typeof GlobTool>) {""",
        1,
    )

# NightCode footer on assistant messages
old_footer = '<span style={{ fg: theme.text }}>{Locale.titlecase(props.message.mode)}</span>'
new_footer = '<span style={{ fg: theme.text }}>{props.message.agent === "plan" ? "Plan" : props.message.agent === "build" ? "Build" : Locale.titlecase(props.message.mode)}</span>'
if old_footer in t and "Plan" not in t.split(old_footer)[1][:50]:
    t = t.replace(old_footer, new_footer, 1)

old_icon = """                  fg:
                    props.message.error?.name === "MessageAbortedError"
                      ? theme.textMuted
                      : local.agent.color(props.message.agent),"""
new_icon = """                  fg:
                    props.message.error?.name === "MessageAbortedError"
                      ? theme.textMuted
                      : props.message.agent === "plan"
                        ? theme.accent
                        : local.agent.color(props.message.agent),"""
if "plan" not in old_icon and old_icon in t:
    t = t.replace(old_icon, new_icon, 1)

s.write_text(t, encoding="utf-8")
print("ok lines", len(t.splitlines()), "follow", t.count("followScroll"))
