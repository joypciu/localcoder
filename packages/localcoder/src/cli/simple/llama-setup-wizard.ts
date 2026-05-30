import path from "path"
import fs from "fs"
import { isCancel, select, text } from "@clack/prompts"
import { UI } from "@/cli/ui"
import * as Bootstrap from "@/llamacpp/bootstrap"
import * as Setup from "@/llamacpp/setup"
import * as Server from "@/llamacpp/server"

function validateLlamaDir(dir: string) {
  const exe = path.join(dir, process.platform === "win32" ? "llama-server.exe" : "llama-server")
  if (!fs.existsSync(exe)) return `llama-server not found in ${dir}`
  return undefined
}

/** In-process llama.cpp wizard for the simple REPL (no subprocess / Effect.fn nesting). */
export type LlamaSetupResult = {
  ok: boolean
  /** Saved llamacpp.json thinking flag (REPL /thinking display). */
  thinking?: boolean
}

export async function runLlamaInteractiveSetup(): Promise<LlamaSetupResult> {
  const saved = Setup.loadUserLlamaConfig()
  UI.empty()
  UI.println(UI.Style.TEXT_INFO_BOLD + "llama.cpp setup" + UI.Style.TEXT_NORMAL)
  UI.println("Pick your llama.cpp folder (must contain llama-server) and a GGUF model.")
  UI.println(UI.Style.TEXT_DIM + "  LocalCoder saves paths and can start the server for you." + UI.Style.TEXT_NORMAL)
  UI.empty()

  const dirDefault = saved.llamaDir ?? Setup.resolveLlamaDir()
  const dirAnswer = await text({
    message: "llama.cpp folder",
    placeholder: dirDefault,
    defaultValue: dirDefault,
    validate: (v) => validateLlamaDir((v ?? dirDefault).trim() || dirDefault),
  })
  if (isCancel(dirAnswer)) return { ok: false }
  const llamaDir = (dirAnswer ?? dirDefault).trim() || dirDefault

  const discovered = Setup.findGgufFiles(24)
  let modelPath = saved.modelPath ?? Setup.resolveModelPath() ?? ""

  if (discovered.length > 0) {
    const picked = await select({
      message: "GGUF model",
      options: [
        ...discovered.map((p) => ({
          value: p,
          label: path.basename(p),
          hint: p,
        })),
        { value: "__manual__", label: "Enter path manually…" },
      ],
    })
    if (isCancel(picked)) return { ok: false }
    if (picked !== "__manual__") modelPath = picked
  }

  if (!modelPath || !modelPath.toLowerCase().endsWith(".gguf")) {
    const manual = await text({
      message: "Path to .gguf model",
      placeholder: modelPath || "C:\\models\\model.gguf",
      defaultValue: modelPath || undefined,
      validate: (v) => {
        const p = (v ?? "").trim()
        if (!p.toLowerCase().endsWith(".gguf")) return "Must be a .gguf file"
        if (!fs.existsSync(p)) return "File not found"
        return undefined
      },
    })
    if (isCancel(manual)) return { ok: false }
    modelPath = (manual ?? "").trim()
  }

  const ctxDefault = Setup.defaultContextSize(modelPath)
  const ctxPick = await select({
    message: "Context size (tokens)",
    options: [
      ...Setup.CONTEXT_PRESETS.map((n) => ({ value: String(n), label: String(n) })),
      { value: "custom", label: "Custom…" },
    ],
    initialValue: Setup.CONTEXT_PRESETS.includes(ctxDefault as (typeof Setup.CONTEXT_PRESETS)[number])
      ? String(ctxDefault)
      : "16384",
  })
  if (isCancel(ctxPick)) return { ok: false }

  let ctx = ctxPick === "custom" ? 0 : Number(ctxPick)
  if (ctxPick === "custom") {
    const custom = await text({
      message: "Custom context size",
      validate: (v) => {
        const n = Number(v)
        if (!Number.isInteger(n) || n < 512) return "Enter a positive integer (e.g. 16384)"
        return undefined
      },
    })
    if (isCancel(custom)) return { ok: false }
    ctx = Number(custom)
  }

  let thinking: boolean | undefined
  if (Setup.modelSupportsThinkingToggle(modelPath)) {
    const t = await select({
      message: "Thinking / reasoning mode",
      options: [
        { value: "on", label: "Enabled (recommended for Qwen/Qwopus)" },
        { value: "off", label: "Disabled" },
      ],
      initialValue: Setup.resolveThinkingEnabled(modelPath) ? "on" : "off",
    })
    if (isCancel(t)) return { ok: false }
    thinking = t === "on"
  } else {
    thinking = Setup.resolveThinkingEnabled(modelPath)
  }

  UI.println(UI.Style.TEXT_DIM + "  Configuring provider and starting server…" + UI.Style.TEXT_NORMAL)
  try {
    const result = await Bootstrap.configure({
      llamaDir,
      modelPath,
      ctx,
      thinking,
      autoStart: true,
    })
    UI.println(UI.Style.TEXT_SUCCESS + `Model: ${result.model}` + UI.Style.TEXT_NORMAL)
    UI.println(
      UI.Style.TEXT_DIM +
        `  running=${result.running} · api=${result.apiUrl}${result.logPath ? ` · log=${result.logPath}` : ""}` +
        UI.Style.TEXT_NORMAL,
    )
    return { ok: true, thinking }
  } catch (e) {
    UI.println(UI.Style.TEXT_DANGER + (e instanceof Error ? e.message : String(e)) + UI.Style.TEXT_NORMAL)
    return { ok: false }
  }
}

