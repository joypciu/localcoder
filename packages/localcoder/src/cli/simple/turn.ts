import { UI } from "@/cli/ui"
import { Provider } from "@/provider/provider"
import type { localcoderClient, PermissionRequest } from "@localcoder-ai/sdk/v2"
import { Permission } from "@/permission"
import { renderTool } from "./render"
import type { FilePart } from "./parse"
import type { PermissionMode } from "./context"
import { turnAgent } from "./display"
import { TurnActivity } from "./activity-ui"
import { ThinkingPanel } from "./thinking-panel"
import { renderInline, stripAnsi } from "./markdown-render"

export type TurnOptions = {
  message: string
  files?: FilePart[]
  sessionID?: string
  continue?: boolean
  fork?: boolean
  agent?: string
  model?: string
  variant?: string
  command?: string
  thinking?: boolean
  permissionMode?: PermissionMode
  onPermission?: (req: PermissionRequest) => Promise<"once" | "always" | "reject">
  signal?: AbortSignal
  renderMarkdown?: boolean
}

export type TurnResult = {
  sessionID: string
  error?: string
  forked?: boolean
  elapsedMs: number
  thinkingMs?: number
  assistantText?: string
}

const denyRules: Permission.Ruleset = [
  { permission: "question", action: "deny", pattern: "*" },
  { permission: "plan_enter", action: "deny", pattern: "*" },
  { permission: "plan_exit", action: "deny", pattern: "*" },
]

async function resolveSessionID(sdk: localcoderClient, opts: TurnOptions): Promise<string | undefined> {
  const baseID = opts.continue
    ? (await sdk.session.list()).data?.find((s) => !s.parentID)?.id
    : opts.sessionID

  if (baseID && opts.fork) {
    const forked = await sdk.session.fork({ sessionID: baseID })
    return forked.data?.id
  }
  if (baseID) return baseID

  const title = opts.message.slice(0, 50) + (opts.message.length > 50 ? "…" : "")
  const created = await sdk.session.create({ title, permission: denyRules })
  return created.data?.id
}

function stripThinkingFromText(text: string) {
  return text
    .replace(/<think[^>]*>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*?<\/redacted_thinking>/gi, "")
    .trim()
}

function writeAssistant(text: string) {
  process.stdout.write(text)
}

