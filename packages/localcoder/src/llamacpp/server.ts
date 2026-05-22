import { spawn, type ChildProcess } from "child_process"
import * as LlamaSetup from "./setup"
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


/** Matches LLAMACPP_CTX / provider discoverModels for overflow UI. */
export function getLlamaContextLimit() {
  return Number(process.env.LLAMACPP_CTX ?? LlamaSetup.loadUserLlamaConfig().ctx ?? 16384)
}

export function llamaServerArgs(cfg: LlamaServerConfig): string[] {
  const args = [
    "-m",
    cfg.modelPath,
    "--host",
    "127.0.0.1",
    "--port",
    String(cfg.port),
    "-c",
    String(cfg.ctx),
    "--jinja",
  ]
  // Qwen3.5 thinking via chat_template_args per request.
  if (LlamaSetup.modelUsesMtp(cfg.modelPath)) {
    args.push("--spec-type", "draft-mtp", "--spec-draft-n-max", process.env.LLAMACPP_MTP_DRAFT ?? "2")
  }
  const parallel = process.env.LLAMACPP_PARALLEL
  if (parallel) args.push("-np", parallel)
  const ngl = process.env.LLAMACPP_NGL
  if (ngl) args.push("-ngl", ngl)
  return args
}

export function getConfig(): LlamaServerConfig {
  const apiUrl = process.env.LLAMACPP_API_URL ?? "http://127.0.0.1:8080/v1"
  const llamaDir = LlamaSetup.resolveLlamaDir()
  const modelPath = LlamaSetup.resolveModelPath() ?? ""
  return {
    llamaDir,
    modelPath,
    serverExe: path.join(llamaDir, process.platform === "win32" ? "llama-server.exe" : "llama-server"),
    apiUrl,
    port: Number(new URL(apiUrl).port || 8080),
    ctx: LlamaSetup.loadUserLlamaConfig().ctx ?? getLlamaContextLimit(),
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
    throw new Error(
      cfg.modelPath
        ? `GGUF model not found: ${cfg.modelPath}`
        : `No GGUF model configured. Set LOCALCODER_LLAMACPP_MODEL or save a path in ${LlamaSetup.configPath()}`,
    )
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

  const args = llamaServerArgs(cfg)

  managed = spawn(cfg.serverExe, args, {
    cwd: cfg.llamaDir,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  })
  managed.unref()

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


