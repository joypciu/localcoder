import { UI } from "@/cli/ui"
import { hint, section } from "./display"
import type { ReplContext } from "./context"

export const TIPS: readonly string[] = [
  "Attach files with @path/to/file — multiple @ refs in one message.",
  "Run local commands with !git status (does not go to the agent).",
  "/compact shrinks long sessions — use when context meter is high.",
  "/context shows token usage; the status line updates after each reply.",
  "/fork on the next message branches the session for experiments.",
  "/permissions cycles ask → accept → reject for tool approvals.",
  "Ctrl+C once cancels the current turn; twice exits the REPL.",
  "/connect sets up llama.cpp; /model picks a model from connected providers.",
  "/thinking toggles the reasoning panel (llamacpp supports chain-of-thought).",
  "/timing toggles turn duration in the footer.",
  "Project commands: /commands lists custom slash commands.",
  "Full-screen UI: run localcoder tui in another terminal.",
  "Resume old work: /sessions then /resume <#> or /session to pick.",
  "/history lists turns; /history-delete last removes one message.",
  "/clear-history wipes messages but keeps the session.",
  "/delete-session removes a session entirely (picker if no id).",
  "/search <words> finds sessions by title or content.",
  "/revert last undoes file changes from that turn.",
  "/status shows cwd, model, agent, and permission mode.",
  "High context warning on the footer means /compact soon.",
]

export function tipAt(index: number) {
  return TIPS[((index % TIPS.length) + TIPS.length) % TIPS.length]!
}

export function randomTip() {
  return TIPS[Math.floor(Math.random() * TIPS.length)]!
}

export function printTip(text?: string) {
  UI.empty()
  UI.println(UI.Style.TEXT_INFO_BOLD + "Tip" + UI.Style.TEXT_NORMAL)
  hint(text ?? randomTip())
  UI.println(UI.Style.TEXT_DIM + "  /tips for another · tips rotate each turn" + UI.Style.TEXT_NORMAL)
  UI.empty()
}

export function printShortcuts() {
  section("Essentials")
  hint("› message", "!shell", "@file", "/help")
  section("Session")
  hint(
    "/new · /session · /sessions · /resume · /search",
    "/history · /history-delete · /clear-history · /delete-session",
    "/rename-session · /revert · /fork · /compact · /context",
  )
  section("Setup")
  hint("/connect · /llama · /providers · /model · /agent · /status")
  section("Display")
  hint("/thinking · /timing · /tips · /permissions")
  UI.empty()
}

/** Subtle hint after a successful turn (not every turn — every 2nd when enabled). */
export function maybeTurnTip(ctx: ReplContext) {
  if (!ctx.showTips) return
  ctx.turnCount++
  if (ctx.turnCount % 2 !== 0) return
  UI.println(UI.Style.TEXT_DIM + "  tip: " + tipAt(ctx.turnCount) + UI.Style.TEXT_NORMAL)
}
