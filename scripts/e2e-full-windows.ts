#!/usr/bin/env bun
/**
 * End-to-end Windows gate: CLI build, llama.cpp setup, serve API, VS Code tests, desktop artifact.
 *
 * Usage:
 *   bun run scripts/e2e-full-windows.ts
 *
 * Env:
 *   LOCALCODER_LLAMACPP_DIR   — llama-server directory (must contain llama-server.exe)
 *   LOCALCODER_LLAMACPP_MODEL — path to .gguf model
 *   E2E_SKIP_BUILD=1          — skip build:win
 *   E2E_SKIP_LLAMA=1          — skip llama setup + chat smoke
 *   E2E_SKIP_STANDALONE=1     — skip build:win-standalone portable gate
 *   LLAMACPP_API_URL          — default http://127.0.0.1:8080/v1
 */
import { spawn, type ChildProcess } from "child_process"
import crypto from "crypto"
import fs from "fs"
import net from "net"
import path from "path"

const ROOT = path.join(import.meta.dir, "..")
const PKG = path.join(ROOT, "packages", "localcoder")
const DESKTOP = path.join(ROOT, "packages", "desktop")
const EXE = path.join(PKG, "dist", "localcoder-windows-x64", "bin", "localcoder.exe")
const DESKTOP_EXE = path.join(DESKTOP, "dist", "win-unpacked", "LocalCoder.exe")
const DESKTOP_INSTALLER = path.join(DESKTOP, "dist", "localcoder-desktop-win-x64.exe")
const VSCODE = path.join(ROOT, "sdks", "vscode")
const SKIP_BUILD = process.env.E2E_SKIP_BUILD === "1"
const SKIP_LLAMA = process.env.E2E_SKIP_LLAMA === "1"
const SKIP_STANDALONE = process.env.E2E_SKIP_STANDALONE === "1"

function resolveLlamaDir(): string {
  return process.env.LOCALCODER_LLAMACPP_DIR ?? "P:\\llama cpp\\llama-b9354-bin-win-cuda-13.1-x64"
}

function resolveModelPath(): string {
  return process.env.LOCALCODER_LLAMACPP_MODEL ?? "P:\\gguf models\\Qwopus3.5-9B-Coder-MTP-Q6_K.gguf"
}

function resolveBun(): string {
  const exe = process.execPath
  if (/bun(\.exe)?$/i.test(exe)) return exe
  const home = process.env.USERPROFILE || process.env.HOME || ""
  const candidates = [
    path.join(process.env.APPDATA || "", "npm", "node_modules", "bun", "bin", "bun.exe"),
    path.join(home, ".bun", "bin", "bun.exe"),
    "bun.exe",
    "bun",
  ]
  for (const c of candidates) {
    if (c && (c === "bun" || c === "bun.exe" || fs.existsSync(c))) return c
  }
  return exe
}

const BUN = resolveBun()

function log(step: string, msg: string) {
  console.log(`[e2e-full][${step}] ${msg}`)
}

function fail(step: string, msg: string): never {
  console.error(`[e2e-full][${step}] FAIL: ${msg}`)
  process.exit(1)
}

function run(cmd: string, args: string[], opts?: { cwd?: string; env?: Record<string, string>; shell?: boolean }): Promise<number> {
  return new Promise((resolve, reject) => {
    const useShell = opts?.shell ?? (process.platform === "win32" && /.(cmd|bat|ps1)$/i.test(cmd))
    const proc = spawn(cmd, args, {
      cwd: opts?.cwd,
      env: { ...process.env, ...opts?.env },
      stdio: "inherit",
      shell: useShell,
    })
    proc.on("error", reject)
    proc.on("close", (code) => resolve(code ?? 1))
  })
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer()
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as net.AddressInfo).port
      s.close(() => resolve(p))
    })
    s.on("error", reject)
  })
}

const LLAMA_API = process.env.LLAMACPP_API_URL ?? "http://127.0.0.1:8080/v1"

async function waitForLlamaApi(timeoutMs = 600_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${LLAMA_API}/models`, { signal: AbortSignal.timeout(5000) })
      if (res.ok) {
        const data = (await res.json()) as { data?: Array<{ id: string }> }
        if (data.data?.[0]?.id) {
          log("llama", `API ready, model=${data.data[0].id}`)
          return
        }
      }
    } catch { /* retry */ }
    await Bun.sleep(2000)
  }
  throw new Error("llama-server API not ready")
}

async function waitForHealth(port: number, password: string, timeoutMs = 60_000) {
  const auth = Buffer.from(`localcoder:${password}`).toString("base64")
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/global/health`, {
        headers: { Authorization: `Basic ${auth}` },
        signal: AbortSignal.timeout(3000),
      })
      if (r.ok) return
    } catch { /* retry */ }
    await Bun.sleep(500)
  }
  throw new Error("localcoder serve did not become healthy")
}

function findPortableExe(): string | undefined {
  const dist = path.join(DESKTOP, "dist")
  if (!fs.existsSync(dist)) return undefined
  return fs.readdirSync(dist).find((f) => f.endsWith("-portable.exe"))
}

