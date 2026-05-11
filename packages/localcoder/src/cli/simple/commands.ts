import { spawnSync } from "child_process"
import { UI } from "@/cli/ui"
import type { localcoderClient, PermissionRequest } from "@localcoder-ai/sdk/v2"
import type { ReplContext } from "./context"
import { shortSession } from "./context"
import {
  fetchProviderList,
  parseModelRef,
  pickModel,
  pickProvider,
  printProviders,
} from "./provider-pick"
import { runConnectFlow, runLlamaFlow, showSessionContext } from "./setup-commands"

export type CommandEnv = {
  sdk: localcoderClient
  ctx: ReplContext
  ask: (prompt: string) => Promise<string>
}

function printHelp() {
  UI.println(UI.Style.TEXT_INFO_BOLD + "Commands" + UI.Style.TEXT_NORMAL)
  UI.println(UI.Style.TEXT_DIM + "  Session" + UI.Style.TEXT_NORMAL)
  UI.println("    /new, /clear     start a fresh session")
  UI.println("    /sessions        list sessions")
  UI.println("    /resume <id>     continue a session")
  UI.println("    /fork            fork on next message")
  UI.println("    /compact         summarize context")
  UI.println("    /context         token usage for session")
  UI.println("    /abort           stop the running turn")
  UI.println(UI.Style.TEXT_DIM + "  Setup" + UI.Style.TEXT_NORMAL)
  UI.println("    /connect         llama.cpp or cloud provider setup")
  UI.println("    /llama           llamacpp status / setup / start")
  UI.println("    /providers       list & pick provider")
  UI.println("    /connectors      alias for /providers")
  UI.println("    /model [id]      pick model (connected providers)")
  UI.println("    /agent [name]    pick or set agent")
  UI.println("    /status          cwd, session, model, permissions")
  UI.println(UI.Style.TEXT_DIM + "  Other" + UI.Style.TEXT_NORMAL)
  UI.println("    /thinking        toggle reasoning output")
  UI.println("    /permissions     cycle ask → accept → reject")
  UI.println("    /commands        project slash commands")
  UI.println("    /help            this help")
  UI.println("    /exit, /quit     leave")
  UI.empty()
  UI.println(UI.Style.TEXT_INFO_BOLD + "Input" + UI.Style.TEXT_NORMAL)
  UI.println("    !cmd             run a shell command locally")
  UI.println("    @path            attach files to your message")
  UI.println(UI.Style.TEXT_DIM + "  Full-screen UI: localcoder tui" + UI.Style.TEXT_NORMAL)
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
      const parsed = ctx.model ? parseModelRef(ctx.model) : undefined
      UI.println(`  cwd:      ${ctx.directory}`)
      UI.println(`  session:  ${shortSession(ctx.sessionID)}`)
      UI.println(`  provider: ${parsed?.providerID ?? ctx.providerID ?? "(none)"}`)
      UI.println(`  model:    ${ctx.model ?? "(default)"}`)
      UI.println(`  agent:    ${ctx.agent ?? "(default)"}`)
      UI.println(`  think:    ${ctx.thinking ? "on" : "off"}`)
      UI.println(`  perms:    ${ctx.permissionMode}`)
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

    case "connect": {
      await runConnectFlow(sdk, ctx.providerID)
      return "continue"
    }

    case "llama": {
      await runLlamaFlow()
      return "continue"
    }

    case "context":
    case "ctx":
    case "tokens": {
      if (!ctx.sessionID) {
        UI.println(UI.Style.TEXT_WARNING + "No active session. Use /new or /resume." + UI.Style.TEXT_NORMAL)
        return "continue"
      }
      await showSessionContext(sdk, ctx.sessionID, ctx.directory)
      return "continue"
    }

    case "providers":
    case "provider":
    case "connectors":
    case "connector": {
      if (!args) {
        const data = await fetchProviderList(sdk)
        if (data) printProviders(data)
        const picked = await pickProvider(sdk, ctx.providerID)
        if (picked) {
          ctx.providerID = picked
          const data2 = await fetchProviderList(sdk)
          const def = data2?.default[picked]
          if (def) {
            ctx.model = `${picked}/${def}`
            UI.println(UI.Style.TEXT_SUCCESS + `Provider: ${picked} · model: ${ctx.model}` + UI.Style.TEXT_NORMAL)
          } else {
            UI.println(UI.Style.TEXT_SUCCESS + `Provider: ${picked} — use /model to choose a model` + UI.Style.TEXT_NORMAL)
          }
        }
        return "continue"
      }
      ctx.providerID = args.split(/\s+/)[0]
      UI.println(UI.Style.TEXT_SUCCESS + `Provider: ${ctx.providerID}` + UI.Style.TEXT_NORMAL)
      return "continue"
    }

    case "model": {
      if (args) {
        const ref = parseModelRef(args.trim())
        if (!ref) {
          UI.println(UI.Style.TEXT_WARNING + "Use provider/model (e.g. llamacpp/local)" + UI.Style.TEXT_NORMAL)
          return "continue"
        }
        ctx.providerID = ref.providerID
        ctx.model = args.trim()
        UI.println(UI.Style.TEXT_SUCCESS + `Model: ${ctx.model}` + UI.Style.TEXT_NORMAL)
        return "continue"
      }
      const providerID = ctx.providerID ?? (ctx.model ? parseModelRef(ctx.model)?.providerID : undefined)
      const picked = await pickModel(sdk, { providerID, connectedOnly: true })
      if (picked) {
        const ref = parseModelRef(picked)
        if (ref) ctx.providerID = ref.providerID
        ctx.model = picked
        UI.println(UI.Style.TEXT_SUCCESS + `Model: ${ctx.model}` + UI.Style.TEXT_NORMAL)
      }
      return "continue"
    }

    case "agent": {
      const { select, isCancel } = await import("@clack/prompts")
      if (args) {
        ctx.agent = args
        UI.println(UI.Style.TEXT_SUCCESS + `Agent: ${ctx.agent}` + UI.Style.TEXT_NORMAL)
        return "continue"
      }
      const agents = await sdk.app.agents()
      const list = (agents.data ?? []).filter((a) => a.mode !== "subagent")
      if (list.length === 0) return "continue"
      const picked = await select({
        message: "Agent",
        options: list.map((a) => ({
          value: a.name,
          label: `${a.name}${a.description ? ` — ${a.description}` : ""}`,
        })),
      })
      if (!isCancel(picked)) {
        ctx.agent = String(picked)
        UI.println(UI.Style.TEXT_SUCCESS + `Agent: ${ctx.agent}` + UI.Style.TEXT_NORMAL)
      }
      return "continue"
    }

    case "sessions": {
      const list = await sdk.session.list({ directory: ctx.directory })
      const rows = list.data ?? []
      if (rows.length === 0) {
        UI.println(UI.Style.TEXT_DIM + "  (no sessions)" + UI.Style.TEXT_NORMAL)
      }
      for (const s of rows) {
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
  UI.println(UI.Style.TEXT_WARNING_BOLD + "Permission" + UI.Style.TEXT_NORMAL)
  UI.println(`  ${req.permission}${req.patterns?.length ? ` · ${req.patterns.join(", ")}` : ""}`)
  if (req.metadata?.filepath) UI.println(UI.Style.TEXT_DIM + `  ${req.metadata.filepath}` + UI.Style.TEXT_NORMAL)
  UI.empty()

  const answer = (await ask("  Allow? (y)es / (n)o / (a)lways: ")).trim().toLowerCase()
  if (answer === "a" || answer === "always") return "always"
  if (answer === "y" || answer === "yes") return "once"
  return "reject"
}