export async function printLlamaStatus() {
  try {
    const status = await Bootstrap.getPublicStatus()
    UI.println(UI.Style.TEXT_INFO_BOLD + "llama.cpp status" + UI.Style.TEXT_NORMAL)
    UI.println(`  running:       ${status.running}`)
    UI.println(`  model:         ${status.modelId ?? "(none)"}`)
    UI.println(`  api:           ${status.apiUrl}`)
    UI.println(`  configured ctx: ${status.configuredCtx}`)
    if (status.runningCtx !== undefined) {
      UI.println(`  server ctx:    ${status.runningCtx}${status.ctxMismatch ? " (≠ saved — restart)" : ""}`)
    }
    if (status.llamaDir) UI.println(`  llama dir:     ${status.llamaDir}`)
    if (status.modelPath) UI.println(`  gguf:          ${status.modelPath}`)
    UI.empty()
  } catch (e) {
    UI.println(UI.Style.TEXT_WARNING + (e instanceof Error ? e.message : String(e)) + UI.Style.TEXT_NORMAL)
  }
}

export async function runLlamaStart(): Promise<void> {
  const saved = Setup.loadUserLlamaConfig()
  if (!saved.llamaDir || !saved.modelPath) {
    UI.println(UI.Style.TEXT_WARNING + "Run setup first (/connect → llama.cpp or /llama → setup)." + UI.Style.TEXT_NORMAL)
    return
  }
  try {
    const started = await Server.start({
      config: { llamaDir: saved.llamaDir, modelPath: saved.modelPath, ctx: saved.ctx },
      forceRestart: false,
    })
    UI.println(UI.Style.TEXT_SUCCESS + `Server ${started.alreadyRunning ? "already running" : "started"} · ${started.modelId}` + UI.Style.TEXT_NORMAL)
  } catch (e) {
    UI.println(UI.Style.TEXT_DANGER + (e instanceof Error ? e.message : String(e)) + UI.Style.TEXT_NORMAL)
  }
}

export async function runLlamaStop(): Promise<void> {
  const stopped = await Server.stopIfManaged()
  UI.println(
    UI.Style.TEXT_SUCCESS + (stopped ? "Stopped managed llama-server." : "No managed llama-server.") + UI.Style.TEXT_NORMAL,
  )
}
