from pathlib import Path
s = Path(r"P:/localcoder/packages/localcoder/src/cli/cmd/tui/routes/session/index.tsx")
t = s.read_text(encoding="utf-8")
block = """
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

"""
first = t.find(block)
second = t.find(block, first + 1) if first >= 0 else -1
if second >= 0:
    t = t[:second] + t[second + len(block):]
    s.write_text(t, encoding="utf-8")
    print("removed dup")
print("followScroll count", t.count("followScroll"))
