import { spawnSync } from "child_process"
import { isCancel, select } from "@clack/prompts"
import { UI } from "@/cli/ui"
import type { localcoderClient, PermissionRequest } from "@localcoder-ai/sdk/v2"
import type { ReplContext } from "./context"
import { shortSession } from "./context"

export type CommandEnv = {
  sdk: localcoderClient
  ctx: ReplContext
  ask: (prompt: string) => Promise<string>
}

async function pickModel(sdk: localcoderClient): Promise<string | undefined> {
  const list = await sdk.provider.list()
  const options: { value: string; label: string }[] = []
  for (const p of list.data?.all ?? []) {
    for (const id of Object.keys(p.models)) {
      const m = p.models[id]
      options.push({ value: `${p.id}/${id}`, label: `${p.name} / ${m?.name ?? id}` })
    }
  }
  if (options.length === 0) return undefined
  const picked = await select({ message: "Model", options })
  if (isCancel(picked)) return undefined
  return String(picked)
}

async function pickAgent(sdk: localcoderClient): Promise<string | undefined> {
  const agents = await sdk.app.agents()
  const list = (agents.data ?? []).filter((a) => a.mode !== "subagent")
  if (list.length === 0) return undefined
  const picked = await select({
    message: "Agent",
    options: list.map((a) => ({ value: a.name, label: `${a.name}${a.description ? ` — ${a.description}` : ""}` })),
  })
  if (isCancel(picked)) return undefined
  return String(picked)
}

function printHelp() {
  UI.println(UI.Style.TEXT_INFO_BOLD + "Slash commands" + UI.Style.TEXT_NORMAL)
  UI.println(UI.Style.TEXT_DIM + "  Session" + UI.Style.TEXT_NORMAL)
  UI.println("    /new, /clear     new session")
  UI.println("    /sessions        list sessions")
  UI.println("    /resume <id>     continue a session")
  UI.println("    /fork            fork current session")
  UI.println("    /compact         summarize context (compact)")
  UI.println("    /abort           stop the running agent")
  UI.println(UI.Style.TEXT_DIM + "  Config" + UI.Style.TEXT_NORMAL)
  UI.println("    /status          model, agent, session, cwd")
  UI.println("    /model [id]      pick or set model")
  UI.println("    /agent [name]    pick or set agent")
  UI.println("    /thinking        toggle reasoning output")
  UI.println("    /permissions     cycle permission mode (ask → accept → reject)")
  UI.println(UI.Style.TEXT_DIM + "  Tools" + UI.Style.TEXT_NORMAL)
  UI.println("    /commands        list project slash commands")
  UI.println("    /help            this help")
  UI.println("    /exit, /quit     leave")
  UI.empty()
  UI.println(UI.Style.TEXT_INFO_BOLD + "Input modes" + UI.Style.TEXT_NORMAL)
  UI.println("    !cmd             run shell command (output shown locally)")
  UI.println("    @file            attach file or folder to your message")
  UI.println("    /name args       run a project command (from localcoder config)")
  UI.empty()
}

export async function runShellCommand(command: string) {
  if (!command) return
  UI.println(UI.Style.TEXT_DIM + `$ ${command}` + UI.Style.TEXT_NORMAL)
  const result = spawnSync(command, {
    shell: true,
    cwd: process.cwd(),
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  })
  if (result.stdout?.trim()) UI.println(result.stdout.trimEnd())
  if (result.stderr?.trim()) UI.println(UI.Style.TEXT_WARNING + result.stderr.trimEnd() + UI.Style.TEXT_NORMAL)
  if (result.status !== 0) {
    UI.println(UI.Style.TEXT_DANGER + `exit ${result.status ?? "unknown"}` + UI.Style.TEXT_NORMAL)
  }
}

