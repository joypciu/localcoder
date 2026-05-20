#!/usr/bin/env bun
/**
 * Live agent + tool E2E via `localcoder run` and llamacpp.
 * Usage: bun run scripts/agent-tool-e2e.ts
 *        LLAMACPP_SKIP_SERVER=1 bun run scripts/agent-tool-e2e.ts
 */
import { spawn, type ChildProcess } from "child_process"
import fs from "fs"
import path from "path"
import os from "os"

const ROOT = path.join(import.meta.dir, "..", "packages", "localcoder")
const LLAMA_DIR = process.env.LOCALCODER_LLAMACPP_DIR ?? "P:\\llama cpp\\llama-b9222-bin-win-cuda-13.1-x64"
const MODEL_PATH = process.env.LOCALCODER_LLAMACPP_MODEL ?? "P:\\gguf models\\Qwopus3.5-9B-Coder-MTP-Q6_K.gguf"
const SERVER_EXE = path.join(LLAMA_DIR, "llama-server.exe")
const API_URL = process.env.LLAMACPP_API_URL ?? "http://127.0.0.1:8080/v1"
const PORT = Number(new URL(API_URL).port || 8080)
const SKIP_SERVER = process.env.LLAMACPP_SKIP_SERVER === "1"
const CTX = Number(process.env.LLAMACPP_CTX ?? 8192)

const LIVE = process.env.AGENT_LIVE_E2E === "1"
if (!LIVE) {
  console.log("[agent-e2e] Skipped (set AGENT_LIVE_E2E=1 for slow live run with local LLM).")
  console.log("[agent-e2e] Fast tests: bun test packages/localcoder/test/integration/agent-tools.test.ts")
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
              limit: { context: CTX, output: 4096 },
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

  log(`running: ${prompt.slice(0, 80)}...`)
  const bun = process.execPath
  const proc = Bun.spawn([bun, "run", "--conditions=browser", ...args], {
    cwd: ROOT,
    env: { ...process.env, LLAMACPP_API_URL: API_URL },
    stdout: "pipe",
    stderr: "pipe",
  })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const code = await proc.exited
  if (code !== 0) {
    console.error(stderr.slice(-4000))
    throw new Error(`localcoder run exited ${code}`)
  }
  return { stdout, stderr, tools: collectToolEvents(stdout) }
}

async function main() {
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
    log("starting llama-server (first load may take several minutes)...")
    server = spawn(SERVER_EXE, ["-m", MODEL_PATH, "--host", "127.0.0.1", "--port", String(PORT), "-c", String(CTX)], {
      cwd: LLAMA_DIR,
      stdio: ["ignore", "pipe", "pipe"],
    })
    started = true
    server.stdout?.on("data", (d) => process.stdout.write(d))
    server.stderr?.on("data", (d) => process.stderr.write(d))
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

  const workdir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "localcoder-agent-e2e-"))
  try {
    const modelId = existing ?? (await waitForServer())
    log(`model: ${modelId}`)

    const fetchPrompt =
      "Use the webfetch tool (format text) on https://httpbin.org/json and reply with only the word slideshow if you see it in the response."
    const fetchRun = await runAgent(fetchPrompt, workdir, modelId)
    log(`webfetch tools completed: ${fetchRun.tools.join(", ") || "(none)"}`)
    if (!fetchRun.tools.includes("webfetch")) throw new Error("expected webfetch tool call")

    const pyPath = path.join(workdir, "live_agent_script.py")
    const writePrompt = `Use the write tool to create ${pyPath} with content: print("agent_live_ok"). Then use bash to run: python ${pyPath}`
    const writeRun = await runAgent(writePrompt, workdir, modelId)
    log(`write/bash tools: ${writeRun.tools.join(", ")}`)
    if (!writeRun.tools.includes("write")) throw new Error("expected write tool call")

    const file = Bun.file(pyPath)
    if (!(await file.exists())) throw new Error(`script not created: ${pyPath}`)
    log("ALL AGENT TOOL E2E PASSED")
  } finally {
    cleanup()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
