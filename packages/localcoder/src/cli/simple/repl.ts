import * as readline from "readline/promises"
import { stdin as input, stdout as output } from "process"
import { cancel, spinner } from "@clack/prompts"
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

function statusLine(ctx: ReplContext) {
  const parts = [
    ctx.model ?? "model?",
    ctx.agent ?? "agent",
    `session:${shortSession(ctx.sessionID)}`,
    `perms:${ctx.permissionMode[0]}`,
    ctx.thinking ? "think" : "",
  ].filter(Boolean)
  return UI.Style.TEXT_DIM + parts.join(" · ") + UI.Style.TEXT_NORMAL
}

export async function runRepl(config: ReplConfig) {
  const sdk = createInProcessClient(config.directory)

  const ctx: ReplContext = {
    directory: config.directory,
    sessionID: config.sessionID,
    continueSession: config.continue ?? false,
    model: config.model,
    agent: config.agent,
    thinking: config.thinking ?? false,
    permissionMode: config.permissionMode ?? "interactive",
    variant: undefined,
  }

  if (!ctx.model) {
    try {
      ctx.model = await defaultModel(sdk)
    } catch {
      // pick via /model
    }
  }

  UI.empty()
  UI.println(UI.logo())
  UI.empty()
  UI.println(UI.Style.TEXT_DIM + `LocalCoder CLI · ${config.directory}` + UI.Style.TEXT_NORMAL)
  UI.println(
    UI.Style.TEXT_DIM +
      "Message the agent · /help · !shell · @files · Ctrl+C cancel turn" +
      UI.Style.TEXT_NORMAL,
  )
  UI.empty()

  const rl = readline.createInterface({ input, output, terminal: true })
  let turnAbort: AbortController | undefined
  let forkNext = config.fork ?? false

  const env: CommandEnv = {
    sdk,
    ctx,
    ask: (p) => rl.question(p),
  }

  const runAgentTurn = async (input: {
    text: string
    command?: string
    commandArgs?: string
  }) => {
    turnAbort = new AbortController()
    const spin = spinner()
    spin.start("Working")

    const files = await resolveFileParts(sdk, input.text)
    const message = input.command ? (input.commandArgs ?? "") : stripAtRefs(input.text)

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
        onPermission: (req) => askPermission(req, ctx.permissionMode, env.ask),
      })
      ctx.sessionID = result.sessionID
      ctx.continueSession = true
      forkNext = false
      return result
    } finally {
      spin.stop(result?.error ? "Failed" : "Done")
      turnAbort = undefined
    }
  }

  if (config.prompt?.trim()) {
    await runAgentTurn({ text: config.prompt })
  }

  try {
    while (true) {
      UI.println(statusLine(ctx))
      let line: string
      try {
        line = await rl.question(UI.Style.TEXT_HIGHLIGHT + "❯ " + UI.Style.TEXT_NORMAL)
      } catch {
        break
      }
      const parsed = parseLine(line)

      if (parsed.kind === "empty") continue

      if (parsed.kind === "slash") {
        const result = await handleSlashCommand(parsed.command, parsed.args, env)
        if (result === "exit") break
        if (result === "abort-turn") {
          turnAbort?.abort()
          if (ctx.sessionID) await sdk.session.abort({ sessionID: ctx.sessionID }).catch(() => {})
        }
        if (result === "continue") {
          if (parsed.command === "fork") forkNext = true
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
    rl.close()
    cancel()
  }
}
