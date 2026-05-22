from pathlib import Path
p = Path(r"P:/localcoder/scripts/e2e-llamacpp.ts")
p.write_text(r'''#!/usr/bin/env bun
/**
 * E2E: llama-server + OpenAI-compatible API smoke test.
 *
 * Usage:
 *   bun run scripts/e2e-llamacpp.ts
 *   LLAMACPP_SKIP_SERVER=1 bun run scripts/e2e-llamacpp.ts   # server already running
 */
import { spawn, type ChildProcess } from "child_process"
import path from "path"
import fs from "fs"

const LLAMA_DIR = r"P:\llama cpp\llama-b9284-bin-win-cuda-13.1-x64"
const MODEL_PATH = r"P:\gguf models\Qwen3.6-35B-A3B-Claude-4.7-Opus-Reasoning-Distilled.IQ4_XS.gguf"
const SERVER_EXE = path.join(LLAMA_DIR, "llama-server.exe")
const API_URL = process.env.LLAMACPP_API_URL ?? "http://127.0.0.1:8080/v1"
const PORT = Number(new URL(API_URL).port || 8080)
const CTX = Number(process.env.LLAMACPP_CTX ?? 2048)
const SKIP_SERVER = process.env.LLAMACPP_SKIP_SERVER === "1"

function log(msg: string) {
  console.log(`[e2e-llamacpp] ${msg}`)
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

async function waitForServer(timeoutMs = 600_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const id = await probe()
    if (id) return id
    await Bun.sleep(2000)
  }
  throw new Error("llama-server did not become ready in time")
}

async function chat(modelId: string) {
  const res = await fetch(`${API_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: "user", content: "Say hello in one short sentence." }],
      max_tokens: 64,
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(180_000),
  })
  if (!res.ok) throw new Error(`chat failed: ${res.status} ${await res.text()}`)
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const text = json.choices?.[0]?.message?.content?.trim() ?? ""
  log(`model reply: ${text.slice(0, 300) || "(empty)"}`)
  if (!text) throw new Error(`empty model reply: ${JSON.stringify(json)}`)
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
    throw new Error("LLAMACPP_SKIP_SERVER set but server is not reachable")
  } else {
    log("starting llama-server (auto GPU fit; first load may take a few minutes)...")
    server = spawn(
      SERVER_EXE,
      ["-m", MODEL_PATH, "--host", "127.0.0.1", "--port", String(PORT), "-c", String(CTX)],
      { cwd: LLAMA_DIR, stdio: ["ignore", "pipe", "pipe"] },
    )
    started = true
    server.stdout?.on("data", (d) => process.stdout.write(d))
    server.stderr?.on("data", (d) => process.stderr.write(d))
  }

  const cleanup = () => {
    if (started && server) {
      try {
        server.kill()
      } catch {}
    }
  }
  process.on("exit", cleanup)
  process.on("SIGINT", () => {
    cleanup()
    process.exit(130)
  })

  try {
    const modelId = existing ?? (await waitForServer())
    log(`server ready, model id: ${modelId}`)
    await chat(modelId)
    log("chat/completions OK")
    log("ALL PASSED")
  } finally {
    cleanup()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
''', encoding='utf-8')
print('e2e script updated')
