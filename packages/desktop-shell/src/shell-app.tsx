import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import type { Part, PermissionRequest, Session } from "@localcoder-ai/sdk/v2"
import { PermissionBanner } from "./components/permission-banner"
import { MessageBody } from "./components/message-body"
import { createShellSdk, type ShellServer } from "./lib/sdk"
import { toolDisplay } from "./lib/tool-display"

export type ShellAppProps = {
  server: ShellServer
  initialSessionID?: string
}

type ChatLine =
  | { kind: "text"; role: "user" | "assistant"; text: string; id: string }
  | { kind: "tool"; id: string; icon: string; title: string; detail?: string; diff?: string }

function partsToLines(parts: Part[], role: "user" | "assistant"): ChatLine[] {
  const out: ChatLine[] = []
  for (const part of parts) {
    if (part.type === "text" && part.text.trim()) {
      out.push({ kind: "text", role, text: part.text, id: part.id })
    }
    if (part.type === "tool" && part.state.status !== "pending") {
      const d = toolDisplay(part)
      out.push({
        kind: "tool",
        id: part.id,
        icon: d.icon,
        title: d.title,
        detail: d.detail,
        diff: d.diff,
      })
    }
  }
  return out
}

export function ShellApp(props: ShellAppProps) {
  const directory = () => props.server.directory
  const sdk = createMemo(() => createShellSdk(props.server))
  const [sessions, setSessions] = createSignal<Session[]>([])
  const [sessionID, setSessionID] = createSignal<string | undefined>(props.initialSessionID)
  const [lines, setLines] = createSignal<ChatLine[]>([])
  const [draft, setDraft] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string | undefined>()
  const [models, setModels] = createSignal<string[]>([])
  const [model, setModel] = createSignal<string | undefined>()
  const [agent, setAgent] = createSignal<string | undefined>()
  const [agents, setAgents] = createSignal<{ name: string; description?: string }[]>([])
  const [permission, setPermission] = createSignal<PermissionRequest | null>(null)
  const [showPermission, setShowPermission] = createSignal(false)
  const [permMode, setPermMode] = createSignal<"interactive" | "accept" | "reject">("interactive")

  let alive = true
  onCleanup(() => {
    alive = false
  })

  const normDir = (d: string) => d.replace(/\\/g, "/").toLowerCase()

  const refreshSessions = async () => {
    try {
      const client = sdk()
      const dir = directory()
      const list = await client.session.list({ directory: dir })
      if (!alive) return
      let data = (list.data ?? []).filter((s) => !s.parentID)
      if (data.length === 0) {
        const all = await client.session.list()
        if (!alive) return
        const want = normDir(dir)
        data = (all.data ?? []).filter((s) => !s.parentID && normDir(s.directory) === want)
      }
      setSessions(data)
      const initial = props.initialSessionID
      if (initial && data.some((s) => s.id === initial)) {
        setSessionID(initial)
      } else if (!sessionID() && data[0]) {
        setSessionID(data[0].id)
      } else if (initial && !sessionID()) {
        setSessionID(initial)
      }
    } catch (e) {
      if (!alive) return
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const loadMessages = async (id: string) => {
    try {
      const client = sdk()
      const res = await client.session.messages({ sessionID: id, directory: directory() })
      if (!alive) return
      const rows = res.data ?? []
      const merged: ChatLine[] = []
      for (const row of rows) {
        if (row.info.role !== "user" && row.info.role !== "assistant") continue
        const role = row.info.role === "user" ? "user" : "assistant"
        merged.push(...partsToLines(row.parts, role))
      }
      setLines(merged)
    } catch (e) {
      if (!alive) return
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const refreshProviders = async () => {
    try {
      const client = sdk()
      const list = await client.provider.list()
      if (!alive) return
      const data = list.data
      if (!data) return
      const connected = new Set(data.connected)
      const opts: string[] = []
      for (const p of data.all) {
        if (!connected.has(p.id)) continue
        for (const id of Object.keys(p.models)) {
          opts.push(`${p.id}/${id}`)
        }
      }
      setModels(opts)
      if (!model()) {
        for (const pid of data.connected) {
          const mid = data.default[pid]
          if (mid) {
            setModel(`${pid}/${mid}`)
            break
          }
        }
        if (!model() && opts[0]) setModel(opts[0])
      }
    } catch (e) {
      if (!alive) return
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const defaultAgents = () => [
    { name: "build", description: "Default agent — runs tools with configured permissions" },
    { name: "plan", description: "Plan mode — no file edits" },
  ]

  const refreshAgents = async () => {
    try {
      const client = sdk()
      const res = await client.app.agents()
      if (!alive) return
      const list = (res.data ?? []).filter((a) => a.mode !== "subagent")
      const opts =
        list.length > 0
          ? list.map((a) => ({ name: a.name, description: a.description }))
          : defaultAgents()
      setAgents(opts)
      if (!agent()) setAgent(opts[0]?.name ?? "build")
    } catch {
      if (!alive) return
      const opts = defaultAgents()
      setAgents(opts)
      if (!agent()) setAgent("build")
    }
  }

  const replyPermission = async (reply: "once" | "always" | "reject") => {
    const req = permission()
    const client = sdk()
    if (!req || !client) return
    await client.permission.reply({ requestID: req.id, reply })
    setShowPermission(false)
    setPermission(null)
  }

  onMount(() => {
    void (async () => {
      await refreshSessions()
      if (!alive) return
      const initial = props.initialSessionID
      if (sessions().length === 0 && initial) {
        setSessions([
          {
            id: initial,
            slug: "e2e",
            projectID: "global",
            directory: directory(),
            title: "Shell E2E",
            version: "0",
            time: { created: Date.now(), updated: Date.now() },
          },
        ])
        setSessionID(initial)
      }
      await refreshProviders()
      if (!alive) return
      await refreshAgents()
    })()
  })

  createEffect(() => {
    const id = sessionID()
    if (!id) return
    void (async () => {
      await loadMessages(id)
    })()
  })

  createEffect(() => {
    const id = sessionID()
    if (!id) return

    const abort = new AbortController()
    let streamDone = false

    const run = async () => {
      const client = sdk()
      const events = await client.event.subscribe({ directory: directory() }, { signal: abort.signal })
      for await (const event of events.stream) {
        if (event.type === "message.part.updated") {
          const part = event.properties.part
          if (part.sessionID !== id) continue
          if (part.type === "text") {
            setLines((prev) => {
              const idx = prev.findIndex((l) => l.id === part.id)
              const next: ChatLine = {
                kind: "text",
                role: "assistant",
                text: part.text,
                id: part.id,
              }
              if (idx >= 0) {
                const copy = [...prev]
                copy[idx] = next
                return copy
              }
              return [...prev, next]
            })
          }
          if (part.type === "tool") {
            if (part.state.status === "running") {
              const d = toolDisplay(part)
              setLines((prev) => {
                if (prev.some((l) => l.id === part.id)) return prev
                return [...prev, { kind: "tool", id: part.id, icon: d.icon, title: d.title }]
              })
            }
            if (part.state.status === "completed" || part.state.status === "error") {
              const d = toolDisplay(part)
              setLines((prev) => {
                const idx = prev.findIndex((l) => l.id === part.id)
                const next: ChatLine = {
                  kind: "tool",
                  id: part.id,
                  icon: d.icon,
                  title: d.title,
                  detail: d.detail,
                  diff: d.diff,
                }
                if (idx >= 0) {
                  const copy = [...prev]
                  copy[idx] = next
                  return copy
                }
                return [...prev, next]
              })
            }
          }
        }
        if (event.type === "session.status" && event.properties.sessionID === id) {
          if (event.properties.status.type === "busy") setBusy(true)
          if (event.properties.status.type === "idle") setBusy(false)
        }
        if (event.type === "session.error" && event.properties.sessionID === id) {
          setError(String(event.properties.error?.name ?? "Session error"))
          setBusy(false)
        }
        if (event.type === "permission.asked" && event.properties.sessionID === id) {
          if (permMode() === "accept") {
            await replyPermission("once")
            continue
          }
          if (permMode() === "reject") {
            await replyPermission("reject")
            continue
          }
          setPermission(event.properties)
          setShowPermission(true)
        }
      }
      streamDone = true
    }

    void run().catch(() => {
      if (!abort.signal.aborted) setError("Event stream disconnected")
    })

    onCleanup(() => {
      abort.abort()
      if (!streamDone) setBusy(false)
    })
  })

  const newSession = async () => {
    const client = sdk()
    const created = await client.session.create({ title: "New chat", directory: directory() })
    const id = created.data?.id
    if (!id) return
    setSessionID(id)
    setLines([])
    await refreshSessions()
  }

  const send = async () => {
    const text = draft().trim()
    if (!text || busy()) return
    setError(undefined)
    setDraft("")
    setBusy(true)

    let id = sessionID()
    const client = sdk()

    if (!id) {
      const created = await client.session.create({ title: text.slice(0, 48), directory: directory() })
      id = created.data?.id
      if (!id) {
        setBusy(false)
        return
      }
      setSessionID(id)
      await refreshSessions()
    }

    setLines((prev) => [...prev, { kind: "text", role: "user", text, id: `local-${Date.now()}` }])

    const modelParts = model()?.split("/")
    const provider = modelParts?.[0]
    const modelID = modelParts?.slice(1).join("/")

    try {
      await client.session.prompt({
        sessionID: id,
        directory: directory(),
        agent: agent(),
        model: provider && modelID ? { providerID: provider, modelID } : undefined,
        parts: [{ type: "text", text }],
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  const abortTurn = async () => {
    const id = sessionID()
    if (!id) return
    const client = sdk()
    await client.session.abort({ sessionID: id }).catch(() => {})
    setBusy(false)
  }

  const cyclePermMode = () => {
    setPermMode((m) => (m === "interactive" ? "accept" : m === "accept" ? "reject" : "interactive"))
  }

  const shortDir = () => {
    const d = directory()
    if (d.length <= 48) return d
    return "…" + d.slice(-45)
  }

  return (
    <div class="lc-shell" data-testid="shell-root">
      <header class="lc-header">
        <span class="lc-logo">LocalCoder</span>
        <span class="lc-header-meta" title={directory()}>
          {shortDir()}
        </span>
        <select
          data-testid="agent-select"
          value={agent() ?? "build"}
          onChange={(e) => setAgent(e.currentTarget.value)}
          title="Agent"
        >
          <For each={agents().length > 0 ? agents() : defaultAgents()}>
            {(a) => (
              <option value={a.name}>
                {a.description ? `${a.name} — ${a.description}` : a.name}
              </option>
            )}
          </For>
        </select>
        <select
          data-testid="model-select"
          value={model() ?? ""}
          onChange={(e) => setModel(e.currentTarget.value)}
          title="Model (connected providers only)"
        >
          <Show when={models().length === 0}>
            <option value="">No connected providers</option>
          </Show>
          <For each={models()}>{(m) => <option value={m}>{m}</option>}</For>
        </select>
        <button
          type="button"
          class="secondary"
          data-testid="perm-mode"
          title="Permission mode"
          onClick={cyclePermMode}
        >
          {permMode()}
        </button>
        <button type="button" class="secondary" onClick={() => void refreshSessions()} title="Refresh sessions">
          ↻
        </button>
      </header>

      <aside class="lc-sidebar">
        <div class="lc-sidebar-head">
          <span>Sessions</span>
          <button type="button" class="secondary" data-testid="new-session" onClick={() => void newSession()}>
            + New
          </button>
        </div>
        <div class="lc-sessions" data-testid="session-list">
          <For each={sessions()}>
            {(s) => (
              <button
                type="button"
                class="lc-session"
                classList={{ active: sessionID() === s.id }}
                data-testid="session-item"
                onClick={() => setSessionID(s.id)}
              >
                <div class="lc-session-title">{s.title || "Untitled"}</div>
                <div class="lc-session-meta">{s.id.slice(0, 8)}</div>
              </button>
            )}
          </For>
        </div>
      </aside>

      <main class="lc-main">
        <Show when={showPermission() && permission()}>
          <PermissionBanner request={permission()!} onReply={(r) => void replyPermission(r)} />
        </Show>

        <div class="lc-messages" data-testid="message-list">
          <Show when={lines().length === 0}>
            <div class="lc-empty" data-testid="empty-state">
              <p>Ask anything about your project. Tools run on the local server.</p>
              <Show when={models().length === 0}>
                <p class="lc-empty-hint">
                  Connect a provider in the CLI (<code>localcoder</code> → <code>/connect</code>) or VS Code, then refresh.
                </p>
              </Show>
            </div>
          </Show>
          <For each={lines()}>
            {(line) =>
              line.kind === "tool" ? (
                <div class="lc-tool" data-testid="tool-line">
                  <div class="lc-tool-head">
                    <span class="lc-tool-icon">{line.icon}</span>
                    <span class="lc-tool-title">{line.title}</span>
                  </div>
                  <Show when={line.detail}>
                    <pre class="lc-tool-detail">{line.detail}</pre>
                  </Show>
                  <Show when={line.diff}>
                    <pre class="lc-diff" data-testid="tool-diff">
                      {line.diff}
                    </pre>
                  </Show>
                </div>
              ) : (
                <article class={`lc-msg ${line.role}`} data-testid={`msg-${line.role}`}>
                  <div class="lc-msg-role">{line.role}</div>
                  <MessageBody role={line.role} text={line.text} />
                </article>
              )
            }
          </For>
        </div>

        <Show when={error()}>
          <div class="lc-error" data-testid="shell-error">
            {error()}
          </div>
        </Show>

        <div class="lc-status" data-testid="shell-status">
          {busy() ? "Agent working…" : "Ready"}
        </div>

        <div class="lc-composer" data-testid="composer">
          <textarea
            data-testid="composer-input"
            value={draft()}
            placeholder="Message the agent… (Enter to send, Shift+Enter for newline)"
            onInput={(e) => setDraft(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
            disabled={busy()}
          />
          <div class="lc-composer-actions">
            <button type="button" data-testid="send-btn" disabled={busy() || !draft().trim()} onClick={() => void send()}>
              Send
            </button>
            <button type="button" class="secondary" data-testid="stop-btn" disabled={!busy()} onClick={() => void abortTurn()}>
              Stop
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
