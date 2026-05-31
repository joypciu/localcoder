import * as readline from "readline/promises"
import { stdin as input, stdout as output } from "process"
import { UI } from "@/cli/ui"
import { createInProcessClient } from "./client"
import { runTurn } from "./turn"
import type { ReplContext, PermissionMode } from "./context"
import { shortSession } from "./context"
import { parseLine, resolveFileParts, stripAtRefs } from "./parse"
import {
  askPermission,
  handleSlashCommand,
  runShellCommand,
  type CommandEnv,
} from "./commands"
import { openEditor } from "./editor"
import { readInput } from "./input-area"
import { loadHistory, appendHistory, clearPersistedHistory } from "./history-persistence"
import { copyToClipboard } from "./clipboard"
import { promptLabel, turnContext, turnDivider, turnTiming, turnUser, welcome } from "./display"
import { maybeTurnTip } from "./hints"
import { parseModelRef } from "./provider-pick"
import { fetchProviderList } from "./provider-pick"
import { printFirstRunHint } from "./setup-commands"
import * as Setup from "@/llamacpp/setup"
import { stopIfManaged } from "@/llamacpp/server"
import { applySessionMeterToContext } from "./session-meter"

export type ReplConfig = {
  directory: string
  model?: string
  agent?: string
  sessionID?: string
  continue?: boolean
  fork?: boolean
  prompt?: string
  permissionMode?: PermissionMode
  thinking?: boolean
}

async function defaultModel(sdk: ReturnType<typeof createInProcessClient>) {
  const list = await sdk.provider.list()
  const data = list.data
  if (!data) return undefined
  for (const pid of data.connected) {
    const mid = data.default[pid]
    if (mid) return `${pid}/${mid}`
  }
  const first = data.all[0]
  const firstModel = first ? Object.keys(first.models)[0] : undefined
  if (first && firstModel) return `${first.id}/${firstModel}`
  return undefined
}

function defaultThinking(model?: string, explicit?: boolean) {
  if (explicit === true) return true
  if (explicit === false) return false
  const ref = model ? parseModelRef(model) : undefined
  if (ref?.providerID === "llamacpp") {
    const saved = Setup.loadUserLlamaConfig()
    if (saved.thinking !== undefined) return saved.thinking
    const path = saved.modelPath ?? Setup.resolveModelPath()
    if (path) return Setup.resolveThinkingEnabled(path)
  }
  return false
}

function syncThinkingFromLlamaConfig(ctx: ReplContext) {
  const ref = ctx.model ? parseModelRef(ctx.model) : undefined
  if (ref?.providerID !== "llamacpp") return
  const saved = Setup.loadUserLlamaConfig()
  if (saved.thinking !== undefined) {
    ctx.thinking = saved.thinking
    return
  }
  const path = saved.modelPath
  if (path) ctx.thinking = Setup.resolveThinkingEnabled(path)
}

  function statusLine(ctx: ReplContext) {
    const ref = ctx.model ? parseModelRef(ctx.model) : undefined
    const modelLabel = ref ? `${ref.providerID}/${ref.modelID}` : (ctx.model ?? "model?")
    const parts = [
      modelLabel,
      ctx.agent ?? "build",
      shortSession(ctx.sessionID),
      ctx.meterShort,
      ctx.permissionMode.slice(0, 4),
      ctx.thinking ? "think" : "",
      ctx.multiline ? "multi" : "",
      ctx.showTiming ? "" : "⏱off",
      ctx.showTips ? "" : "tips off",
    ].filter(Boolean)
    return UI.Style.TEXT_DIM + parts.join(" · ") + UI.Style.TEXT_NORMAL
  }

async function refreshMeter(sdk: ReturnType<typeof createInProcessClient>, ctx: ReplContext) {
  try {
    await applySessionMeterToContext(sdk, ctx)
  } catch {
    ctx.meterShort = undefined
  }
}

