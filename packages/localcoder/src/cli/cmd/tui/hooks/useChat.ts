import { useCallback, useEffect, useRef, useState } from "react"
import type { localcoderClient, PermissionRequest, ToolPart, FilePart } from "@localcoder-ai/sdk/v2"
import { Provider } from "@/provider/provider"
import { renderInline, stripAnsi } from "@/cli/simple/markdown-render"

export type MessageRole = "user" | "assistant" | "system" | "tool"

export interface ChatMessage {
  id: string
  role: MessageRole
  text: string
  agent?: string
  modelID?: string
  toolParts?: ToolPart[]
  fileParts?: Pick<FilePart, "url" | "filename">[]
  thinkingText?: string
  error?: string
  timestamp: number
}

export interface ChatState {
  sessionID: string | undefined
  messages: ChatMessage[]
  isLoading: boolean
  isStreaming: boolean
  statusText: string
  model: string | undefined
  agent: string | undefined
  thinking: boolean
}

function stripThinkingFromText(text: string) {
  return text
    .replace(/<think[^>]*>[\s\S]*?<\/think>/gi, "")
    .replace(/<redacted_thinking>[\s\S]*?<\/redacted_thinking>/gi, "")
    .trim()
}

interface Part {
  type: string
  text?: string
  path?: string
  fileName?: string
}