export async function runTurn(sdk: localcoderClient, opts: TurnOptions): Promise<TurnResult> {
  const turnStart = Date.now()
  const sessionID = await resolveSessionID(sdk, opts)
  if (!sessionID) throw new Error("Could not create or resume a session")

  const activity = new TurnActivity()
  activity.start("Waiting for model")

  const eventAbort = new AbortController()
  if (opts.signal) {
    if (opts.signal.aborted) eventAbort.abort()
    opts.signal.addEventListener("abort", () => eventAbort.abort(), { once: true })
  }

  const events = await sdk.event.subscribe(undefined, { signal: eventAbort.signal })
  let error: string | undefined
  let started = false
  let forked = Boolean(opts.fork && opts.continue)
  const textStreams = new Map<string, string>()
  const reasoningStreams = new Map<string, string>()
  let wroteAssistantNewline = false
  let thinkingPanel: ThinkingPanel | undefined
  let thinkingMs: number | undefined
  let toolActive = false
  let assistantText = ""

  const stopActivity = () => {
    if (activity) activity.stop()
  }

  const loop = async () => {
    for await (const event of events.stream) {
      if (event.type === "message.updated" && event.properties.info.role === "assistant" && !started) {
        stopActivity()
        turnAgent(event.properties.info.agent, event.properties.info.modelID)
        if (!wroteAssistantNewline) {
          writeAssistant("\n")
          wroteAssistantNewline = true
        }
        started = true
      }

      if (event.type === "message.part.updated") {
        const part = event.properties.part
        if (part.sessionID !== sessionID) continue

        if (part.type === "tool") {
          if (part.state.status === "running") {
            if (!toolActive) {
              toolActive = true
              if (!thinkingPanel?.isActive()) activity.setLabel("Running tools")
            }
            if (part.tool === "task") renderTool(part)
          }
          if (part.state.status === "completed" || part.state.status === "error") {
            renderTool(part)
            toolActive = false
            if (!started && !thinkingPanel) activity.setLabel("Waiting for model")
          }
        }

        if (part.type === "text") {
          const prev = textStreams.get(part.id) ?? ""
          const next = part.text
          if (next.length > prev.length) {
            stopActivity()
            if (!wroteAssistantNewline) {
              writeAssistant("\n")
              wroteAssistantNewline = true
            }
            const rawDelta = next.slice(prev.length)
            const renderedDelta = opts.renderMarkdown ? renderInline(rawDelta) : rawDelta
            writeAssistant(renderedDelta)
            assistantText += rawDelta
            textStreams.set(part.id, next)
          }
          if (part.time?.end) {
            if (textStreams.has(part.id)) {
              writeAssistant("\n")
              assistantText += "\n"
            } else {
              const trimmed = stripThinkingFromText(part.text)
              if (trimmed) {
                if (!wroteAssistantNewline) writeAssistant("\n")
                const out = opts.renderMarkdown ? renderInline(trimmed) : trimmed
                writeAssistant(out + "\n")
                assistantText += trimmed + "\n"
                wroteAssistantNewline = true
              }
            }
            textStreams.delete(part.id)
          }
        }

        if (part.type === "reasoning" && !opts.thinking) {
          if (!part.time?.end) {
            if (!reasoningStreams.has(part.id)) {
              activity.setLabel("Reasoning — /thinking to show")
              reasoningStreams.set(part.id, "")
            }
          } else {
            reasoningStreams.delete(part.id)
            if (!started && !toolActive) activity.setLabel("Waiting for model")
          }
        }

        if (part.type === "reasoning" && opts.thinking) {
          const prev = reasoningStreams.get(part.id) ?? ""
          const next = part.text
          if (next.length > prev.length && !part.time?.end) {
            if (prev.length === 0) {
              stopActivity()
              thinkingPanel = new ThinkingPanel()
              thinkingPanel.begin()
            }
            thinkingPanel?.append(next.slice(prev.length))
            reasoningStreams.set(part.id, next)
          }
          if (part.time?.end) {
            const text = part.text.trim()
            if (reasoningStreams.has(part.id)) {
              const closed = thinkingPanel?.close()
              if (closed) thinkingMs = (thinkingMs ?? 0) + closed.ms
              thinkingPanel = undefined
              reasoningStreams.delete(part.id)
            } else if (text && !text.startsWith("[REDACTED]")) {
              stopActivity()
              ThinkingPanel.showCollapsed(text)
            }
          }
        }
      }

      if (event.type === "session.error") {
        const props = event.properties
        if (props.sessionID !== sessionID || !props.error) continue
        let err = String(props.error.name)
        if ("data" in props.error && props.error.data && "message" in props.error.data) {
          err = String(props.error.data.message)
        }
        error = err
        stopActivity()
        thinkingPanel?.close()
        UI.error(err)
        break
      }

      if (event.type === "session.status") {
        if (event.properties.sessionID !== sessionID) continue
        const status = event.properties.status
        if (status.type === "busy" && !started && !thinkingPanel) {
          activity.setLabel("Model busy")
        }
        if (status.type === "idle") break
      }

      if (event.type === "permission.asked") {
        const permission = event.properties
        if (permission.sessionID !== sessionID) continue
        activity.setLabel("Waiting for permission")
        const reply = opts.onPermission
          ? await opts.onPermission(permission)
          : opts.permissionMode === "accept"
            ? ("once" as const)
            : ("reject" as const)
        await sdk.permission.reply({ requestID: permission.id, reply })
        if (!started && !thinkingPanel) activity.setLabel("Waiting for model")
      }
    }
  }

  const loopDone = loop()

  try {
    const parts = [
      ...(opts.files ?? []),
      ...(opts.message.trim() ? [{ type: "text" as const, text: opts.message }] : []),
    ]
    if (opts.command) {
      await sdk.session.command({
        sessionID,
        agent: opts.agent,
        model: opts.model,
        command: opts.command,
        arguments: opts.message,
        variant: opts.variant,
      })
    } else if (parts.length > 0) {
      const model = opts.model ? Provider.parseModel(opts.model) : undefined
      await sdk.session.prompt({
        sessionID,
        agent: opts.agent,
        model,
        variant: opts.variant,
        parts,
      })
    } else {
      throw new Error("Empty message")
    }
  } catch (e) {
    eventAbort.abort()
    const msg = e instanceof Error ? e.message : String(e)
    error = msg
    stopActivity()
    thinkingPanel?.close()
    UI.error(msg)
  }

  await loopDone.catch(() => {})
  stopActivity()
  if (thinkingPanel) {
    const closed = thinkingPanel.close()
    if (closed) thinkingMs = (thinkingMs ?? 0) + closed.ms
  }
  if (wroteAssistantNewline) writeAssistant("\n")

  return {
    sessionID,
    error,
    forked,
    elapsedMs: Date.now() - turnStart,
    thinkingMs,
    assistantText: stripAnsi(assistantText).trim() || undefined,
  }
}
