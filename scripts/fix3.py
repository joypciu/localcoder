from pathlib import Path
s = Path(r"P:/localcoder/packages/localcoder/src/cli/cmd/tui/routes/session/index.tsx")
t = s.read_text(encoding="utf-8")

# Remove wrongly placed block inside AssistantMessage
wrong = """
  const [followScroll, setFollowScroll] = createSignal(true)
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
"""
# only remove if it appears after duration createMemo (inside AssistantMessage)
idx = t.find("return props.message.time.completed - user.time.created")
if idx > 0:
    sub = t[idx:idx+1200]
    if wrong.strip() in sub.replace("\r\n","\n"):
        t = t[:idx] + sub.replace(wrong, "", 1) + t[idx+1200:]

# Fix assistant footer icon
t = t.replace(
    """                ▣{" "}
              </span>{" "}
              <span style={{ fg: theme.text }}>{props.message.agent === "plan" ? "Plan" : props.message.agent === "build" ? "Build" : Locale.titlecase(props.message.mode)}</span>""",
    """                ◉{" "}
              </span>{" "}
              <span style={{ fg: theme.text }}>{props.message.agent === "plan" ? "Plan" : props.message.agent === "build" ? "Build" : Locale.titlecase(props.message.mode)}</span>""",
)

# plan color on footer icon
t = t.replace(
    """                  fg:
                    props.message.error?.name === "MessageAbortedError"
                      ? theme.textMuted
                      : local.agent.color(props.message.agent),""",
    """                  fg:
                    props.message.error?.name === "MessageAbortedError"
                      ? theme.textMuted
                      : props.message.agent === "plan"
                        ? theme.accent
                        : local.agent.color(props.message.agent),""",
)

if "  onCleanup," not in t[:600]:
    t = t.replace("  onMount,\n  Show,", "  onCleanup,\n  onMount,\n  Show,")

s.write_text(t, encoding="utf-8")
print("fixed", t.count("followScroll"))
