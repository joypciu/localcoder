import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import type { Part, PermissionRequest, Session } from "@localcoder-ai/sdk/v2"
import { PermissionBanner } from "./components/permission-banner"
import { MessageBody } from "./components/message-body"
import { createShellSdk, type ShellServer } from "./lib/sdk"
import { toolDisplay } from "./lib/tool-display"

export type ShellAppProps = {
  server: ShellServer
  /** Offline Playwright preview — skips SDK, shows sample UI */
  mock?: boolean
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

const MOCK_SESSION: Session = {
  id: "mock-session-1",
  slug: "sample-chat",
  projectID: "mock-project",
  directory: "C:\\dev\\project",
  title: "Sample chat",
  version: "1",
  time: { created: Date.now(), updated: Date.now() },
}

export function ShellApp(props: ShellAppProps) {
  const mock = () => props.mock === true
  const directory = () => props.server.directory
  const sdk = createMemo(() => (mock() ? null : createShellSdk(props.server)))
  const [sessions, setSessions] = createSignal<Session[]>(mock() ? [MOCK_SESSION] : [])
  const [sessionID, setSessionID] = createSignal<string | undefined>(mock() ? MOCK_SESSION.id : undefined)
  const [lines, setLines] = createSignal<ChatLine[]>(
    mock()
      ? [
          { kind: "text", role: "user", text: "Explain this repo", id: "u1" },
          {
            kind: "text",
            role: "assistant",
            text: "## LocalCoder\n\nA **local-first** coding agent.\n\n- Sessions sidebar\n- Tool + diff view\n- Permission prompts",
            id: "a1",
          },
          { kind: "tool", id: "t1", icon: "←", title: "Edit README.md", diff: "+ LocalCoder shell UI" },
        ]
      : [],
  )
  const [draft, setDraft] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string | undefined>()
  const [models, setModels] = createSignal<string[]>(mock() ? ["llama.cpp/local"] : [])
  const [model, setModel] = createSignal<string | undefined>(mock() ? "llama.cpp/local" : undefined)
  const [agent, setAgent] = createSignal<string | undefined>(mock() ? "build" : undefined)
  const [permission, setPermission] = createSignal<PermissionRequest | null>(
    mock()
      ? {
          id: "perm-mock",
          sessionID: MOCK_SESSION.id,
          permission: "bash",
          patterns: ["npm test"],
          metadata: {},
          always: [],
        }
      : null,
  )
  const [showPermission, setShowPermission] = createSignal(mock())
  const [permMode, setPermMode] = createSignal<"interactive" | "accept" | "reject">("interactive")

  const refreshSessions = async () => {
    const client = sdk()
    if (!client) return
    const list = await client.session.list({ directory: directory() })
    const data = (list.data ?? []).filter((s) => !s.parentID)
    setSessions(data)
    if (!sessionID() && data[0]) setSessionID(data[0].id)
  }

  const loadMessages = async (id: string) => {
    const client = sdk()
    if (!client) return
    const res = await client.session.messages({ sessionID: id, directory: directory() })
    const rows = res.data ?? []
    const merged: ChatLine[] = []
    for (const row of rows) {
      if (row.info.role !== "user" && row.info.role !== "assistant") continue
      const role = row.info.role === "user" ? "user" : "assistant"
      merged.push(...partsToLines(row.parts, role))
    }
    setLines(merged)
  }

  const refreshProviders = async () => {
    const client = sdk()
    if (!client) return
    const list = await client.provider.list()
    const data = list.data
    if (!data) return
    const opts: string[] = []
    for (const p of data.all) {
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
    }
  }

  const refreshAgents = async () => {
    const client = sdk()
    if (!client) return
    const agents = await client.app.agents()
    const first = (agents.data ?? []).find((a) => a.mode !== "subagent")
    if (first && !agent()) setAgent(first.name)
  }

  const replyPermission = async (reply: "once" | "always" | "reject") => {
    const req = permission()
    if (mock()) {
      setShowPermission(false)
      setPermission(null)
      return
    }
    const client = sdk()
    if (!req || !client) return
    await client.permission.reply({ requestID: req.id, reply })
    setShowPermission(false)
    setPermission(null)
  }

  onMount(() => {
    if (!mock()) return
    ;(window as { __lcDismissPermission?: () => void }).__lcDismissPermission = () => {
      setShowPermission(false)
      setPermission(null)
    }
  })

  createEffect(() => {
    if (mock()) return
    void refreshSessions()
    void refreshProviders()
    void refreshAgents()
  })

  createEffect(() => {
    if (mock()) return
    const id = sessionID()
    if (!id) return
    void loadMessages(id)
  })

  createEffect(() => {
    if (mock()) return
    const id = sessionID()
    if (!id) return

    const abort = new AbortController()
    let streamDone = false

    const run = async () => {
      const client = sdk()
      if (!client) return
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
    if (mock()) {
      setSessionID(MOCK_SESSION.id)
      setLines([])
      return
    }
    const client = sdk()
    if (!client) return
    const created = await client.session.create({ title: "New chat", directory: directory() })
    const id = created.data?.id
    if (!id) return
    setSessionID(id)
    setLines([])
    await refreshSessions()
  }

  const draftText = () => {
    if (mock() && typeof document !== "undefined") {
      const el = document.querySelector('[data-testid="composer-input"]') as HTMLTextAreaElement | null
      const v = el?.value.trim()
      if (v) return v
    }
    return draft().trim()
  }

  const send = async () => {
    const text = draftText()
    if (!text || busy()) return
    if (mock()) {
      setDraft("")
      const id = `local-${Date.now()}`
      setLines([...lines(), { kind: "text", role: "user", text, id }])
      return
    }
    setError(undefined)
    setDraft("")
    setBusy(true)

    let id = sessionID()
    const client = sdk()
    if (!client) return

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
    if (!id || mock()) return
    const client = sdk()
    if (!client) return
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
          data-testid="model-select"
          value={model() ?? ""}
          onChange={(e) => setModel(e.currentTarget.value)}
          title="Model"
          disabled={mock()}
        >
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
            <div class="lc-empty">Ask anything about your project. Tools run on the local server.</div>
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
          {busy() ? "Agent working…" : mock() ? "Preview mode" : "Ready"}
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
            disabled={busy() && !mock()}
          />
          <div class="lc-composer-actions">
            <button
              type="button"
              data-testid="send-btn"
              disabled={(busy() && !mock()) || (!mock() && !draft().trim())}
              onClick={() => void send()}
            >
              Send
            </button>
            <button
              type="button"
              class="secondary"
              data-testid="stop-btn"
              disabled={!busy() || mock()}
              onClick={() => void abortTurn()}
            >
              Stop
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