async function main() {
  if (process.platform !== "win32") {
    fail("preflight", "this script is intended for Windows")
  }

  const LLAMA_DIR = resolveLlamaDir()
  const MODEL_PATH = resolveModelPath()

  log("preflight", "checking llama.cpp paths")
  log("preflight", `LOCALCODER_LLAMACPP_DIR=${LLAMA_DIR}`)
  log("preflight", `LOCALCODER_LLAMACPP_MODEL=${MODEL_PATH}`)
  const serverExe = path.join(LLAMA_DIR, "llama-server.exe")
  if (!fs.existsSync(serverExe)) {
    fail(
      "preflight",
      `missing ${serverExe} — set LOCALCODER_LLAMACPP_DIR to your llama.cpp bin folder`,
    )
  }
  if (!fs.existsSync(MODEL_PATH)) {
    fail(
      "preflight",
      `missing ${MODEL_PATH} — set LOCALCODER_LLAMACPP_MODEL to your .gguf file`,
    )
  }

  if (!SKIP_BUILD) {
    log("build", "bun run build:win")
    const code = await run(BUN, ["run", "build:win"], { cwd: PKG })
    if (code !== 0) fail("build", `build:win exited ${code}`)
  }

  if (!fs.existsSync(EXE)) fail("cli", `missing ${EXE}`)
  log("cli", "--version")
  {
    const code = await run(EXE, ["--version"])
    if (code !== 0) fail("cli", `--version exited ${code}`)
  }

  log("cli", "session search smoke")
  {
    const code = await run(EXE, ["session", "search", "test", "--limit", "1"])
    if (code !== 0) fail("cli", `session search exited ${code}`)
  }

  if (!SKIP_LLAMA) {
    log("llama", "llamacpp setup (may take several minutes on first GPU load)")
    const code = await run(EXE, ["llamacpp", "setup", "--dir", LLAMA_DIR, "--model", MODEL_PATH])
    if (code !== 0) fail("llama", `llamacpp setup exited ${code}`)

    await waitForLlamaApi()

    log("llama", "e2e-llamacpp chat smoke (reuse running server)")
    const chatCode = await run(BUN, ["run", path.join(ROOT, "scripts", "e2e-llamacpp.ts")], {
      env: { LLAMACPP_SKIP_SERVER: "1" },
    })
    if (chatCode !== 0) fail("llama", `e2e-llamacpp exited ${chatCode}`)
  }

  log("serve", "starting localcoder serve + llamacpp status API")
  const port = await findFreePort()
  const password = crypto.randomBytes(16).toString("hex")
  let serveProc: ChildProcess | undefined
  try {
    serveProc = spawn(EXE, ["serve", "--port", String(port), "--hostname", "127.0.0.1", "--cors"], {
      env: { ...process.env, LOCALCODER_SERVER_PASSWORD: password, LOCALCODER_CALLER: "e2e-full" },
      stdio: "ignore",
    })
    await waitForHealth(port, password)
    const auth = Buffer.from(`localcoder:${password}`).toString("base64")
    const statusRes = await fetch(`http://127.0.0.1:${port}/global/llamacpp/status`, {
      headers: { Authorization: `Basic ${auth}` },
    })
    if (!statusRes.ok) fail("serve", `/global/llamacpp/status ${statusRes.status}`)
    const status = (await statusRes.json()) as { running?: boolean }
    log("serve", `llamacpp status running=${String(status.running)}`)
  } finally {
    serveProc?.kill()
  }

  log("vscode", "bun run test:all")
  const testCode = await run(BUN, ["run", "test:all"], { cwd: VSCODE })
  if (testCode !== 0) fail("vscode", `test:all exited ${testCode}`)

  if (!SKIP_STANDALONE) {
    log("standalone", "bun run build:win-standalone (LOCALCODER_FAST_PACK=1)")
    const standaloneCode = await run(BUN, ["run", "build:win-standalone"], {
      cwd: PKG,
      env: { LOCALCODER_FAST_PACK: "1" },
    })
    if (standaloneCode !== 0) fail("standalone", `build:win-standalone exited ${standaloneCode}`)

    const portable = findPortableExe()
    const unpacked = fs.existsSync(DESKTOP_EXE)
    if (portable) {
      const portablePath = path.join(DESKTOP, "dist", portable)
      const sizeMb = (fs.statSync(portablePath).size / (1024 * 1024)).toFixed(1)
      log("standalone", `portable OK: ${portablePath} (${sizeMb} MB)`)
    } else if (unpacked) {
      const sizeMb = (fs.statSync(DESKTOP_EXE).size / (1024 * 1024)).toFixed(1)
      log("standalone", `fast-pack GUI OK: ${DESKTOP_EXE} (${sizeMb} MB)`)
    } else {
      fail("standalone", "no portable exe or win-unpacked/LocalCoder.exe after build:win-standalone")
    }
  }

  log("desktop", "checking desktop artifacts")
  if (!fs.existsSync(DESKTOP_EXE)) {
    log("desktop", "LocalCoder.exe missing — running package:win")
    for (const script of ["prebuild", "build", "package:win"]) {
      const code = await run(BUN, ["run", script], { cwd: DESKTOP })
      if (code !== 0) fail("desktop", `${script} exited ${code}`)
    }
  }
  if (!fs.existsSync(DESKTOP_EXE)) fail("desktop", `missing ${DESKTOP_EXE}`)
  const sizeMb = (fs.statSync(DESKTOP_EXE).size / (1024 * 1024)).toFixed(1)
  log("desktop", `LocalCoder.exe OK (${sizeMb} MB)`)
  if (fs.existsSync(DESKTOP_INSTALLER)) {
    log("desktop", `installer OK: ${DESKTOP_INSTALLER}`)
  }

  console.log("[e2e-full] ALL PASSED")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
