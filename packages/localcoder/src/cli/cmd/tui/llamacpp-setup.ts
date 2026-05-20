import fs from "fs"
import path from "path"
import os from "os"

export type LlamaCppUserConfig = {
  llamaDir?: string
  modelPath?: string
  ctx?: number
  mtp?: boolean
}

const CONFIG_PATH = path.join(os.homedir(), ".localcoder", "llamacpp.json")

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

export function resolveLlamaDir(): string {
  if (process.env.LOCALCODER_LLAMACPP_DIR) return process.env.LOCALCODER_LLAMACPP_DIR
  const saved = loadUserLlamaConfig().llamaDir
  if (saved && existsFile(path.join(saved, process.platform === "win32" ? "llama-server.exe" : "llama-server"))) {
    return saved
  }
  const candidates: string[] = []
  if (process.platform === "win32") {
    candidates.push(
      path.join("C:", "llama.cpp"),
      path.join("C:", "llama cpp"),
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

export function findGgufFiles(max = 8): string[] {
  const dirs = new Set<string>()
  const saved = loadUserLlamaConfig().modelPath
  if (saved) dirs.add(path.dirname(saved))
  for (const d of [
    path.join(os.homedir(), "models"),
    path.join(os.homedir(), "gguf models"),
    path.join(os.homedir(), ".cache", "huggingface"),
    path.join(process.cwd(), "models"),
    path.join(process.cwd(), "gguf models"),
  ]) {
    dirs.add(d)
  }
  const out: string[] = []
  for (const dir of dirs) {
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

export function modelUsesMtp(modelPath: string) {
  if (process.env.LLAMACPP_MTP === "0") return false
  if (process.env.LLAMACPP_MTP === "1") return true
  const saved = loadUserLlamaConfig().mtp
  if (saved === false) return false
  if (saved === true) return true
  return /mtp/i.test(path.basename(modelPath))
}

export function setupHint(): string {
  return [
    "Local llama.cpp setup:",
    `  Config: ${CONFIG_PATH}`,
    "  Env: LOCALCODER_LLAMACPP_DIR, LOCALCODER_LLAMACPP_MODEL",
    "  Env: LLAMACPP_CTX (default 16384), LLAMACPP_MAX_OUTPUT (default 4096)",
    "  Env: LLAMACPP_MTP=1|0 to force MTP draft mode",
  ].join("\n")
}
