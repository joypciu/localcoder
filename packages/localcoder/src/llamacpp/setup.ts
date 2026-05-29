import fs from "fs"
import path from "path"
import os from "os"

export type LlamaCppUserConfig = {
  llamaDir?: string
  modelPath?: string
  ctx?: number
  mtp?: boolean
  autoStart?: boolean
  thinking?: boolean
}

const CONFIG_PATH = path.join(os.homedir(), ".localcoder", "llamacpp.json")

export const DEFAULT_WINDOWS_LLAMACPP_DIR = "P:\\llama cpp\\llama-b9354-bin-win-cuda-13.1-x64"

export function loadUserLlamaConfig(): LlamaCppUserConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as LlamaCppUserConfig
    }
  } catch {}
  return {}
}

export function saveUserLlamaConfig(cfg: LlamaCppUserConfig) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true })
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf-8")
}

export function configPath() {
  return CONFIG_PATH
}

function existsFile(p: string) {
  try {
    return fs.existsSync(p)
  } catch {
    return false
  }
}

function findVersionedLlamaDirs(): string[] {
  if (process.platform !== "win32") return []
  const serverName = "llama-server.exe"
  const roots = [
    path.join("P:", "llama cpp"),
    path.join("C:", "llama cpp"),
    path.join("P:", "llama.cpp"),
    path.join("C:", "llama.cpp"),
  ]
  const found: { dir: string; build: number }[] = []
  for (const root of roots) {
    if (!existsFile(root)) continue
    try {
      for (const name of fs.readdirSync(root)) {
        const m = /^llama-b(\d+)-/i.exec(name)
        if (!m) continue
        const dir = path.join(root, name)
        if (existsFile(path.join(dir, serverName))) found.push({ dir, build: Number(m[1]) })
      }
    } catch {}
  }
  found.sort((a, b) => b.build - a.build)
  return found.map((f) => f.dir)
}

export function resolveLlamaDir(): string {
  if (process.env.LOCALCODER_LLAMACPP_DIR) return process.env.LOCALCODER_LLAMACPP_DIR
  const saved = loadUserLlamaConfig().llamaDir
  if (saved && existsFile(path.join(saved, process.platform === "win32" ? "llama-server.exe" : "llama-server"))) {
    return saved
  }
  const candidates: string[] = []
  if (process.platform === "win32") {
    candidates.push(...findVersionedLlamaDirs())
    if (existsFile(path.join(DEFAULT_WINDOWS_LLAMACPP_DIR, "llama-server.exe"))) {
      candidates.push(DEFAULT_WINDOWS_LLAMACPP_DIR)
    }
    candidates.push(
      path.join("C:", "llama.cpp"),
      path.join("C:", "llama cpp"),
      path.join("P:", "llama.cpp"),
      path.join(os.homedir(), "llama.cpp"),
      path.join(os.homedir(), "AppData", "Local", "llama.cpp"),
    )
  } else {
    candidates.push(
      "/usr/local/bin",
      path.join(os.homedir(), "llama.cpp"),
      path.join(os.homedir(), ".local", "share", "llama.cpp"),
    )
  }
  for (const base of candidates) {
    const exe = path.join(base, process.platform === "win32" ? "llama-server.exe" : "llama-server")
    if (existsFile(exe)) return base
  }
  return path.join(os.homedir(), "llama.cpp")
}

export function ggufSearchDirs(): string[] {
  const dirs = new Set<string>()
  const saved = loadUserLlamaConfig().modelPath
  if (saved) dirs.add(path.dirname(saved))
  const extra = process.env.LOCALCODER_GGUF_DIRS?.split(/[,;]/).map((s) => s.trim()).filter(Boolean) ?? []
  for (const d of extra) dirs.add(d)
  for (const d of [
    path.join(os.homedir(), "models"),
    path.join(os.homedir(), "gguf models"),
    path.join(os.homedir(), ".cache", "huggingface"),
    path.join(process.cwd(), "models"),
    path.join(process.cwd(), "gguf models"),
    ...(process.platform === "win32" ? [path.join("P:", "gguf models"), path.join("P:", "models")] : []),
  ]) {
    dirs.add(d)
  }
  return [...dirs]
}

