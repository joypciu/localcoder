import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import type { Part, Session } from "@localcoder-ai/sdk/v2"
import { createShellSdk, type ShellServer } from "./lib/sdk"

type ChatLine =
  | { kind: "text"; role: "user" | "assistant"; text: string; id: string }
  | { kind: "tool"; title: string; id: string }

function partsToLines(parts: Part[], role: "user" | "assistant"): ChatLine[] {
  const out: ChatLine[] = []
  for (const part of parts) {
    if (part.type === "text" && part.text.trim()) {
      out.push({
        kind: "text",
        role,
        text: part.text,
        id: part.id,
      })
    }
    if (part.type === "tool" && part.state.status !== "pending") {
      const title =
        part.tool === "bash" || part.tool === "shell"
          ? `$ ${(part.state as { input?: { command?: string } }).input?.command ?? part.tool}`
          : part.tool
      out.push({ kind: "tool", title, id: part.id })
    }
  }
  return out
}

export function ShellApp(props: { server: ShellServer }) {
  const sdk = createMemo(() => createShellSdk(props.server))
  const [sessions, setSessions] = createSignal<Session[]>([])
  const [sessionID, setSessionID] = createSignal<string | undefined>()
  const [lines, setLines] = createSignal<ChatLine[]>([])
  const [draft, setDraft] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string | undefined>()
  const [models, setModels] = createSignal<string[]>([])
  const [model, setModel] = createSignal<string | undefined>()
  const [agent, setAgent] = createSignal<string | undefined>()

  const refreshSessions = async () => {
    const list = await sdk().session.list()
    const data = (list.data ?? []).filter((s) => !s.parentID)
    setSessions(data)
    if (!sessionID() && data[0]) setSessionID(data[0].id)
  }

  const loadMessages = async (id: string) => {
    const res = await sdk().session.messages({ sessionID: id })
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
    const list = await sdk().provider.list()
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
    const agents = await sdk().app.agents()
    const first = (agents.data ?? []).find((a) => a.mode !== "subagent")
    if (first && !agent()) setAgent(first.name)
  }

  createEffect(() => {
    void refreshSessions()
    void refreshProviders()
    void refreshAgents()
  })

  createEffect(() => {
    const id = sessionID()
    if (!id) return
    void loadMessages(id)
  })

  createEffect(() => {
    const id = sessionID()
    if (!id) return

    const abort = new AbortController()
    let streamDone = false

    const run = async () => {
      const events = await sdk().event.subscribe(
        { directory: props.server.directory },
        { signal: abort.signal },
      )
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
          if (part.type === "tool" && (part.state.status === "completed" || part.state.status === "error")) {
            const title = part.tool
            setLines((prev) => {
              if (prev.some((l) => l.id === part.id)) return prev
              return [...prev, { kind: "tool", title, id: part.id }]
            })
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
          await sdk().permission.reply({ requestID: event.properties.id, reply: "once" })
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
    const created = await sdk().session.create({ title: "New chat" })
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
    if (!id) {
      const created = await sdk().session.create({ title: text.slice(0, 48) })
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
      await sdk().session.prompt({
        sessionID: id,
        agent: agent(),
        model: provider && modelID ? { providerID: provider, modelID } : undefined,
        parts: [{ type: "text", text }],
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  const abort = async () => {
    const id = sessionID()
    if (!id) return
    await sdk().session.abort({ sessionID: id }).catch(() => {})
    setBusy(false)
  }

  return (
    <div class="lc-shell">
      <header class="lc-header">
        <span class="lc-logo">LocalCoder</span>
        <span class="lc-header-meta" title={props.server.directory}>
          {props.server.directory}
        </span>
        <select
          value={model() ?? ""}
          onChange={(e) => setModel(e.currentTarget.value)}
          title="Model"
        >
          <For each={models()}>{(m) => <option value={m}>{m}</option>}</For>
        </select>
        <button type="button" class="secondary" onClick={() => void refreshSessions()} title="Refresh sessions">
          ↻
        </button>
      </header>

      <aside class="lc-sidebar">
        <div class="lc-sidebar-head">
          <span>Sessions</span>
          <button type="button" class="secondary" onClick={() => void newSession()}>
            + New
          </button>
        </div>
        <div class="lc-sessions">
          <For each={sessions()}>
            {(s) => (
              <button
                type="button"
                class="lc-session"
                classList={{ active: sessionID() === s.id }}
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
        <div class="lc-messages">
          <Show when={lines().length === 0}>
            <div class="lc-empty">Ask anything about your project. Tools run on the local server.</div>
          </Show>
          <For each={lines()}>
            {(line) =>
              line.kind === "tool" ? (
                <div class="lc-tool">{line.title}</div>
              ) : (
                <article class={`lc-msg ${line.role}`}>
                  <div class="lc-msg-role">{line.role}</div>
                  <div class="lc-msg-body">{line.text}</div>
                </article>
              )
            }
          </For>
        </div>

        <Show when={error()}>
          <div class="lc-error">{error()}</div>
        </Show>

        <div class="lc-status">{busy() ? "Agent working…" : "Ready"}</div>

        <form
          class="lc-composer"
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
        >
          <textarea
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
            <button type="submit" disabled={busy() || !draft().trim()}>
              Send
            </button>
            <button type="button" class="secondary" disabled={!busy()} onClick={() => void abort()}>
              Stop
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
