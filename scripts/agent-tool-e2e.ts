#!/usr/bin/env bun
/**
 * Live agent + tool E2E via `localcoder run` and llamacpp.
 * Fast mode (<2 min): AGENT_LIVE_E2E=1 AGENT_E2E_FAST=1 LLAMACPP_SKIP_SERVER=1
 */
import { spawn, type ChildProcess } from "child_process"
import fs from "fs"
import path from "path"
import os from "os"
import { waitForProcess } from "./spawn-utils"
import { resolveLlamaPaths, llamaAvailable } from "./e2e/lib/env"

const ROOT = path.join(import.meta.dir, "..", "packages", "localcoder")
const llama = resolveLlamaPaths()
const LLAMA_DIR = llama.llamaDir
const MODEL_PATH = llama.modelPath
const SERVER_EXE = path.join(LLAMA_DIR, "llama-server.exe")
const API_URL = process.env.LLAMACPP_API_URL ?? "http://127.0.0.1:8080/v1"
const PORT = Number(new URL(API_URL).port || 8080)
const SKIP_SERVER = process.env.LLAMACPP_SKIP_SERVER === "1"
const CTX = Number(process.env.LLAMACPP_CTX ?? 16384)
const FAST = process.env.AGENT_E2E_FAST === "1"
const RUN_TIMEOUT_MS = Number(process.env.AGENT_RUN_TIMEOUT_MS ?? (FAST ? 240_000 : 300_000))
const EXE_ONLY = process.env.AGENT_EXE_ONLY === "1"
const SKIP_EXE = process.env.AGENT_SKIP_EXE === "1"
const EXE = process.env.LOCALCODER_EXE ?? ""

const LIVE = process.env.AGENT_LIVE_E2E === "1"
if (!LIVE) {
  console.log("[agent-e2e] Skipped (set AGENT_LIVE_E2E=1). Fast: add AGENT_E2E_FAST=1")
  process.exit(0)
}

function log(msg: string) {
  console.log(`[agent-e2e] ${msg}`)
}

async function probe(): Promise<string | undefined> {
  try {
    const res = await fetch(`${API_URL}/models`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return undefined
    const data = (await res.json()) as { data?: Array<{ id: string }> }
    return data.data?.[0]?.id
  } catch {
    return undefined
  }
}

async function waitForServer(timeoutMs = 120_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const id = await probe()
    if (id) return id
    await Bun.sleep(2000)
  }
  throw new Error("llama-server not ready")
}

function collectToolEvents(stdout: string) {
  const tools: string[] = []
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue
    try {
      const evt = JSON.parse(line) as { type?: string; part?: { tool?: string; state?: { status?: string } } }
      if (evt.type === "tool_use" && evt.part?.tool && evt.part.state?.status === "completed") {
        tools.push(evt.part.tool)
      }
    } catch {}
  }
  return tools
}

async function writeConfig(workdir: string, model: string) {
  await Bun.write(
    path.join(workdir, "localcoder.json"),
    JSON.stringify({
      $schema: "https://localcoder.ai/config.json",
      model: `llamacpp/${model}`,
      provider: {
        llamacpp: {
          npm: "@ai-sdk/openai-compatible",
          options: { baseURL: API_URL, apiKey: "not-needed" },
          models: {
            [model]: {
              id: model,
              name: model,
              tool_call: true,
              reasoning: process.env.LLAMACPP_DISABLE_THINKING !== "1",
              interleaved: { field: "reasoning_content" },
              temperature: true,
              limit: { context: CTX, output: 1024 },
            },
          },
        },
      },
      permission: { webfetch: "allow", edit: "allow", bash: "allow" },
    }, null, 2),
  )
}

