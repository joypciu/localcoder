import { spawnSync } from "child_process"
import { isCancel, select } from "@clack/prompts"
import { UI } from "@/cli/ui"
import type { localcoderClient } from "@localcoder-ai/sdk/v2"
import { fetchProviderList, pickProvider } from "./provider-pick"

const CLOUD_HINTS = [
  { id: "opencode-go", label: "OpenCode Go" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI" },
  { id: "groq", label: "Groq" },
  { id: "fireworks-ai", label: "Fireworks" },
] as const

function resolveLocalcoderBin(): string {
  const fromPath = spawnSync(process.platform === "win32" ? "where" : "which", ["localcoder"], {
    encoding: "utf-8",
    shell: true,
  })
  const line = fromPath.stdout?.trim().split(/\r?\n/)[0]
  if (line && line.length > 0) return line
  return process.execPath.endsWith("bun") ? "bun" : "localcoder"
}

function runLocalcoder(args: string[]) {
  const bin = resolveLocalcoderBin()
  if (bin === "bun") {
    return spawnSync(bin, ["run", "--conditions=browser", process.argv[1] ?? "src/index.ts", ...args], {
      cwd: process.cwd(),
      encoding: "utf-8",
      stdio: "inherit",
      shell: true,
    })
  }
  return spawnSync(bin, args, { encoding: "utf-8", stdio: "inherit", shell: true })
}

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
    UI.println(UI.Style.TEXT_DIM + "  Starting llamacpp setup…" + UI.Style.TEXT_NORMAL)
    runLocalcoder(["llamacpp", "setup"])
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
  runLocalcoder(["providers", "login", String(cloud)])
}

export async function runLlamaFlow() {
  UI.println(UI.Style.TEXT_INFO_BOLD + "llama.cpp" + UI.Style.TEXT_NORMAL)
  UI.empty()
  const status = spawnSync(resolveLocalcoderBin(), ["llamacpp", "status"], {
    encoding: "utf-8",
    shell: true,
    maxBuffer: 2 * 1024 * 1024,
  })
  if (status.stdout?.trim()) {
    UI.println(status.stdout.trimEnd())
    UI.empty()
  }
  if (status.stderr?.trim()) {
    UI.println(UI.Style.TEXT_WARNING + status.stderr.trimEnd() + UI.Style.TEXT_NORMAL)
  }
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
  runLocalcoder(["llamacpp", String(action)])
}

export async function showSessionContext(sdk: localcoderClient, sessionID: string, directory: string) {
  const messages = await sdk.session.messages({ sessionID, directory })
  let tokens = 0
  let lastModel: string | undefined
  for (const row of messages.data ?? []) {
    if (row.info.role === "assistant" && "tokens" in row.info && row.info.tokens) {
      const t = row.info.tokens as { total?: number }
      tokens += t.total ?? 0
      if ("providerID" in row.info && "modelID" in row.info) {
        lastModel = `${row.info.providerID}/${row.info.modelID}`
      }
    }
  }
  UI.println(UI.Style.TEXT_INFO_BOLD + "Context" + UI.Style.TEXT_NORMAL)
  UI.println(`  session:  ${sessionID}`)
  if (lastModel) UI.println(`  model:    ${lastModel}`)
  if (tokens > 0) {
    UI.println(`  tokens:   ~${tokens.toLocaleString()} (assistant total)`)
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