export async function runRepl(config: ReplConfig) {
  const sdk = createInProcessClient(config.directory)

  const ctx: ReplContext = {
    directory: config.directory,
    sessionID: config.sessionID,
    continueSession: config.continue ?? false,
    model: config.model,
    agent: config.agent,
    thinking: defaultThinking(config.model, config.thinking),
    permissionMode: config.permissionMode ?? "interactive",
    variant: undefined,
    showTiming: true,
    showTips: true,
    turnCount: 0,
    multiline: false,
    lastAssistantText: "",
    renderMarkdown: true,
  }

  let connectedCount = 0
  if (!ctx.model) {
    try {
      ctx.model = await defaultModel(sdk)
      const ref = ctx.model ? parseModelRef(ctx.model) : undefined
      if (ref) ctx.providerID = ref.providerID
      syncThinkingFromLlamaConfig(ctx)
    } catch {
      // pick via /providers and /model
    }
  }

  try {
    const data = await fetchProviderList(sdk)
    connectedCount = data?.connected.length ?? 0
    printFirstRunHint(!!ctx.model, connectedCount)
  } catch {
    // non-fatal
  }

  UI.println(UI.logo())
  welcome(config.directory, ctx.thinking)

  let turnAbort: AbortController | undefined
  let forkNext = config.fork ?? false
  let exiting = false
  const inputHistory: string[] = await loadHistory()
  let lastAssistantText = ""

  async function askLine(prompt: string): Promise<string> {
    const rl = readline.createInterface({ input, output, terminal: true })
    try {
      return await rl.question(prompt)
    } finally {
      rl.close()
    }
  }

  const env: CommandEnv = {
    sdk,
    ctx,
    ask: askLine,
  }

  const abortActiveTurn = () => {
    turnAbort?.abort()
    if (ctx.sessionID) void sdk.session.abort({ sessionID: ctx.sessionID }).catch(() => {})
    UI.println(UI.Style.TEXT_WARNING + "Turn cancelled." + UI.Style.TEXT_NORMAL)
  }

  /** @clack/prompts and readline may leave stdin paused / terminal broken on Windows. */
  function restoreTerminalAfterPrompts() {
    if (process.stdin.isPaused()) {
      process.stdin.resume()
    }
    if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
      try {
        process.stdin.setRawMode(false)
      } catch {
        // ignore
      }
    }
    if (process.stdout.isTTY) {
      process.stdout.write("\x1b[?25h") // show cursor
    }
  }

  function slashUsesClackPrompts(command: string) {
    return (
      command === "connect" ||
      command === "llama" ||
      command === "providers" ||
      command === "provider" ||
      command === "connectors" ||
      command === "connector" ||
      command === "model" ||
      command === "agent"
    )
  }

  let inputAbort = new AbortController()

  const onSigint = () => {
    if (exiting) return
    if (turnAbort) {
      abortActiveTurn()
      return
    }
    exiting = true
    inputAbort.abort()
  }
  process.on("SIGINT", onSigint)

  const onBeforeExit = async () => {
    await stopIfManaged().catch(() => {})
  }
  process.once("beforeExit", onBeforeExit)
  process.once("SIGTERM", onBeforeExit)

  const runAgentTurn = async (input: {
    text: string
    command?: string
    commandArgs?: string
  }) => {
    turnAbort = new AbortController()

    const files = await resolveFileParts(sdk, input.text)
    const message = input.command ? (input.commandArgs ?? "") : stripAtRefs(input.text)

    if (!input.command) turnUser(message)

    let result: Awaited<ReturnType<typeof runTurn>> | undefined
    try {
      result = await runTurn(sdk, {
        message,
        files: input.command ? undefined : files,
        sessionID: ctx.sessionID,
        continue: ctx.continueSession,
        fork: forkNext,
        agent: ctx.agent,
        model: ctx.model,
        thinking: ctx.thinking,
        permissionMode: ctx.permissionMode,
        command: input.command,
        signal: turnAbort.signal,
        renderMarkdown: ctx.renderMarkdown,
        onPermission: async (req) => {
          if (ctx.permissionMode !== "interactive") {
            return ctx.permissionMode === "accept" ? "once" : "reject"
          }
          try {
            return await askPermission(req, ctx.permissionMode, askLine)
          } finally {
            restoreTerminalAfterPrompts()
          }
        },
      })
      ctx.sessionID = result.sessionID
      ctx.continueSession = true
      forkNext = false
      lastAssistantText = result.assistantText ?? ""
      await refreshMeter(sdk, ctx)
      if (ctx.showTiming && result && !result.error) {
        turnTiming(result.elapsedMs, result.thinkingMs)
      }
      if (ctx.meterShort) {
        turnContext(ctx.meterShort, ctx.meterShort.includes("overflow"))
      }
      if (!result?.error) maybeTurnTip(ctx)
      turnDivider()
      return result
    } finally {
      turnAbort = undefined
    }
  }

  if (config.prompt?.trim()) {
    await runAgentTurn({ text: config.prompt })
  }

  try {
    while (!exiting) {
      UI.empty()
      UI.println(statusLine(ctx))
      if (ctx.turnCount === 0) {
        UI.println(UI.Style.TEXT_DIM + "  hint: /help · /session · /sessions · /history" + UI.Style.TEXT_NORMAL)
      } else if (ctx.turnCount % 4 === 0 && ctx.showTips) {
        UI.println(UI.Style.TEXT_DIM + "  hint: /tips" + UI.Style.TEXT_NORMAL)
      }

      inputAbort = new AbortController()
      let line: string
      try {
        const result = await readInput({ prompt: promptLabel(), history: inputHistory, signal: inputAbort.signal, multiline: ctx.multiline })
        if (result.cancelled) {
          if (exiting) break
          continue
        }
        line = result.text
      } catch {
        break
      }

      // Persist input history (async, don't await)
      void appendHistory(line, ctx.directory)

      const parsed = parseLine(line)

      if (parsed.kind === "empty") continue

      if (parsed.kind === "slash") {
        const clack = slashUsesClackPrompts(parsed.command)
        let result: Awaited<ReturnType<typeof handleSlashCommand>>
        try {
          result = await handleSlashCommand(parsed.command, parsed.args, env)
        } catch {
          if (clack) restoreTerminalAfterPrompts()
          continue
        } finally {
          if (clack) restoreTerminalAfterPrompts()
        }
        if (result === "exit") break
        if (result === "abort-turn") abortActiveTurn()
        if (result === "editor") {
          const text = await openEditor(parsed.args)
          if (text?.trim()) {
            await runAgentTurn({ text: text.trim() })
          }
          continue
        }
        if (result === "continue") {
          if (parsed.command === "fork") forkNext = true
          if (parsed.command === "thinking") {
            // ctx updated in commands
          }
          if (parsed.command === "connect" || parsed.command === "llama") {
            try {
              const data = await fetchProviderList(sdk)
              const ref = ctx.model ? parseModelRef(ctx.model) : undefined
              if (ref) ctx.providerID = ref.providerID
              else if (data?.connected.includes("llamacpp")) {
                const mid = data.default.llamacpp
                if (mid) {
                  ctx.model = `llamacpp/${mid}`
                  ctx.providerID = "llamacpp"
                }
              }
              syncThinkingFromLlamaConfig(ctx)
              UI.println(
                UI.Style.TEXT_DIM +
                  `  thinking: ${ctx.thinking ? "on" : "off"} (from llamacpp config · /thinking to toggle)` +
                  UI.Style.TEXT_NORMAL,
              )
            } catch {
              // non-fatal
            }
          }
          if (parsed.command === "context" || parsed.command === "ctx" || parsed.command === "tokens") {
            await refreshMeter(sdk, ctx)
          }
          continue
        }

        const list = await sdk.command.list()
        const known = list.data?.find((c) => c.name === parsed.command)
        if (known) {
          await runAgentTurn({
            text: line,
            command: parsed.command,
            commandArgs: parsed.args,
          })
        } else {
          UI.println(UI.Style.TEXT_WARNING + `Unknown: /${parsed.command} (try /help)` + UI.Style.TEXT_NORMAL)
        }
        continue
      }

      if (parsed.kind === "shell") {
        await runShellCommand(parsed.command)
        continue
      }

      await runAgentTurn({ text: parsed.text })
    }
  } finally {
    exiting = true
    process.off("SIGINT", onSigint)
    process.off("beforeExit", onBeforeExit)
    process.off("SIGTERM", onBeforeExit)
    // Stop managed llama-server to free VRAM
    const stopped = await stopIfManaged().catch(() => false)
    if (stopped) {
      UI.println(UI.Style.TEXT_DIM + "  llama-server stopped (VRAM freed)." + UI.Style.TEXT_NORMAL)
    }
  }
}
