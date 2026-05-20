from pathlib import Path
s = Path(r"P:/localcoder/packages/localcoder/src/cli/cmd/tui/routes/session/index.tsx")
t = s.read_text(encoding="utf-8")

# fix empty onCleanup
t = t.replace(
    """  onCleanup(() => {
  })""",
    """  onCleanup(() => {
    if (sessionBusy()) {
      void sdk.client.session.abort({ sessionID: route.sessionID }).catch(() => {})
    }
  })""",
)

# remove duplicate followScroll block (second occurrence)
dup = """  const [followScroll, setFollowScroll] = createSignal(true)
  const sessionBusy = createMemo(() => {
    const st = sync.data.session_status?.[route.sessionID]
    return st != null && st.type !== "idle"
  })

  onCleanup(() => {
    if (sessionBusy()) {
      void sdk.client.session.abort({ sessionID: route.sessionID }).catch(() => {})
    }
  })

"""
count = t.count(dup)
if count > 1:
    t = t.replace(dup, "", count - 1)

if "onCleanup," not in t.split("solid-js")[0]:
    pass
if "  onCleanup," not in t[:800]:
    t = t.replace("  onMount,\n  Show,", "  onCleanup,\n  onMount,\n  Show,")

# pauseScroll if missing
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

s.write_text(t, encoding="utf-8")
print("ok", "pauseScroll" in t, t.count("followScroll"))
