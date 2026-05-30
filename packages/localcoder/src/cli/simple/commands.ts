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
import { applySessionMeterToContext } from "./session-meter"
import { runConnectFlow, runLlamaFlow, showSessionContext } from "./setup-commands"
import { hint, section } from "./display"
import { printShortcuts, printTip, randomTip } from "./hints"
import {
  activateSession,
  clearSessionHistory,
  confirmYes,
  deleteHistoryMessage,
  deleteSessionById,
  fetchHistoryRows,
  fetchSessionRows,
  pickSessionInteractive,
  printHistory,
  printSearchHits,
  printSessionTable,
  resolveHistoryRef,
  resolveSessionRef,
  runSessionSearch,
  showCurrentSession,
} from "./session-mgmt"

export type CommandEnv = {
  sdk: localcoderClient
  ctx: ReplContext
  ask: (prompt: string) => Promise<string>
}

function printHelp() {
  section("Session")
  hint(
    "/new — fresh session · /session — switch (picker)",
    "/sessions · /resume <id> · /search <query>",
    "/history · /history-delete · /clear-history",
    "/delete-session · /rename-session · /revert · /fork · /compact",
  )
  section("Setup")
  hint(
    "/connect · /llama · /providers · /model [id] · /agent [name] · /status",
  )
  section("Other")
  hint(
    "/thinking — reasoning panel with live seconds",
    "/timing — show or hide turn duration footer",
    "/tips — hints (/tips off to disable rotation)",
    "/permissions — ask → accept → reject",
    "/shortcuts — quick reference",
    "/commands · /help · /exit",
  )
  section("Input")
  hint("!cmd — local shell", "@path — attach files", "Full UI: localcoder tui")
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
      UI.println(`  think:    ${ctx.thinking ? "on (◆ panel)" : "off"}`)
      UI.println(`  timing:   ${ctx.showTiming ? "on" : "off"}`)
      UI.println(`  tips:     ${ctx.showTips ? "on" : "off"}`)
      UI.println(`  perms:    ${ctx.permissionMode}`)
      return "continue"
    }

    case "thinking":
    case "think":
      ctx.thinking = !ctx.thinking
      UI.println(
        UI.Style.TEXT_SUCCESS +
          `Thinking ${ctx.thinking ? "on" : "off"} — ${ctx.thinking ? "◆ panel with elapsed seconds" : "hidden"}.` +
          UI.Style.TEXT_NORMAL,
      )
      return "continue"

    case "timing": {
      if (args === "off") ctx.showTiming = false
      else if (args === "on") ctx.showTiming = true
      else ctx.showTiming = !ctx.showTiming
      UI.println(
        UI.Style.TEXT_SUCCESS +
          `Turn timing ${ctx.showTiming ? "on" : "off"} (footer shows ⏱ after each reply).` +
          UI.Style.TEXT_NORMAL,
      )
      return "continue"
    }

    case "tips": {
      if (args === "off") {
        ctx.showTips = false
        UI.println(UI.Style.TEXT_SUCCESS + "Rotating tips off." + UI.Style.TEXT_NORMAL)
        return "continue"
      }
      if (args === "on") {
        ctx.showTips = true
        UI.println(UI.Style.TEXT_SUCCESS + "Rotating tips on." + UI.Style.TEXT_NORMAL)
        return "continue"
      }
      printTip(args.trim() || randomTip())
      return "continue"
    }

    case "shortcuts":
    case "keys":
      printShortcuts()
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
      const rows = await fetchSessionRows(sdk, ctx.directory, 40)
      UI.println(UI.Style.TEXT_INFO_BOLD + "Sessions" + UI.Style.TEXT_NORMAL)
      printSessionTable(rows, ctx.sessionID, true)
      UI.println(UI.Style.TEXT_DIM + "  /session to switch · /delete-session <#|id>" + UI.Style.TEXT_NORMAL)
      return "continue"
    }

    case "session":
    case "switch": {
      if (args === "info" || args === "current") {
        await showCurrentSession(sdk, ctx)
        return "continue"
      }
      if (!args) {
        const picked = await pickSessionInteractive(sdk, ctx, env.ask, {
          message: "Switch session",
          includeNew: true,
        })
        if (!picked) return "continue"
        if (picked === "__new__") {
          ctx.sessionID = undefined
          ctx.continueSession = false
          ctx.meterShort = undefined
          UI.println(UI.Style.TEXT_SUCCESS + "New session — next message starts fresh." + UI.Style.TEXT_NORMAL)
          return "continue"
        }
        await activateSession(sdk, ctx, picked)
        UI.println(UI.Style.TEXT_SUCCESS + `Switched to ${shortSession(picked)}` + UI.Style.TEXT_NORMAL)
        return "continue"
      }
      const rows = await fetchSessionRows(sdk, ctx.directory, 50)
      const resolved = resolveSessionRef(args.split(/\s+/)[0]!, rows)
      if (!resolved) {
        UI.println(UI.Style.TEXT_WARNING + `No session matching "${args}"` + UI.Style.TEXT_NORMAL)
        return "continue"
      }
      await activateSession(sdk, ctx, resolved.id)
      UI.println(UI.Style.TEXT_SUCCESS + `Switched to ${shortSession(resolved.id)}` + UI.Style.TEXT_NORMAL)
      return "continue"
    }

    case "resume": {
      if (!args) {
        UI.println(UI.Style.TEXT_WARNING + "Usage: /resume <#|session-id> or /session to pick" + UI.Style.TEXT_NORMAL)
        return "continue"
      }
      const rows = await fetchSessionRows(sdk, ctx.directory, 50)
      const resolved = resolveSessionRef(args.split(/\s+/)[0]!, rows)
      if (!resolved) {
        UI.println(UI.Style.TEXT_WARNING + `No session matching "${args}"` + UI.Style.TEXT_NORMAL)
        return "continue"
      }
      await activateSession(sdk, ctx, resolved.id)
      UI.println(UI.Style.TEXT_SUCCESS + `Resumed ${shortSession(resolved.id)}` + UI.Style.TEXT_NORMAL)
      return "continue"
    }

    case "search": {
      if (!args.trim()) {
        UI.println(UI.Style.TEXT_WARNING + "Usage: /search <query>" + UI.Style.TEXT_NORMAL)
        return "continue"
      }
      const hits = runSessionSearch(args.trim(), ctx.directory, 20)
      UI.println(UI.Style.TEXT_INFO_BOLD + `Search: ${args.trim()}` + UI.Style.TEXT_NORMAL)
      printSearchHits(hits, ctx.directory, ctx.sessionID)
      UI.println(UI.Style.TEXT_DIM + "  /resume <id> or /session to open" + UI.Style.TEXT_NORMAL)
      return "continue"
    }

    case "history":
    case "messages": {
      if (!ctx.sessionID) {
        UI.println(UI.Style.TEXT_WARNING + "No active session." + UI.Style.TEXT_NORMAL)
        return "continue"
      }
      const limit = args.trim() ? Math.min(Number.parseInt(args, 10) || 30, 80) : 30
      const rows = await fetchHistoryRows(sdk, ctx, limit)
      printHistory(rows, ctx.sessionID)
      return "continue"
    }

    case "history-delete":
    case "delete-history":
    case "history-rm": {
      if (!ctx.sessionID) {
        UI.println(UI.Style.TEXT_WARNING + "No active session." + UI.Style.TEXT_NORMAL)
        return "continue"
      }
      const rows = await fetchHistoryRows(sdk, ctx, 80)
      const ref = args.trim() || "last"
      const row = resolveHistoryRef(ref, rows)
      if (!row) {
        UI.println(UI.Style.TEXT_WARNING + `No message matching "${ref}" (see /history)` + UI.Style.TEXT_NORMAL)
        return "continue"
      }
      if (!(await confirmYes(env.ask, `  Delete #${row.index} ${row.role} message? (y/n): `))) {
        UI.println(UI.Style.TEXT_DIM + "  Cancelled." + UI.Style.TEXT_NORMAL)
        return "continue"
      }
      await deleteHistoryMessage(sdk, ctx, row.id)
      return "continue"
    }

    case "clear-history":
    case "history-clear":
    case "wipe-history": {
      if (!ctx.sessionID) {
        UI.println(UI.Style.TEXT_WARNING + "No active session." + UI.Style.TEXT_NORMAL)
        return "continue"
      }
      if (!(await confirmYes(env.ask, "  Delete ALL messages in this session? (y/n): "))) {
        UI.println(UI.Style.TEXT_DIM + "  Cancelled." + UI.Style.TEXT_NORMAL)
        return "continue"
      }
      UI.println(UI.Style.TEXT_DIM + "  Clearing history…" + UI.Style.TEXT_NORMAL)
      const n = await clearSessionHistory(sdk, ctx)
      UI.println(UI.Style.TEXT_SUCCESS + `Cleared ${n} message(s). Session kept.` + UI.Style.TEXT_NORMAL)
      return "continue"
    }

    case "delete-session":
    case "session-delete":
    case "del-session": {
      const rows = await fetchSessionRows(sdk, ctx.directory, 40)
      let target: string | undefined
      if (!args.trim()) {
        UI.println(UI.Style.TEXT_INFO_BOLD + "Delete session" + UI.Style.TEXT_NORMAL)
        printSessionTable(rows, ctx.sessionID, true)
        const raw = (await env.ask(UI.Style.TEXT_HIGHLIGHT + "  # or id to delete (empty=cancel): " + UI.Style.TEXT_NORMAL)).trim()
        if (!raw) return "continue"
        const num = Number.parseInt(raw, 10)
        if (!Number.isNaN(num) && num >= 1 && num <= rows.length) {
          target = rows[num - 1]!.id
        } else {
          target = resolveSessionRef(raw, rows)?.id
        }
      } else {
        target = resolveSessionRef(args.split(/\s+/)[0]!, rows)?.id
      }
      if (!target) {
        UI.println(UI.Style.TEXT_WARNING + "Session not found." + UI.Style.TEXT_NORMAL)
        return "continue"
      }
      if (!(await confirmYes(env.ask, `  Permanently delete ${shortSession(target)}? (y/n): `))) {
        UI.println(UI.Style.TEXT_DIM + "  Cancelled." + UI.Style.TEXT_NORMAL)
        return "continue"
      }
      await deleteSessionById(sdk, ctx, target)
      return "continue"
    }

    case "rename-session":
    case "session-rename": {
      const trimmed = args.trim()
      if (!trimmed) {
        if (!ctx.sessionID) {
          UI.println(UI.Style.TEXT_WARNING + "No active session." + UI.Style.TEXT_NORMAL)
          return "continue"
        }
        const newTitle = (await env.ask("  New title: ")).trim()
        if (!newTitle) return "continue"
        await sdk.session.update({ sessionID: ctx.sessionID, title: newTitle, directory: ctx.directory })
        UI.println(UI.Style.TEXT_SUCCESS + `Renamed to "${newTitle}".` + UI.Style.TEXT_NORMAL)
        return "continue"
      }
      const rows = await fetchSessionRows(sdk, ctx.directory, 50)
      const first = trimmed.split(/\s+/)[0]!
      const byRef = resolveSessionRef(first, rows)
      const sessionID = byRef && trimmed.length > first.length ? byRef.id : ctx.sessionID
      const title = byRef && trimmed.length > first.length ? trimmed.slice(first.length).trim() : trimmed
      if (!sessionID) {
        UI.println(UI.Style.TEXT_WARNING + "No active session — use /rename-session <ses-id> <title>" + UI.Style.TEXT_NORMAL)
        return "continue"
      }
      if (!title) {
        UI.println(UI.Style.TEXT_WARNING + "Missing title." + UI.Style.TEXT_NORMAL)
        return "continue"
      }
      await sdk.session.update({ sessionID, title, directory: ctx.directory })
      UI.println(UI.Style.TEXT_SUCCESS + `Renamed to "${title}".` + UI.Style.TEXT_NORMAL)
      return "continue"
    }

    case "revert": {
      if (!ctx.sessionID) {
        UI.println(UI.Style.TEXT_WARNING + "No active session." + UI.Style.TEXT_NORMAL)
        return "continue"
      }
      const rows = await fetchHistoryRows(sdk, ctx, 80)
      const ref = args.trim() || "last"
      const row = resolveHistoryRef(ref, rows)
      if (!row) {
        UI.println(UI.Style.TEXT_WARNING + `No message matching "${ref}"` + UI.Style.TEXT_NORMAL)
        return "continue"
      }
      if (!(await confirmYes(env.ask, `  Revert from message #${row.index} (undoes file changes)? (y/n): `))) {
        return "continue"
      }
      await sdk.session.revert({
        sessionID: ctx.sessionID,
        messageID: row.id,
        directory: ctx.directory,
      })
      UI.println(UI.Style.TEXT_SUCCESS + "Reverted — file changes undone for that turn." + UI.Style.TEXT_NORMAL)
      return "continue"
    }

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
      await sdk.session.summarize({ sessionID: ctx.sessionID, directory: ctx.directory })
      const meter = await applySessionMeterToContext(sdk, ctx)
      UI.println(UI.Style.TEXT_SUCCESS + "Session compacted." + UI.Style.TEXT_NORMAL)
      if (meter?.short) {
        UI.println(UI.Style.TEXT_DIM + `  context: ${meter.short}` + UI.Style.TEXT_NORMAL)
      }
      UI.println(
        UI.Style.TEXT_DIM +
          "  Token count updates on the next assistant reply (or run /context)." +
          UI.Style.TEXT_NORMAL,
      )
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
  UI.println(UI.Style.TEXT_WARNING_BOLD + "  ⚠ Permission required" + UI.Style.TEXT_NORMAL)
  UI.println(UI.Style.TEXT_DIM + "  ────────────────────────────────────────" + UI.Style.TEXT_NORMAL)
  UI.println(`  ${req.permission}${req.patterns?.length ? ` · ${req.patterns.join(", ")}` : ""}`)
  if (req.metadata?.filepath) {
    UI.println(UI.Style.TEXT_DIM + `  file: ${req.metadata.filepath}` + UI.Style.TEXT_NORMAL)
  }
  UI.println(UI.Style.TEXT_DIM + "  ────────────────────────────────────────" + UI.Style.TEXT_NORMAL)
  UI.empty()

  const answer = (await ask(UI.Style.TEXT_HIGHLIGHT + "  Allow? (y/n/a): " + UI.Style.TEXT_NORMAL)).trim().toLowerCase()
  if (answer === "a" || answer === "always") return "always"
  if (answer === "y" || answer === "yes") return "once"
  return "reject"
}
