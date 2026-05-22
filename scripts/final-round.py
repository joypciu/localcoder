from pathlib import Path

PKG = Path(r"P:/localcoder/packages/localcoder")
SCRIPTS = Path(r"P:/localcoder/scripts")

# llama-server.ts
(PKG / "src/cli/cmd/tui/llama-server.ts").write_text(r'''import { spawn, type ChildProcess } from "child_process"
import fs from "fs"
import path from "path"
import os from "os"

export type LlamaServerConfig = {
  llamaDir: string
  modelPath: string
  serverExe: string
  apiUrl: string
  port: number
  ctx: number
}

export type LlamaServerStatus = {
  running: boolean
  modelId?: string
  managed: boolean
  apiUrl: string
  logPath?: string
}

let managed: ChildProcess | undefined
let logPath: string | undefined

const DEFAULT_LLAMA_DIR =
  process.env.LOCALCODER_LLAMACPP_DIR ?? String.raw`P:\llama cpp\llama-b9284-bin-win-cuda-13.1-x64`
const DEFAULT_MODEL =
  process.env.LOCALCODER_LLAMACPP_MODEL ??
  String.raw`P:\gguf models\Qwen3.6-35B-A3B-Claude-4.7-Opus-Reasoning-Distilled.IQ4_XS.gguf`

export function getConfig(): LlamaServerConfig {
  const apiUrl = process.env.LLAMACPP_API_URL ?? "http://127.0.0.1:8080/v1"
  const llamaDir = DEFAULT_LLAMA_DIR
  return {
    llamaDir,
    modelPath: DEFAULT_MODEL,
    serverExe: path.join(llamaDir, process.platform === "win32" ? "llama-server.exe" : "llama-server"),
    apiUrl,
    port: Number(new URL(apiUrl).port || 8080),
    ctx: Number(process.env.LLAMACPP_CTX ?? 2048),
  }
}

export async function probe(apiUrl = getConfig().apiUrl): Promise<{ ok: boolean; modelId?: string }> {
  try {
    const res = await fetch(`${apiUrl}/models`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return { ok: false }
    const data = (await res.json()) as { data?: Array<{ id: string }> }
    const modelId = data.data?.[0]?.id
    return { ok: Boolean(modelId), modelId }
  } catch {
    return { ok: false }
  }
}

export async function waitReady(input?: { apiUrl?: string; timeoutMs?: number }): Promise<string> {
  const apiUrl = input?.apiUrl ?? getConfig().apiUrl
  const timeoutMs = input?.timeoutMs ?? 600_000
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const result = await probe(apiUrl)
    if (result.ok && result.modelId) return result.modelId
    await Bun.sleep(2000)
  }
  throw new Error("llama-server did not become ready in time")
}

export function isManaged() {
  return managed !== undefined
}

export function getLogPath() {
  return logPath
}

export async function start(input?: {
  config?: Partial<LlamaServerConfig>
  onLine?: (line: string) => void
}): Promise<{ modelId: string; alreadyRunning: boolean }> {
  const cfg = { ...getConfig(), ...input?.config }
  if (!fs.existsSync(cfg.serverExe)) {
    throw new Error(`llama-server not found: ${cfg.serverExe}`)
  }
  if (!fs.existsSync(cfg.modelPath)) {
    throw new Error(`GGUF model not found: ${cfg.modelPath}`)
  }

  const existing = await probe(cfg.apiUrl)
  if (existing.ok && existing.modelId) {
    return { modelId: existing.modelId, alreadyRunning: true }
  }

  if (managed) {
    throw new Error("LocalCoder already started a llama-server process in this session")
  }

  logPath = path.join(os.tmpdir(), `localcoder-llama-server-${process.pid}.log`)
  const logStream = fs.createWriteStream(logPath, { flags: "a" })

  const args = ["-m", cfg.modelPath, "--host", "127.0.0.1", "--port", String(cfg.port), "-c", String(cfg.ctx)]

  managed = spawn(cfg.serverExe, args, {
    cwd: cfg.llamaDir,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  })

  const write = (chunk: Buffer) => {
    const text = chunk.toString()
    logStream.write(text)
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) input?.onLine?.(line)
    }
  }
  managed.stdout?.on("data", write)
  managed.stderr?.on("data", write)
  managed.on("exit", (code) => {
    if (managed) managed = undefined
    logStream.end()
    if (code !== 0 && code !== null) {
      input?.onLine?.(`llama-server exited with code ${code}`)
    }
  })

  const modelId = await waitReady({ apiUrl: cfg.apiUrl })
  return { modelId, alreadyRunning: false }
}

export function stopIfManaged() {
  if (!managed) return false
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(managed.pid), "/f", "/t"], { stdio: "ignore" })
    } else {
      managed.kill("SIGTERM")
    }
  } catch {}
  managed = undefined
  return true
}

export async function status(): Promise<LlamaServerStatus> {
  const cfg = getConfig()
  const probed = await probe(cfg.apiUrl)
  return {
    running: probed.ok,
    modelId: probed.modelId,
    managed: isManaged(),
    apiUrl: cfg.apiUrl,
    logPath,
  }
}

export function modelRef(modelId: string) {
  return `llamacpp/${modelId}`
}

export * as LlamaServer from "./llama-server"
''', encoding='utf-8')

