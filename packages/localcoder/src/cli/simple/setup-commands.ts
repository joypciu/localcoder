import { isCancel, select } from "@clack/prompts"
import { UI } from "@/cli/ui"
import type { localcoderClient } from "@localcoder-ai/sdk/v2"
import { runLocalcoderCli } from "./cli-launch"
import {
  printLlamaStatus,
  runLlamaInteractiveSetup,
  runLlamaStart,
  runLlamaStop,
} from "./llama-setup-wizard"
import { tokensFromLastAssistant } from "./session-meter"
import { fetchProviderList, pickProvider } from "./provider-pick"

const CLOUD_HINTS = [
  { id: "opencode-go", label: "OpenCode Go" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI" },
  { id: "groq", label: "Groq" },
  { id: "fireworks-ai", label: "Fireworks" },
] as const

export async function runConnectFlow(sdk: localcoderClient, currentProvider?: string) {
  UI.println(UI.Style.TEXT_INFO_BOLD + "Connect a provider" + UI.Style.TEXT_NORMAL)
  UI.empty()

  const data = await fetchProviderList(sdk)
  if (data) {
    const connected = new Set(data.connected)
    const disconnected = data.all.filter((p) => !connected.has(p.id)).slice(0, 12)
    if (disconnected.length > 0) {
      UI.println(UI.Style.TEXT_DIM + "  Not connected yet:" + UI.Style.TEXT_NORMAL)
      for (const p of disconnected) {
        UI.println(`    ${p.id}`)
      }
      UI.empty()
    }
  }

  const picked = await select({
    message: "Setup path",
    options: [
      { value: "llama", label: "Local — llama.cpp (GGUF)", hint: "runs llamacpp setup wizard" },
      { value: "cloud", label: "Cloud API key", hint: "providers login" },
      { value: "pick", label: "Pick provider from list", hint: "/providers" },
    ],
  })
  if (isCancel(picked)) return

  if (picked === "llama") {
    await runLlamaInteractiveSetup()
    return
  }

  if (picked === "pick") {
    const id = await pickProvider(sdk, currentProvider)
    if (id) {
      UI.println(UI.Style.TEXT_SUCCESS + `Provider: ${id} — use /model next` + UI.Style.TEXT_NORMAL)
    }
    return
  }

  const cloud = await select({
    message: "Cloud provider",
    options: CLOUD_HINTS.map((c) => ({ value: c.id, label: c.label })),
  })
  if (isCancel(cloud)) return

  UI.println(UI.Style.TEXT_DIM + `  Run: localcoder providers login ${cloud}` + UI.Style.TEXT_NORMAL)
  runLocalcoderCli(["providers", "login", String(cloud)])
}

export async function runLlamaFlow() {
  await printLlamaStatus()
  const action = await select({
    message: "llama.cpp",
    options: [
      { value: "setup", label: "Setup wizard (folder + GGUF + context)" },
      { value: "start", label: "Start server" },
      { value: "stop", label: "Stop server" },
      { value: "done", label: "Done" },
    ],
  })
  if (isCancel(action) || action === "done") return
  if (action === "setup") await runLlamaInteractiveSetup()
  else if (action === "start") await runLlamaStart()
  else if (action === "stop") await runLlamaStop()
}

export async function showSessionContext(sdk: localcoderClient, sessionID: string, directory: string) {
  const messages = await sdk.session.messages({ sessionID, directory })
  const rows = messages.data ?? []
  const tokens = tokensFromLastAssistant(rows)
  let lastModel: string | undefined
  for (const row of rows) {
    if (row.info.role === "assistant" && "providerID" in row.info && "modelID" in row.info) {
      lastModel = `${row.info.providerID}/${row.info.modelID}`
    }
  }
  UI.println(UI.Style.TEXT_INFO_BOLD + "Context" + UI.Style.TEXT_NORMAL)
  UI.println(`  session:  ${sessionID}`)
  if (lastModel) UI.println(`  model:    ${lastModel}`)
  if (tokens > 0) {
    UI.println(`  tokens:   ~${tokens.toLocaleString()} (last assistant turn)`)
    UI.println(UI.Style.TEXT_DIM + "  Use /compact when context is high." + UI.Style.TEXT_NORMAL)
  } else {
    UI.println(UI.Style.TEXT_DIM + "  No token usage yet — send a message first." + UI.Style.TEXT_NORMAL)
  }
  UI.empty()
}

export function printFirstRunHint(hasModel: boolean, connectedCount: number) {
  if (hasModel && connectedCount > 0) return
  UI.empty()
  UI.println(UI.Style.TEXT_WARNING_BOLD + "Setup required" + UI.Style.TEXT_NORMAL)
  if (connectedCount === 0) {
    UI.println(UI.Style.TEXT_DIM + "  Run /connect for llama.cpp or a cloud API key." + UI.Style.TEXT_NORMAL)
    UI.println(UI.Style.TEXT_DIM + "  Or: localcoder llamacpp setup · localcoder providers login <id>" + UI.Style.TEXT_NORMAL)
  } else {
    UI.println(UI.Style.TEXT_DIM + "  Run /model to choose a model for your provider." + UI.Style.TEXT_NORMAL)
  }
  UI.println(UI.Style.TEXT_DIM + "  Legacy full UI: localcoder tui" + UI.Style.TEXT_NORMAL)
  UI.empty()
}
