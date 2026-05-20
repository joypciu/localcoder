from pathlib import Path
R = Path(r"P:/localcoder/packages/localcoder/src")

s = R / "cli/cmd/tui/routes/session/index.tsx"
t = s.read_text(encoding="utf-8")

if "followScroll" not in t:
    t = t.replace(
        "  const keybind = useKeybind()",
        """  const [followScroll, setFollowScroll] = createSignal(true)
  const sessionBusy = createMemo(() => {
    const st = sync.data.session_status?.[route.sessionID]
    return st != null and st.type != "idle"
  })

  onCleanup(() => {
    if (sessionBusy()):
      sdk.client.session.abort({ sessionID: route.sessionID })
  })

  const keybind = useKeybind()""".replace("and", "&&").replace(":", " ? ").replace("if (sessionBusy())", "if (sessionBusy())"),
    )
    # fix python booleans in TS - rewrite properly
    insert = """  const [followScroll, setFollowScroll] = createSignal(true)
  const sessionBusy = createMemo(() => {
    const st = sync.data.session_status?.[route.sessionID]
    return st != null && st.type !== "idle"
  })

  onCleanup(() => {
    if (sessionBusy()) {
      void sdk.client.session.abort({ sessionID: route.sessionID }).catch(() => {})
    }
  })

  const keybind = useKeybind()"""
    t = t.replace("  const keybind = useKeybind()", insert, 1)
    print("session state")

if "function pauseScroll()" not in t:
    t = t.replace(
        """  function toBottom() {
    setTimeout(() => {
      if (!scroll || scroll.isDestroyed) return
      scroll.scrollTo(scroll.scrollHeight)
    }, 50)
  }""",
        """  function pauseScroll() {
    setFollowScroll(false)
  }

  function toBottom() {
    setFollowScroll(true)
    setTimeout(() => {
      if (!scroll || scroll.isDestroyed) return
      scroll.scrollTo(scroll.scrollHeight)
    }, 50)
  }""",
    )
    print("pauseScroll")

t = t.replace("stickyScroll={true}", "stickyScroll={followScroll()}", 1)

scroll_cmds = [
    "scroll.scrollBy(-scroll.height / 2)",
    "scroll.scrollBy(scroll.height / 2)",
    "scroll.scrollBy(-1)",
    "scroll.scrollBy(1)",
    "scroll.scrollBy(-scroll.height / 4)",
    "scroll.scrollTo(0)",
]
for pat in scroll_cmds:
    old = f"        {pat}\n        dialog.clear()"
    new = f"        pauseScroll()\n        {pat}\n        dialog.clear()"
    if old in t:
        t = t.replace(old, new, 1)

if 'props.part.tool === "list"' not in t:
    t = t.replace(
        '<Match when={props.part.tool === "glob"}>\n          <Glob {...toolprops} />\n        </Match>',
        '<Match when={props.part.tool === "glob"}>\n          <Glob {...toolprops} />\n        </Match>\n        <Match when={props.part.tool === "list"}>\n          <ListDir {...toolprops} />\n        </Match>',
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
    )
    print("list UI")

if '◉ ' not in t or 'plan" ? theme.accent' not in t:
    t = t.replace(
        '<span style={{ fg: theme.text }}>▣{" "}</span>{" "}',
        '<span style={{ fg: props.message.agent === "plan" ? theme.accent : local.agent.color(props.message.agent) }}>◉ </span>',
        1,
    )

s.write_text(t, encoding="utf-8")
print("session done")