# Fix export - can't export from same file as namespace. Remove last line and use named exports only
t = (PKG / "src/cli/cmd/tui/llama-server.ts").read_text(encoding='utf-8')
t = t.replace('\nexport * as LlamaServer from "./llama-server"\n', '\n')
(PKG / "src/cli/cmd/tui/llama-server.ts").write_text(t, encoding='utf-8')

# dialog-llama.tsx
(PKG / "src/cli/cmd/tui/component/dialog-llama.tsx").write_text(r'''import { createMemo, createSignal, Show } from "solid-js"
import { DialogSelect } from "@tui/ui/dialog-select"
import { useTheme } from "@tui/context/theme"
import { useToast } from "@tui/ui/toast"
import { useSync } from "@tui/context/sync"
import { useLocal } from "@tui/context/local"
import { useDialog } from "@tui/ui/dialog"
import * as LlamaServer from "@tui/llama-server"
import { DialogAlert } from "@tui/ui/dialog-alert"

export function DialogLlama() {
  const { theme } = useTheme()
  const toast = useToast()
  const sync = useSync()
  const local = useLocal()
  const dialog = useDialog()
  const [loading, setLoading] = createSignal(false)
  const [status, setStatus] = createSignal<LlamaServer.LlamaServerStatus | undefined>()

  const refresh = () => {
    void LlamaServer.status().then(setStatus)
  }
  refresh()

  const cfg = createMemo(() => LlamaServer.getConfig())
  const statusText = createMemo(() => {
    const s = status()
    if (!s) return "Checking..."
    if (s.running) return `Running · ${s.modelId ?? "unknown model"}${s.managed ? " (managed)" : ""}`
    return "Not running"
  })

  async function afterStart(modelId: string) {
    process.env.LLAMACPP_API_URL = cfg().apiUrl
    await sync.bootstrap({ fatal: false }).catch(() => undefined)
    local.model.set({ providerID: "llamacpp", modelID: modelId } as any)
    toast.show({
      message: `llama.cpp ready — model ${modelId}`,
      variant: "success",
      duration: 6000,
    })
    refresh()
    dialog.clear()
  }

  return (
    <DialogSelect
      title="llama.cpp"
      options={[
        {
          title: "Start server",
          value: "start",
          description: "Load GGUF with auto GPU fit (first start may take a few minutes)",
          disabled: loading() || status()?.running === true,
        },
        {
          title: "Stop managed server",
          value: "stop",
          description: "Only stops a server started by /llama in this TUI session",
          disabled: loading() || !status()?.managed,
        },
        {
          title: "Refresh status",
          value: "refresh",
          description: statusText(),
        },
        {
          title: "View log path",
          value: "log",
          description: status()?.logPath ?? "No log until started from here",
          disabled: !status()?.logPath,
        },
      ]}
      onSelect={(option) => {
        void (async () => {
          if (option.value === "refresh") {
            refresh()
            return
          }
          if (option.value === "log" && status()?.logPath) {
            await DialogAlert.show(dialog, "llama-server log", status()!.logPath!)
            return
          }
          if (option.value === "stop") {
            LlamaServer.stopIfManaged()
            toast.show({ message: "llama-server stopped", variant: "info" })
            refresh()
            return
          }
          if (option.value === "start") {
            setLoading(true)
            try {
              const result = await LlamaServer.start({
                onLine: (line) => {
                  if (line.includes("listening on")) refresh()
                },
              })
              await afterStart(result.modelId)
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err)
              toast.show({ message, variant: "error", duration: 8000 })
              if (LlamaServer.getLogPath()) {
                await DialogAlert.show(dialog, "llama-server error", `${message}\n\nLog: ${LlamaServer.getLogPath()}`)
              }
            } finally {
              setLoading(false)
            }
          }
        })()
      }}
    />
  )
}
''', encoding='utf-8')

print("llama files written")