export async function handleSlashCommand(
  command: string,
  args: string,
  env: CommandEnv,
): Promise<"continue" | "exit" | "abort-turn" | "unknown"> {
  const { sdk, ctx } = env

  switch (command) {
    case "help":
    case "h":
    case "?":
      printHelp()
      return "continue"

    case "exit":
    case "quit":
    case "q":
      return "exit"

    case "new":
    case "clear":
      ctx.sessionID = undefined
      ctx.continueSession = false
      UI.println(UI.Style.TEXT_SUCCESS + "New session." + UI.Style.TEXT_NORMAL)
      return "continue"

    case "status": {
      UI.println(UI.Style.TEXT_INFO_BOLD + "Status" + UI.Style.TEXT_NORMAL)
      UI.println(`  cwd:     ${ctx.directory}`)
      UI.println(`  session: ${shortSession(ctx.sessionID)}`)
      UI.println(`  model:   ${ctx.model ?? "(default)"}`)
      UI.println(`  agent:   ${ctx.agent ?? "(default)"}`)
      UI.println(`  think:   ${ctx.thinking ? "on" : "off"}`)
      UI.println(`  perms:   ${ctx.permissionMode}`)
      return "continue"
    }

    case "thinking":
      ctx.thinking = !ctx.thinking
      UI.println(UI.Style.TEXT_SUCCESS + `Thinking ${ctx.thinking ? "on" : "off"}.` + UI.Style.TEXT_NORMAL)
      return "continue"

    case "permissions":
    case "permission": {
      const order: ReplContext["permissionMode"][] = ["interactive", "accept", "reject"]
      const i = order.indexOf(ctx.permissionMode)
      ctx.permissionMode = order[(i + 1) % order.length]!
      UI.println(UI.Style.TEXT_SUCCESS + `Permissions: ${ctx.permissionMode}` + UI.Style.TEXT_NORMAL)
      return "continue"
    }

    case "model":
      if (args) {
        ctx.model = args
        UI.println(UI.Style.TEXT_SUCCESS + `Model: ${ctx.model}` + UI.Style.TEXT_NORMAL)
      } else {
        const picked = await pickModel(sdk)
        if (picked) {
          ctx.model = picked
          UI.println(UI.Style.TEXT_SUCCESS + `Model: ${ctx.model}` + UI.Style.TEXT_NORMAL)
        }
      }
      return "continue"

    case "agent":
      if (args) {
        ctx.agent = args
        UI.println(UI.Style.TEXT_SUCCESS + `Agent: ${ctx.agent}` + UI.Style.TEXT_NORMAL)
      } else {
        const picked = await pickAgent(sdk)
        if (picked) {
          ctx.agent = picked
          UI.println(UI.Style.TEXT_SUCCESS + `Agent: ${ctx.agent}` + UI.Style.TEXT_NORMAL)
        }
      }
      return "continue"

    case "sessions": {
      const list = await sdk.session.list()
      for (const s of list.data ?? []) {
        const mark = s.id === ctx.sessionID ? "*" : " "
        UI.println(`  ${mark} ${s.id}  ${s.title ?? "(untitled)"}`)
      }
      return "continue"
    }

    case "resume":
    case "session":
      if (!args) {
        UI.println(UI.Style.TEXT_WARNING + "Usage: /resume <session-id>" + UI.Style.TEXT_NORMAL)
        return "continue"
      }
      ctx.sessionID = args.split(/\s+/)[0]
      ctx.continueSession = true
      UI.println(UI.Style.TEXT_SUCCESS + `Resumed ${shortSession(ctx.sessionID)}` + UI.Style.TEXT_NORMAL)
      return "continue"

    case "fork":
      if (!ctx.sessionID) {
        UI.println(UI.Style.TEXT_WARNING + "No active session to fork." + UI.Style.TEXT_NORMAL)
        return "continue"
      }
      ctx.continueSession = true
      UI.println(UI.Style.TEXT_SUCCESS + "Next message will fork the session." + UI.Style.TEXT_NORMAL)
      return "continue"

    case "compact":
    case "summarize":
      if (!ctx.sessionID) {
        UI.println(UI.Style.TEXT_WARNING + "No active session." + UI.Style.TEXT_NORMAL)
        return "continue"
      }
      UI.println(UI.Style.TEXT_DIM + "Compacting session…" + UI.Style.TEXT_NORMAL)
      await sdk.session.summarize({ sessionID: ctx.sessionID })
      UI.println(UI.Style.TEXT_SUCCESS + "Session compacted." + UI.Style.TEXT_NORMAL)
      return "continue"

    case "abort":
    case "stop":
      if (!ctx.sessionID) return "continue"
      await sdk.session.abort({ sessionID: ctx.sessionID }).catch(() => {})
      UI.println(UI.Style.TEXT_WARNING + "Abort requested." + UI.Style.TEXT_NORMAL)
      return "abort-turn"

    case "commands": {
      const list = await sdk.command.list()
      for (const c of list.data ?? []) {
        UI.println(`  /${c.name}  ${c.description ?? ""}`)
      }
      return "continue"
    }

    default:
      return "unknown"
  }
}

export async function askPermission(
  req: PermissionRequest,
  mode: ReplContext["permissionMode"],
  ask: (prompt: string) => Promise<string>,
): Promise<"once" | "always" | "reject"> {
  if (mode === "accept") return "once"
  if (mode === "reject") return "reject"

  UI.empty()
  UI.println(UI.Style.TEXT_WARNING_BOLD + "Permission requested" + UI.Style.TEXT_NORMAL)
  UI.println(`  tool: ${req.permission}`)
  if (req.patterns?.length) UI.println(`  scope: ${req.patterns.join(", ")}`)
  if (req.metadata?.filepath) UI.println(`  file: ${req.metadata.filepath}`)
  UI.empty()

  const answer = (await ask("Allow? [y]es / [n]o / [a]lways: ")).trim().toLowerCase()
  if (answer === "a" || answer === "always") return "always"
  if (answer === "y" || answer === "yes") return "once"
  return "reject"
}
