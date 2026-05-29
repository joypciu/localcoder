import fs from "fs"
import os from "os"
import path from "path"
import type { E2eTier } from "./runner"

export type LlamaPaths = {
  llamaDir: string
  modelPath: string
  apiUrl: string
}

const LLAMA_CONFIG = path.join(os.homedir(), ".localcoder", "llamacpp.json")

function loadSavedLlamaConfig(): { llamaDir?: string; modelPath?: string } {
  try {
    if (fs.existsSync(LLAMA_CONFIG)) {
      return JSON.parse(fs.readFileSync(LLAMA_CONFIG, "utf-8")) as { llamaDir?: string; modelPath?: string }
    }
  } catch {}
  return {}
}

function findVersionedLlamaDirs(): string[] {
  if (process.platform !== "win32") return []
  const roots = [
    path.join("C:", "llama cpp"),
    path.join("C:", "llama.cpp"),
    path.join(os.homedir(), "llama.cpp"),
    path.join(os.homedir(), "AppData", "Local", "llama.cpp"),
  ]
  const found: { dir: string; build: number }[] = []
  for (const root of roots) {
    if (!fs.existsSync(root)) continue
    try {
      for (const name of fs.readdirSync(root)) {
        const m = /^llama-b(\d+)-/i.exec(name)
        if (!m) continue
        const dir = path.join(root, name)
        if (fs.existsSync(path.join(dir, "llama-server.exe"))) found.push({ dir, build: Number(m[1]) })
      }
    } catch {}
  }
  found.sort((a, b) => b.build - a.build)
  return found.map((f) => f.dir)
}

function findGgufNear(dir: string): string | undefined {
  const roots = [dir, path.dirname(dir), path.join(os.homedir(), "models"), path.join(os.homedir(), "gguf models")]
  for (const root of roots) {
    if (!fs.existsSync(root)) continue
    try {
      for (const name of fs.readdirSync(root)) {
        if (name.toLowerCase().endsWith(".gguf")) return path.join(root, name)
      }
    } catch {}
  }
  return undefined
}

export function resolveLlamaPaths(): LlamaPaths {
  const saved = loadSavedLlamaConfig()
  const llamaDir =
    process.env.LOCALCODER_LLAMACPP_DIR ??
    saved.llamaDir ??
    findVersionedLlamaDirs()[0] ??
    ""
  const modelPath =
    process.env.LOCALCODER_LLAMACPP_MODEL ??
    saved.modelPath ??
    (llamaDir ? findGgufNear(llamaDir) : undefined) ??
    ""
  const apiUrl = process.env.LLAMACPP_API_URL ?? "http://127.0.0.1:8080/v1"
  return { llamaDir, modelPath, apiUrl }
}

export function llamaAvailable(paths: LlamaPaths): boolean {
  if (!paths.llamaDir || !paths.modelPath) return false
  const server = path.join(paths.llamaDir, process.platform === "win32" ? "llama-server.exe" : "llama-server")
  return fs.existsSync(server) && fs.existsSync(paths.modelPath)
}

export function parseTier(): E2eTier {
  const arg = process.argv.find((a) => a.startsWith("--tier="))?.split("=")[1]
  const env = process.env.E2E_TIER
  const tier = (arg ?? env ?? "standard") as E2eTier
  if (tier !== "smoke" && tier !== "standard" && tier !== "full") {
    throw new Error(`invalid tier: ${tier} (use smoke | standard | full)`)
  }
  return tier
}

export function envFlag(name: string, defaultValue = false): boolean {
  const v = process.env[name]
  if (v === "1" || v === "true") return true
  if (v === "0" || v === "false") return false
  return defaultValue
}
