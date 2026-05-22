#!/usr/bin/env bun
/**
 * Fast Windows readiness gate — target <5 minutes (llama already loaded).
 *   bun run scripts/readiness-windows.ts
 */
import { spawn, type ChildProcess } from "child_process"
import crypto from "crypto"
import fs from "fs"
import net from "net"
import path from "path"

const ROOT = path.join(import.meta.dir, "..")
const PKG = path.join(ROOT, "packages", "localcoder")
const EXE = path.join(PKG, "dist", "localcoder-windows-x64", "bin", "localcoder.exe")
const VSCODE = path.join(ROOT, "sdks", "vscode")
const DESKTOP_EXE = path.join(ROOT, "packages", "desktop", "dist", "win-unpacked", "LocalCoder.exe")
const BUDGET_MS = Number(process.env.READINESS_BUDGET_MS ?? 300_000)
const started = Date.now()

function elapsed() {
  return ((Date.now() - started) / 1000).toFixed(1)
}

function log(step: string, msg: string) {
  console.log(`[ready][${step}][${elapsed()}s] ${msg}`)
}

function fail(step: string, msg: string): never {
  console.error(`[ready][${step}][${elapsed()}s] FAIL: ${msg}`)
  process.exit(1)
}

function budgetLeft() {
  return BUDGET_MS - (Date.now() - started)
}

function checkBudget(step: string) {
  if (budgetLeft() <= 0) fail(step, `exceeded ${BUDGET_MS / 1000}s budget`)
}

function resolveBun(): string {
  const exe = process.execPath
  if (/bun(\.exe)?$/i.test(exe)) return exe
  const home = process.env.USERPROFILE || ""
  const c = [
    path.join(process.env.APPDATA || "", "npm", "node_modules", "bun", "bin", "bun.exe"),
    path.join(home, ".bun", "bin", "bun.exe"),
  ]
  for (const p of c) if (fs.existsSync(p)) return p
  return exe
}

const BUN = resolveBun()

function run(cmd: string, args: string[], opts?: { cwd?: string; env?: Record<string, string> }): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd: opts?.cwd,
      env: { ...process.env, ...opts?.env },
      stdio: "inherit",
      shell: process.platform === "win32" && /\.(cmd|bat|ps1)$/i.test(cmd),
    })
    proc.on("error", reject)
    proc.on("close", (code) => resolve(code ?? 1))
  })
}

async function findFreePort() {
  return new Promise<number>((resolve, reject) => {
    const s = net.createServer()
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as net.AddressInfo).port
      s.close(() => resolve(p))
    })
    s.on("error", reject)
  })
}

async function main() {
  if (process.platform !== "win32") fail("preflight", "Windows only")

  log("preflight", `budget=${BUDGET_MS / 1000}s`)

  if (!fs.existsSync(EXE)) fail("cli", `missing ${EXE}`)
  checkBudget("cli")
  if ((await run(EXE, ["--version"])) !== 0) fail("cli", "--version failed")

  checkBudget("llama")
  const llamaCode = await run(EXE, [
    "llamacpp", "setup",
    "--dir", process.env.LOCALCODER_LLAMACPP_DIR ?? "P:\\llama cpp\\llama-b9284-bin-win-cuda-13.1-x64",
    "--model", process.env.LOCALCODER_LLAMACPP_MODEL ?? "P:\\gguf models\\Qwopus3.5-9B-Coder-MTP-Q6_K.gguf",
  ])
  if (llamaCode !== 0) fail("llama", "llamacpp setup failed")

  checkBudget("chat")
  const chatCode = await run(BUN, ["run", path.join(ROOT, "scripts", "e2e-llamacpp.ts")], {
    env: { LLAMACPP_SKIP_SERVER: "1", LLAMACPP_CTX: "16384" },
  })
  if (chatCode !== 0) fail("chat", "e2e-llamacpp failed")

  if (process.env.READINESS_SKIP_AGENT !== "1") {
    checkBudget("agent")
    const agentCode = await run(BUN, ["run", path.join(ROOT, "scripts", "agent-tool-e2e.ts")], {
      env: {
        AGENT_LIVE_E2E: "1",
        AGENT_E2E_FAST: "1",
        LLAMACPP_SKIP_SERVER: "1",
        LLAMACPP_CTX: "4096",
        LOCALCODER_EXE: EXE,
        AGENT_RUN_TIMEOUT_MS: "240000",
        AGENT_SKIP_EXE: "1",
      },
    })
    if (agentCode !== 0) fail("agent", "agent tool e2e failed")
  } else {
    log("agent", "skipped (READINESS_SKIP_AGENT=1)")
  }

  checkBudget("serve")
  const port = await findFreePort()
  const password = crypto.randomBytes(16).toString("hex")
  let serveProc: ChildProcess | undefined
  try {
    serveProc = spawn(EXE, ["serve", "--port", String(port), "--hostname", "127.0.0.1", "--cors"], {
      env: { ...process.env, LOCALCODER_SERVER_PASSWORD: password },
      stdio: "ignore",
    })
    const auth = Buffer.from(`localcoder:${password}`).toString("base64")
    const deadline = Date.now() + 30_000
    while (Date.now() < deadline) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/global/health`, {
          headers: { Authorization: `Basic ${auth}` },
          signal: AbortSignal.timeout(2000),
        })
        if (r.ok) break
      } catch {}
      await Bun.sleep(300)
    }
    const status = await fetch(`http://127.0.0.1:${port}/global/llamacpp/status`, {
      headers: { Authorization: `Basic ${auth}` },
    })
    if (!status.ok) fail("serve", `status ${status.status}`)
    log("serve", "health + llamacpp API OK")
  } finally {
    serveProc?.kill()
  }

  checkBudget("vscode")
  if ((await run(BUN, ["run", "test:all"], { cwd: VSCODE })) !== 0) fail("vscode", "test:all failed")

  checkBudget("desktop")
  if (!fs.existsSync(DESKTOP_EXE)) fail("desktop", `missing ${DESKTOP_EXE}`)
  log("desktop", `LocalCoder.exe ${(fs.statSync(DESKTOP_EXE).size / 1048576).toFixed(1)} MB`)

  console.log(`[ready] ALL PASSED in ${elapsed()}s`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