export function findGgufFiles(max = 8): string[] {
  const out: string[] = []
  for (const dir of ggufSearchDirs()) {
    if (!existsFile(dir)) continue
    try {
      for (const name of fs.readdirSync(dir)) {
        if (!name.toLowerCase().endsWith(".gguf")) continue
        out.push(path.join(dir, name))
        if (out.length >= max) return out
      }
    } catch {}
  }
  return out
}

export function resolveModelPath(): string | undefined {
  if (process.env.LOCALCODER_LLAMACPP_MODEL) return process.env.LOCALCODER_LLAMACPP_MODEL
  const saved = loadUserLlamaConfig().modelPath
  if (saved && existsFile(saved)) return saved
  return findGgufFiles(1)[0]
}

export function modelSupportsThinkingToggle(modelRef: string) {
  const base = path.basename(modelRef).toLowerCase()
  return /qwopus|qwen3(?:\.5|-)/i.test(base)
}

export function resolveThinkingEnabled(modelRef: string) {
  if (process.env.LLAMACPP_ENABLE_THINKING === "1") return true
  if (process.env.LLAMACPP_DISABLE_THINKING === "1") return false
  if (process.env.LLAMACPP_DISABLE_THINKING === "0") return true
  const saved = loadUserLlamaConfig()
  if (saved.thinking !== undefined) return saved.thinking
  const base = path.basename(modelRef).toLowerCase()
  if (modelSupportsThinkingToggle(base)) return true
  return true
}

export function modelDisablesThinking(modelPath: string) {
  return !resolveThinkingEnabled(modelPath)
}

export function modelUsesMtp(modelPath: string) {
  if (process.env.LLAMACPP_MTP === "0") return false
  if (process.env.LLAMACPP_MTP === "1") return true
  const saved = loadUserLlamaConfig().mtp
  if (saved === false) return false
  if (saved === true) return true
  return /mtp/i.test(path.basename(modelPath))
}

export const CONTEXT_PRESETS = [4096, 8192, 16384, 32768, 65536, 131072] as const

export function defaultContextSize(modelPath?: string) {
  const saved = loadUserLlamaConfig().ctx
  if (saved) return saved
  const env = Number(process.env.LLAMACPP_CTX)
  if (env > 0) return env
  void modelPath
  return 16384
}

export function setupHint(): string {
  return [
    "Local llama.cpp setup:",
    "  Config: " + CONFIG_PATH,
    "  Env: LOCALCODER_LLAMACPP_DIR, LOCALCODER_LLAMACPP_MODEL",
    "  Env: LLAMACPP_CTX (default 16384), LLAMACPP_MAX_OUTPUT (default 4096)",
    "  Env: LLAMACPP_MTP=1 or 0 to force MTP draft mode",
    "  Qwen3.5/Qwopus thinking: set thinking in llamacpp.json or use the app toggle",
    "  Env: LLAMACPP_ENABLE_THINKING=1 / LLAMACPP_DISABLE_THINKING=1 to override",
  ].join("\n")
}

export function validateSetup(input: { llamaDir: string; modelPath: string }) {
  const serverExe = path.join(input.llamaDir, process.platform === "win32" ? "llama-server.exe" : "llama-server")
  if (!existsFile(serverExe)) {
    throw new Error("llama-server not found in " + input.llamaDir)
  }
  if (!existsFile(input.modelPath)) {
    throw new Error("GGUF model not found: " + input.modelPath)
  }
  if (!input.modelPath.toLowerCase().endsWith(".gguf")) {
    throw new Error("Model file must be a .gguf file")
  }
  return { serverExe }
}