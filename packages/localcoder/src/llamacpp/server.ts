import { spawn, execFile, type ChildProcess } from "child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
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
  /** Context size from ~/.localcoder/llamacpp.json / LLAMACPP_CTX */
  configuredCtx: number
  /** Context from running llama-server (-c), when detectable */
  runningCtx?: number
  /** Saved ctx differs from the server process (restart required) */
  ctxMismatch: boolean
}

/** Parse `-c` / `--ctx-size` from a process command line. */
export function parseCtxFromCommandLine(cmdline: string): number | undefined {
  const tokens =
    cmdline.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((t) => t.replace(/^"|"$/g, "")) ?? cmdline.trim().split(/\s+/)
  return parseCtxFromArgv(tokens)
}

export function parseCtxFromArgv(argv: string[]): number | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === "-c" || arg === "--ctx-size") {
      const n = Number(argv[i + 1])
      if (Number.isFinite(n) && n > 0) return Math.floor(n)
    }
    const eq = arg.match(/^(?:-c|--ctx-size)=(\d+)$/)
    if (eq) return Number(eq[1])
  }
  return undefined
}

async function findListeningPids(port: number): Promise<number[]> {
  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync("netstat", ["-ano"], { encoding: "utf8", windowsHide: true })
      const pids = new Set<number>()
      for (const line of stdout.split(/\r?\n/)) {
        if (!line.includes(`:${port}`) || !line.includes("LISTENING")) continue
        const parts = line.trim().split(/\s+/)
        const pid = Number(parts.at(-1))
        if (pid > 0) pids.add(pid)
      }
      return [...pids]
    }
    const { stdout } = await execFileAsync("lsof", ["-ti", `tcp:${port}`], { encoding: "utf8" })
    return stdout
      .split(/\s+/)
      .map((x) => Number(x))
      .filter((pid) => pid > 0)
  } catch {
    return []
  }
}

async function readProcessCommandLine(pid: number): Promise<string | undefined> {
  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine`,
        ],
        { encoding: "utf8", windowsHide: true, timeout: 8000 },
      )
      const line = stdout.trim()
      return line || undefined
    }
    const { stdout } = await execFileAsync("ps", ["-p", String(pid), "-o", "args="], { encoding: "utf8" })
    const line = stdout.trim()
    if (line) return line
    const raw = await fs.promises.readFile(`/proc/${pid}/cmdline`, "utf8")
    return raw.split("\0").filter(Boolean).join(" ")
  } catch {
    return undefined
  }
}

/** Best-effort read of llama-server `-c` for the process listening on `port`. */
export async function probeRunningServerCtx(port: number): Promise<number | undefined> {
  if (managed !== undefined && managedCtx !== undefined) return managedCtx
  for (const pid of await findListeningPids(port)) {
    const cmd = await readProcessCommandLine(pid)
    if (!cmd || !/llama-server/i.test(cmd)) continue
    const ctx = parseCtxFromCommandLine(cmd)
    if (ctx !== undefined) return ctx
  }
  return undefined
}

let managed: ChildProcess | undefined
let logPath: string | undefined
let managedCtx: number | undefined

async function stopOnPort(port: number): Promise<boolean> {
  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync("netstat", ["-ano"], { encoding: "utf8", windowsHide: true })
      const pids = new Set<number>()
      for (const line of stdout.split(/\r?\n/)) {
        if (!line.includes(`:${port}`) || !line.includes("LISTENING")) continue
        const parts = line.trim().split(/\s+/)
        const pid = Number(parts.at(-1))
        if (pid > 0) pids.add(pid)
      }
      for (const pid of pids) {
        await execFileAsync("taskkill", ["/PID", String(pid), "/F", "/T"], { windowsHide: true }).catch(() => {})
      }
      return pids.size > 0
    }
    await execFileAsync("fuser", ["-k", `${port}/tcp`]).catch(() => {})
    return true
  } catch {
    return false
  }
}

async function stopListeningServer(port: number) {
  await stopIfManaged()
  await stopOnPort(port)
  await Bun.sleep(750)
}


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
  forceRestart?: boolean
  onLine?: (line: string) => void
}): Promise<{ modelId: string; alreadyRunning: boolean; restarted?: boolean }> {
  const cfg = { ...getConfig(), ...input?.config }
  const desiredCtx = cfg.ctx

  if (input?.forceRestart) {
    await stopListeningServer(cfg.port)
  }

  const existing = await probe(cfg.apiUrl)
  if (existing.ok && existing.modelId) {
    if (managed && managedCtx !== undefined && managedCtx !== desiredCtx) {
      await stopListeningServer(cfg.port)
    } else if (!input?.forceRestart && managedCtx === desiredCtx) {
      return { modelId: existing.modelId, alreadyRunning: true }
    } else if (!input?.forceRestart && !managed) {
      const savedCtx = LlamaSetup.loadUserLlamaConfig().ctx
      if (savedCtx === desiredCtx) {
        return { modelId: existing.modelId, alreadyRunning: true }
      }
      await stopListeningServer(cfg.port)
    } else if (!input?.forceRestart) {
      return { modelId: existing.modelId, alreadyRunning: true }
    }
  }

  const afterStop = await probe(cfg.apiUrl)
  if (afterStop.ok && afterStop.modelId && !input?.forceRestart && managedCtx === desiredCtx) {
    return { modelId: afterStop.modelId, alreadyRunning: true }
  }

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
  managedCtx = desiredCtx
  return { modelId, alreadyRunning: false, restarted: input?.forceRestart === true }
}

export async function stopIfManaged() {
  if (!managed) return false
  const proc = managed
  managed = undefined
  managedCtx = undefined
  try {
    if (process.platform === "win32") {
      await execFileAsync("taskkill", ["/pid", String(proc.pid), "/f", "/t"])
    } else {
      proc.kill("SIGTERM")
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 5000)
        proc.once("exit", () => {
          clearTimeout(timer)
          resolve()
        })
      })
    }
    for (let i = 0; i < 20; i++) {
      const probed = await probe()
      if (!probed.ok) return true
      await Bun.sleep(250)
    }
    return true
  } catch {
    return true
  }
}

export async function status(): Promise<LlamaServerStatus> {
  const cfg = getConfig()
  const probed = await probe(cfg.apiUrl)
  const configuredCtx = cfg.ctx
  const runningCtx = probed.ok ? await probeRunningServerCtx(cfg.port) : undefined
  const ctxMismatch = probed.ok && runningCtx !== undefined && runningCtx !== configuredCtx
  return {
    running: probed.ok,
    modelId: probed.modelId,
    managed: isManaged(),
    apiUrl: cfg.apiUrl,
    logPath,
    configuredCtx,
    runningCtx,
    ctxMismatch,
  }
}

export function modelRef(modelId: string) {
  return `llamacpp/${modelId}`
}