export function useChat(
  sdk: localcoderClient,
  opts: {
    directory: string
    initialSessionID?: string
    initialModel?: string
    initialAgent?: string
    initialThinking?: boolean
    permissionMode?: "interactive" | "accept" | "reject"
    onError?: (msg: string) => void
    onStatus?: (text: string) => void
  },
) {
  const [sessionID, setSessionID] = useState<string | undefined>(opts.initialSessionID)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [statusText, setStatusText] = useState("")
  const [model, setModel] = useState<string | undefined>(opts.initialModel)
  const [agent, setAgent] = useState<string | undefined>(opts.initialAgent)
  const [thinking, setThinking] = useState(opts.initialThinking ?? false)

  const abortRef = useRef<AbortController | undefined>(undefined)
  const stateRef = useRef({
    textStreams: new Map<string, string>(),
    reasoningStreams: new Map<string, string>(),
    thinkingPanelActive: false,
    toolActive: false,
    assistantText: "",
    wroteAssistantNewline: false,
    thinkingMs: 0,
  })

  const stopLoading = useCallback(() => {
    setIsLoading(false)
    setIsStreaming(false)
    setStatusText("")
  }, [])

  const resolveSessionID = useCallback(
    async (continueSession: boolean, fork: boolean, message: string): Promise<string | undefined> => {
      if (sessionID && !continueSession && !fork) return sessionID

      const baseID = continueSession
        ? (await sdk.session.list()).data?.find((s) => !s.parentID)?.id
        : sessionID

      if (baseID && fork) {
        const forked = await sdk.session.fork({ sessionID: baseID })
        return forked.data?.id
      }
      if (baseID) return baseID

      const title = message.slice(0, 50) + (message.length > 50 ? "…" : "")
      const created = await sdk.session.create({ title })
      return created.data?.id
    },
    [sdk, sessionID],
  )

  const loadMessages = useCallback(
    async (sid: string) => {
      try {
        const result = await sdk.session.messages({ sessionID: sid })
        if (!result.data) return
        const loaded: ChatMessage[] = []
        for (const msg of result.data) {
          const textParts = msg.parts
            .filter((p: Part) => p.type === "text")
            .map((p: Part) => p.text ?? "")
            .join("")
          const reasoningParts = msg.parts
            .filter((p: Part) => p.type === "reasoning")
            .map((p: Part) => p.text ?? "")
            .join("")
          const fileParts = msg.parts
            .filter((p: Part) => p.type === "file")
            .map((p: Part) => ({ url: (p as { url?: string }).url ?? "", filename: (p as { filename?: string }).filename ?? "" }))
          loaded.push({
            id: msg.info.id,
            role: msg.info.role as ChatMessage["role"],
            text: stripThinkingFromText(textParts),
            thinkingText: reasoningParts,
            agent: msg.info.agent,
            modelID: (msg.info as Record<string, unknown>).modelID as string | undefined,
            fileParts,
            timestamp: msg.info.time.created ?? Date.now(),
          })
        }
        setMessages(loaded)
      } catch {
        // ignore
      }
    },
    [sdk],
  )

  const sendMessage = useCallback(
    async (input: {
      text: string
      command?: string
      continue?: boolean
      fork?: boolean
    }) => {
      const sid = await resolveSessionID(input.continue ?? false, input.fork ?? false, input.text)
      if (!sid) {
        opts.onError?.("Could not create or resume a session")
        return
      }

      setSessionID(sid)
      if (input.text.trim()) {
        setMessages((prev) => [
          ...prev,
          {
            id: `user-${Date.now()}`,
            role: "user",
            text: input.text,
            timestamp: Date.now(),
          },
        ])
      }

      setIsLoading(true)
      setIsStreaming(false)
      setStatusText("Waiting for model")

      const state = stateRef.current
      state.textStreams.clear()
      state.reasoningStreams.clear()
      state.thinkingPanelActive = false
      state.toolActive = false
      state.assistantText = ""
      state.wroteAssistantNewline = false
      state.thinkingMs = 0

      const eventAbort = new AbortController()
      abortRef.current = eventAbort

      const assistantMsgId = `assistant-${Date.now()}`
      let assistantMsg: ChatMessage = {
        id: assistantMsgId,
        role: "assistant",
        text: "",
        timestamp: Date.now(),
      }

      const streamLoop = async () => {
        try {
          const events = await sdk.event.subscribe(undefined, { signal: eventAbort.signal })
          let started = false

          for await (const event of events.stream) {
            if (eventAbort.signal.aborted) break

            if (event.type === "message.updated" && event.properties.info.role === "assistant" && !started) {
              setIsStreaming(true)
              setStatusText("")
              started = true
              assistantMsg = {
                ...assistantMsg,
                agent: event.properties.info.agent,
                modelID: event.properties.info.modelID,
              }
            }

            if (event.type === "message.part.updated") {
              const part = event.properties.part
              if (part.sessionID !== sid) continue

              if (part.type === "tool") {
                if (part.state.status === "running") {
                  if (!state.toolActive) {
                    state.toolActive = true
                    setStatusText("Running tools")
                  }
                }
                if (part.state.status === "completed" || part.state.status === "error") {
                  state.toolActive = false
                  setMessages((prev) => {
                    const last = prev[prev.length - 1]
                    if (!last || last.id !== assistantMsgId) return prev
                    const tools = [...(last.toolParts ?? []), part]
                    return [...prev.slice(0, -1), { ...last, toolParts: tools }]
                  })
                  if (!started) setStatusText("Waiting for model")
                }
              }

              if (part.type === "text") {
                const prev = state.textStreams.get(part.id) ?? ""
                const next = part.text
                if (next.length > prev.length) {
                  setIsStreaming(true)
                  setStatusText("")
                  const delta = next.slice(prev.length)
                  state.assistantText += delta
                  state.textStreams.set(part.id, next)

                  setMessages((prevMsgs) => {
                    const last = prevMsgs[prevMsgs.length - 1]
                    if (!last || last.id !== assistantMsgId) {
                      return [...prevMsgs, { ...assistantMsg, text: renderInline(state.assistantText) }]
                    }
                    return [...prevMsgs.slice(0, -1), { ...last, text: renderInline(state.assistantText) }]
                  })
                }
                if (part.time?.end) {
                  state.textStreams.delete(part.id)
                }
              }

              if (part.type === "reasoning") {
                if (!part.time?.end) {
                  if (!state.reasoningStreams.has(part.id)) {
                    setStatusText("Reasoning")
                    state.reasoningStreams.set(part.id, "")
                  }
                  const prev = state.reasoningStreams.get(part.id) ?? ""
                  const next = part.text
                  if (next.length > prev.length) {
                    const delta = next.slice(prev.length)
                    state.reasoningStreams.set(part.id, next)
                    if (thinking) {
                      state.thinkingPanelActive = true
                      setMessages((prevMsgs) => {
                        const last = prevMsgs[prevMsgs.length - 1]
                        if (!last || last.id !== assistantMsgId) {
                          return [...prevMsgs, { ...assistantMsg, thinkingText: delta }]
                        }
                        return [
                          ...prevMsgs.slice(0, -1),
                          { ...last, thinkingText: (last.thinkingText ?? "") + delta },
                        ]
                      })
                    }
                  }
                } else {
                  state.reasoningStreams.delete(part.id)
                  if (!started && !state.toolActive) setStatusText("Waiting for model")
                }
              }

              if (part.type === "file") {
                setMessages((prevMsgs) => {
                  const last = prevMsgs[prevMsgs.length - 1]
                  if (!last || last.id !== assistantMsgId) return prevMsgs
                  const filePart = part as { url?: string; filename?: string }
                  const files = [...(last.fileParts ?? []), { url: filePart.url ?? "", filename: filePart.filename ?? "" }]
                  return [...prevMsgs.slice(0, -1), { ...last, fileParts: files }]
                })
              }
            }

            if (event.type === "session.error") {
              const props = event.properties
              if (props.sessionID !== sid || !props.error) continue
              let err = String(props.error.name)
              if ("data" in props.error && props.error.data && "message" in props.error.data) {
                err = String(props.error.data.message)
              }
              setMessages((prevMsgs) => {
                const last = prevMsgs[prevMsgs.length - 1]
                if (!last || last.id !== assistantMsgId) {
                  return [...prevMsgs, { ...assistantMsg, error: err, role: "assistant" }]
                }
                return [...prevMsgs.slice(0, -1), { ...last, error: err }]
              })
              stopLoading()
              break
            }

            if (event.type === "session.status") {
              if (event.properties.sessionID !== sid) continue
              const status = event.properties.status
              if (status.type === "busy" && !started) setStatusText("Model busy")
              if (status.type === "idle") {
                stopLoading()
                break
              }
            }

            if (event.type === "permission.asked") {
              const permission = event.properties
              if (permission.sessionID !== sid) continue
              setStatusText("Waiting for permission")
              const reply =
                opts.permissionMode === "accept"
                  ? ("once" as const)
                  : opts.permissionMode === "reject"
                    ? ("reject" as const)
                    : ("once" as const)
              await sdk.permission.reply({ requestID: permission.id, reply })
              if (!started) setStatusText("Waiting for model")
            }
          }
        } catch {
          // stream ended
        } finally {
          stopLoading()
        }
      }

      const loopPromise = streamLoop()

      try {
        const parts = input.text.trim() ? [{ type: "text" as const, text: input.text }] : []
        if (input.command) {
          await sdk.session.command({
            sessionID: sid,
            agent,
            model,
            command: input.command,
            arguments: input.text,
          })
        } else if (parts.length > 0) {
          const parsedModel = model ? Provider.parseModel(model) : undefined
          await sdk.session.prompt({
            sessionID: sid,
            agent,
            model: parsedModel,
            parts,
          })
        }
      } catch (e) {
        eventAbort.abort()
        const msg = e instanceof Error ? e.message : String(e)
        setMessages((prev) => [
          ...prev,
          { id: `error-${Date.now()}`, role: "system", text: "", error: msg, timestamp: Date.now() },
        ])
        stopLoading()
      }

      await loopPromise
      abortRef.current = undefined
    },
    [sdk, agent, model, thinking, resolveSessionID, stopLoading, opts],
  )

  const abort = useCallback(() => {
    abortRef.current?.abort()
    if (sessionID) {
      void sdk.session.abort({ sessionID }).catch(() => {})
    }
    stopLoading()
  }, [sdk, sessionID, stopLoading])

  const switchSession = useCallback(
    async (sid: string) => {
      setSessionID(sid)
      await loadMessages(sid)
    },
    [loadMessages],
  )

  const newSession = useCallback(() => {
    setSessionID(undefined)
    setMessages([])
  }, [])

  return {
    sessionID,
    messages,
    isLoading,
    isStreaming,
    statusText,
    model,
    agent,
    thinking,
    setModel,
    setAgent,
    setThinking,
    sendMessage,
    abort,
    switchSession,
    newSession,
    loadMessages,
  }
}
