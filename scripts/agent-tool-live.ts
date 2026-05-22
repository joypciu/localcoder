#!/usr/bin/env bun
/**
 * Live agent + tool E2E with llama.cpp (real LLM).
 *
 * Default model: Qwopus3.5-9B-Coder-MTP-Q6_K.gguf (RTX 5070 Ti 16GB)
 * Override: LOCALCODER_LLAMACPP_MODEL
 *
 *   bun run scripts/agent-tool-live.ts
 *   LLAMACPP_SKIP_SERVER=1 bun run scripts/agent-tool-live.ts
 */
import { spawn, type ChildProcess } from "child_process"
import fs from "fs"
import path from "path"
import os from "os"

const ROOT = path.join(import.meta.dir, "..", "packages", "localcoder")
const LLAMA_DIR = process.env.LOCALCODER_LLAMACPP_DIR ?? "P:\\llama cpp\\llama-b9284-bin-win-cuda-13.1-x64"
const MODEL_PATH =
  process.env.LOCALCODER_LLAMACPP_MODEL ?? "P:\\gguf models\\Qwopus3.5-9B-Coder-MTP-Q6_K.gguf"
const SERVER_EXE = path.join(LLAMA_DIR, "llama-server.exe")
const API_URL = process.env.LLAMACPP_API_URL ?? "http://127.0.0.1:8080/v1"
const PORT = Number(new URL(API_URL).port || 8080)
const SKIP_SERVER = process.env.LLAMACPP_SKIP_SERVER === "1"
const CTX = Number(process.env.LLAMACPP_CTX ?? 16384)
const LLAMA_ARGS = [
  "-m", MODEL_PATH, "--host", "127.0.0.1", "--port", String(PORT), "-c", String(CTX),
  "--jinja", "--spec-type", "draft-mtp", "--spec-draft-n-max", "2",
]
const RUN_TIMEOUT_MS = Number(process.env.AGENT_RUN_TIMEOUT_MS ?? 180_000)
const LOAD_TIMEOUT_MS = Number(process.env.LLAMA_LOAD_TIMEOUT_MS ?? 120_000)

function log(msg: string) {
  console.log(`[agent-live] ${msg}`)
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

async function waitForServer(timeoutMs = LOAD_TIMEOUT_MS) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const id = await probe()
    if (id) return id
    await Bun.sleep(1500)
  }
  throw new Error("llama-server not ready in time")
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

async function runAgent(prompt: string, workdir: string, model: string) {
  const configPath = path.join(workdir, "localcoder.json")
  await Bun.write(
    configPath,
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
              temperature: true,
              limit: { context: CTX, output: 2048 },
            },
          },
        },
      },
      permission: { webfetch: "allow", edit: "allow", bash: "allow" },
    }, null, 2),
  )

  const args = [
    "./src/index.ts",
    "run",
    "--dir",
    workdir,
    "--model",
    `llamacpp/${model}`,
    "--agent",
    "build",
    "--format",
    "json",
    "--dangerously-skip-permissions",
    prompt,
  ]

  log(`prompt: ${prompt.slice(0, 100)}`)
  const bun = process.execPath
  const proc = Bun.spawn([bun, "run", "--conditions=browser", ...args], {
    cwd: ROOT,
    env: { ...process.env, LLAMACPP_API_URL: API_URL },
    stdout: "pipe",
    stderr: "pipe",
  })

  const timer = setTimeout(() => {
    try {
      proc.kill()
    } catch {}
  }, RUN_TIMEOUT_MS)

  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  clearTimeout(timer)
  const code = await proc.exited
  if (code !== 0) {
    console.error(stderr.slice(-3000))
    throw new Error(`localcoder run exited ${code}`)
  }
  return { stdout, stderr, tools: collectToolEvents(stdout) }
}

async function main() {
  const t0 = Date.now()
  if (!fs.existsSync(SERVER_EXE)) throw new Error(`missing ${SERVER_EXE}`)
  if (!fs.existsSync(MODEL_PATH)) throw new Error(`missing ${MODEL_PATH}`)
  log(`model file: ${MODEL_PATH}`)
  log(`context: ${CTX}`)

  let server: ChildProcess | undefined
  let started = false
  const existing = await probe()
  if (existing) {
    log(`reuse server, model id: ${existing}`)
  } else if (SKIP_SERVER) {
    throw new Error("LLAMACPP_SKIP_SERVER=1 but server not reachable")
  } else {
    log("starting llama-server...")
    server = spawn(SERVER_EXE, LLAMA_ARGS, {
      cwd: LLAMA_DIR,
      stdio: ["ignore", "pipe", "pipe"],
    })
    started = true
    server.stderr?.on("data", (d) => {
      const s = d.toString()
      if (s.includes("listening on") || s.includes("error")) process.stderr.write(d)
    })
  }

  const cleanup = () => {
    if (started && server) {
      try {
        spawn("taskkill", ["/pid", String(server.pid), "/f", "/t"], { stdio: "ignore" })
      } catch {}
    }
  }
  process.on("exit", cleanup)
  process.on("SIGINT", () => {
    cleanup()
    process.exit(130)
  })

  const workdir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "localcoder-agent-live-"))
  try {
    const modelId = existing ?? (await waitForServer())
    log(`ready in ${((Date.now() - t0) / 1000).toFixed(1)}s — model id: ${modelId}`)

    const fetchRun = await runAgent(
      "Call webfetch on https://httpbin.org/json format text. Reply: done.",
      workdir,
      modelId,
    )
    log(`webfetch tools: ${fetchRun.tools.join(", ") || "(none)"}`)
    if (!fetchRun.tools.includes("webfetch")) throw new Error("expected webfetch tool call")

    const pyPath = path.join(workdir, "live_agent_script.py")
    const writeRun = await runAgent(
      `Use write to create ${pyPath} with: print("agent_live_ok"). Use bash: python ${pyPath}`,
      workdir,
      modelId,
    )
    log(`write/bash: ${writeRun.tools.join(", ")}`)
    if (!writeRun.tools.includes("write")) throw new Error("expected write tool call")
    if (!(await Bun.file(pyPath).exists())) throw new Error(`missing ${pyPath}`)

    log(`ALL PASSED in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  } finally {
    cleanup()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