async function runAgent(prompt: string, workdir: string, model: string, useExe = false) {
  await writeConfig(workdir, model)

  const runArgs = [
    "run", "--dir", workdir, "--model", `llamacpp/${model}`,
    "--agent", "build", "--format", "json", "--dangerously-skip-permissions", prompt,
  ]

  const cmd = useExe && EXE && fs.existsSync(EXE) ? EXE : process.execPath
  const spawnArgs = useExe && EXE && fs.existsSync(EXE)
    ? runArgs
    : ["run", "--conditions=browser", path.join(ROOT, "src/index.ts"), ...runArgs]

  log(`running (${useExe ? "exe" : "bun"}): ${prompt.slice(0, 72)}...`)
  const proc = Bun.spawn([cmd, ...spawnArgs], {
    cwd: useExe ? undefined : ROOT,
    env: { ...process.env, LLAMACPP_API_URL: API_URL },
    stdout: "pipe",
    stderr: "pipe",
  })
  const { stdout, stderr, code, timedOut } = await waitForProcess(proc, RUN_TIMEOUT_MS)
  if (code !== 0) {
    console.error(stderr.slice(-4000))
    console.error("stdout tail:", stdout.slice(-4000))
    throw new Error(
      timedOut
        ? `localcoder run timed out after ${RUN_TIMEOUT_MS}ms`
        : `localcoder run exited ${code}${code === null ? " (killed?)" : ""}`,
    )
  }
  return { stdout, stderr, tools: collectToolEvents(stdout) }
}

async function main() {
  if (!llamaAvailable(llama)) {
    throw new Error(`llama not configured — run localcoder llamacpp setup or set LOCALCODER_LLAMACPP_DIR + LOCALCODER_LLAMACPP_MODEL`)
  }
  if (!fs.existsSync(SERVER_EXE)) throw new Error(`missing ${SERVER_EXE}`)
  if (!fs.existsSync(MODEL_PATH)) throw new Error(`missing ${MODEL_PATH}`)

  let server: ChildProcess | undefined
  let started = false
  const existing = await probe()
  if (existing) {
    log(`using existing server, model: ${existing}`)
  } else if (SKIP_SERVER) {
    throw new Error("LLAMACPP_SKIP_SERVER=1 but server not reachable")
  } else {
    log("starting llama-server...")
    server = spawn(SERVER_EXE, ["-m", MODEL_PATH, "--host", "127.0.0.1", "--port", String(PORT), "-c", String(CTX), "--jinja"], {
      cwd: LLAMA_DIR, stdio: ["ignore", "pipe", "pipe"],
    })
    started = true
  }

  const cleanup = () => {
    if (started && server) {
      try { spawn("taskkill", ["/pid", String(server.pid), "/f", "/t"], { stdio: "ignore" }) } catch {}
    }
  }
  process.on("exit", cleanup)

  const workdir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "localcoder-agent-e2e-"))
  try {
    const modelId = existing ?? (await waitForServer())
    log(`model: ${modelId}`)

    const bashPrompt = "Use bash tool with command echo agent_bash_ok. No explanation. Reply done after tool runs."

    if (FAST) {
      if (EXE_ONLY) {
        if (!EXE || !fs.existsSync(EXE)) throw new Error("AGENT_EXE_ONLY but LOCALCODER_EXE missing")
        const exeRun = await runAgent(bashPrompt, workdir, modelId, true)
        log(`bash (exe): ${exeRun.tools.join(", ") || "(none)"}`)
        if (!exeRun.tools.includes("bash")) throw new Error("expected bash (exe)")
      } else {
        const bunRun = await runAgent(bashPrompt, workdir, modelId, false)
        log(`bash (bun): ${bunRun.tools.join(", ") || "(none)"}`)
        if (!bunRun.tools.includes("bash")) throw new Error("expected bash (bun)")
        if (EXE && fs.existsSync(EXE) && !SKIP_EXE) {
          const exeRun = await runAgent(bashPrompt, workdir, modelId, true)
          log(`bash (exe): ${exeRun.tools.join(", ") || "(none)"}`)
          if (!exeRun.tools.includes("bash")) throw new Error("expected bash (exe)")
        }
      }
    } else {
      const fetchPrompt = "Use webfetch on https://httpbin.org/json and reply slideshow if present."
      const fetchRun = await runAgent(fetchPrompt, workdir, modelId)
      if (!fetchRun.tools.includes("webfetch")) throw new Error("expected webfetch")

      const pyPath = path.join(workdir, "live_agent_script.py")
      const writePrompt = `Use write to create ${pyPath} with print("agent_live_ok"). Then bash: python ${pyPath}`
      const writeRun = await runAgent(writePrompt, workdir, modelId)
      if (!writeRun.tools.includes("write")) throw new Error("expected write")
      if (!(await Bun.file(pyPath).exists())) throw new Error("script missing")
    }

    log("ALL AGENT TOOL E2E PASSED")
  } finally {
    cleanup()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

