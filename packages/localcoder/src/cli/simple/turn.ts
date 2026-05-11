import { UI } from "@/cli/ui"
import { Provider } from "@/provider/provider"
import type { localcoderClient, PermissionRequest } from "@localcoder-ai/sdk/v2"
import { Permission } from "@/permission"
import { renderTool } from "./render"
import type { FilePart } from "./parse"
import type { PermissionMode } from "./context"

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

export async function runTurn(
  sdk: localcoderClient,
  opts: TurnOptions,
): Promise<{ sessionID: string; error?: string; forked?: boolean }> {
  const sessionID = await resolveSessionID(sdk, opts)
  if (!sessionID) throw new Error("Could not create or resume a session")

  const eventAbort = new AbortController()
  if (opts.signal) {
    if (opts.signal.aborted) eventAbort.abort()
    opts.signal.addEventListener("abort", () => eventAbort.abort(), { once: true })
  }

  const events = await sdk.event.subscribe({ signal: eventAbort.signal })
  let error: string | undefined
  let started = false
  let forked = Boolean(opts.fork && opts.continue)
  const textStreams = new Map<string, string>()

  const loop = async () => {
    for await (const event of events.stream) {
      if (event.type === "message.updated" && event.properties.info.role === "assistant" && !started) {
        UI.empty()
        UI.println(
          UI.Style.TEXT_HIGHLIGHT +
            `▸ ${event.properties.info.agent} · ${event.properties.info.modelID}` +
            UI.Style.TEXT_NORMAL,
        )
        started = true
      }

      if (event.type === "message.part.updated") {
        const part = event.properties.part
        if (part.sessionID !== sessionID) continue

        if (part.type === "tool") {
          if (part.state.status === "running" && part.tool === "task") {
            renderTool(part)
          }
          if (part.state.status === "completed" || part.state.status === "error") {
            renderTool(part)
          }
        }

        if (part.type === "text") {
          const prev = textStreams.get(part.id) ?? ""
          const next = part.text
          if (next.length > prev.length) {
            process.stdout.write(next.slice(prev.length))
            textStreams.set(part.id, next)
          }
          if (part.time?.end) {
            const trimmed = part.text.trim()
            if (trimmed && !prev) {
              UI.empty()
              UI.println(trimmed)
            } else if (prev) {
              process.stdout.write("\n")
            }
            UI.empty()
            textStreams.delete(part.id)
          }
        }

        if (part.type === "reasoning" && opts.thinking) {
          const text = part.text.trim()
          if (text && part.time?.end) {
            UI.println(UI.Style.TEXT_DIM + `◆ ${text}` + UI.Style.TEXT_NORMAL)
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
        UI.error(err)
        break
      }

      if (event.type === "session.status") {
        if (event.properties.sessionID !== sessionID) continue
        if (event.properties.status.type === "busy" && !started) {
          UI.println(UI.Style.TEXT_DIM + "…" + UI.Style.TEXT_NORMAL)
        }
        if (event.properties.status.type === "idle") break
      }

      if (event.type === "permission.asked") {
        const permission = event.properties
        if (permission.sessionID !== sessionID) continue
        const reply = opts.onPermission
          ? await opts.onPermission(permission)
          : opts.permissionMode === "accept"
            ? ("once" as const)
            : ("reject" as const)
        await sdk.permission.reply({ requestID: permission.id, reply })
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
    UI.error(msg)
  }

  await loopDone.catch(() => {})
  return { sessionID, error, forked }
}
