#!/usr/bin/env bun
/**
 * Multi-turn agent + tool E2E: same session, chained write -> edit -> bash verify.
 * AGENT_MULTITURN_E2E=1 LLAMACPP_SKIP_SERVER=1 bun scripts/agent-multiturn-e2e.ts
 */
import { spawn, type ChildProcess } from "child_process"
import fs from "fs"
import path from "path"
import os from "os"
import { waitForProcess } from "./spawn-utils"

const ROOT = path.join(import.meta.dir, "..", "packages", "localcoder")
const LLAMA_DIR = process.env.LOCALCODER_LLAMACPP_DIR ?? "P:\\llama cpp\\llama-b9354-bin-win-cuda-13.1-x64"
const MODEL_PATH = process.env.LOCALCODER_LLAMACPP_MODEL ?? "P:\\gguf models\\Qwopus3.5-9B-Coder-MTP-Q6_K.gguf"
const SERVER_EXE = path.join(LLAMA_DIR, "llama-server.exe")
const API_URL = process.env.LLAMACPP_API_URL ?? "http://127.0.0.1:8080/v1"
const PORT = Number(new URL(API_URL).port || 8080)
const SKIP_SERVER = process.env.LLAMACPP_SKIP_SERVER === "1"
const CTX = Number(process.env.LLAMACPP_CTX ?? 16384)
const RUN_TIMEOUT_MS = Number(process.env.AGENT_RUN_TIMEOUT_MS ?? 240_000)
const LIVE = process.env.AGENT_MULTITURN_E2E === "1"

if (!LIVE) {
  console.log("[multiturn-e2e] Skipped (set AGENT_MULTITURN_E2E=1)")
  process.exit(0)
}

function log(msg: string) {
  console.log(`[multiturn-e2e] ${msg}`)
}

async function probe() {
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

function collectTools(stdout: string) {
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
              limit: { context: CTX, output: 2048 },
            },
          },
        },
      },
      permission: { webfetch: "allow", edit: "allow", bash: "allow" },
    }, null, 2),
  )
}

async function runTurn(prompt: string, workdir: string, model: string, cont = false) {
  const runArgs = [
    "run", "--dir", workdir, "--model", `llamacpp/${model}`,
    "--agent", "build", "--format", "json", "--dangerously-skip-permissions",
    ...(cont ? ["--continue"] : []),
    prompt,
  ]
  const proc = Bun.spawn([process.execPath, "run", "--conditions=browser", path.join(ROOT, "src/index.ts"), ...runArgs], {
    cwd: ROOT,
    env: { ...process.env, LLAMACPP_API_URL: API_URL },
    stdout: "pipe",
    stderr: "pipe",
  })
  const { stdout, stderr, code, timedOut } = await waitForProcess(proc, RUN_TIMEOUT_MS)
  if (code !== 0) {
    console.error(stderr.slice(-3000))
    throw new Error(timedOut ? `turn timed out after ${RUN_TIMEOUT_MS}ms` : `turn failed exit ${code}`)
  }
  return { stdout, tools: collectTools(stdout) }
}

async function main() {
  if (!fs.existsSync(SERVER_EXE)) throw new Error(`missing ${SERVER_EXE}`)
  if (!fs.existsSync(MODEL_PATH)) throw new Error(`missing ${MODEL_PATH}`)

  let server: ChildProcess | undefined
  let started = false
  const existing = await probe()
  if (existing) {
    log(`using server model ${existing}`)
  } else if (SKIP_SERVER) {
    throw new Error("LLAMACPP_SKIP_SERVER=1 but no server")
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

  const workdir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "localcoder-multiturn-"))
  const scriptPath = path.join(workdir, "calc.py")
  try {
    const modelId = existing ?? (await waitForServer())
    await writeConfig(workdir, modelId)

    const t0 = Date.now()
    const turn1 = await runTurn(
      `Use write tool to create ${scriptPath} with exactly: def add(a,b): return a+b`,
      workdir, modelId,
    )
    log(`turn1 tools: ${turn1.tools.join(", ") || "none"}`)
    if (!turn1.tools.includes("write")) throw new Error("turn1: expected write")

    const turn2 = await runTurn(
      `Use edit or write to append to ${scriptPath}: def mul(a,b): return a*b (keep add function)`,
      workdir, modelId, true,
    )
    log(`turn2 tools: ${turn2.tools.join(", ") || "none"}`)

    const turn3 = await runTurn(
      `Use bash: python -c "import calc; import sys; sys.path.insert(0,'${workdir.replace(/\\/g, "/")}'); import importlib.util; spec=importlib.util.spec_from_file_location('calc','${scriptPath.replace(/\\/g, "/")}'); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m); assert m.add(2,3)==5 and m.mul(2,3)==6; print('multiturn_ok')"`,
      workdir, modelId, true,
    )
    log(`turn3 tools: ${turn3.tools.join(", ") || "none"}`)
    if (!turn3.tools.includes("bash")) throw new Error("turn3: expected bash")

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
    log(`ALL MULTITURN PASSED in ${elapsed}s`)
  } finally {
    cleanup()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

