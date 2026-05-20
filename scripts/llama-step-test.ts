#!/usr/bin/env bun
/** Step-by-step live llama test with visible progress */
import { spawn, type ChildProcess } from "child_process"

const LLAMA_DIR = "P:\\llama cpp\\llama-b9222-bin-win-cuda-13.1-x64"
const EXE = `${LLAMA_DIR}\\llama-server.exe`
const MODEL =
  process.env.LOCALCODER_LLAMACPP_MODEL ?? "P:\\gguf models\\Qwopus3.5-9B-Coder-MTP-Q6_K.gguf"
const LLAMA_ARGS = [
  "-m", MODEL, "--host", "127.0.0.1", "--port", "8080", "-c", "16384",
  "--jinja", "--spec-type", "draft-mtp", "--spec-draft-n-max", "2",
]
const API = "http://127.0.0.1:8080/v1"

const log = (m: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`)

async function probe() {
  const r = await fetch(`${API}/models`, { signal: AbortSignal.timeout(3000) }).catch(() => null)
  if (!r?.ok) return null
  const j = (await r.json()) as { data?: { id: string }[] }
  return j.data?.[0]?.id
}

async function chat(body: object, label: string) {
  log(`API: ${label}...`)
  const t0 = Date.now()
  const res = await fetch(`${API}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  })
  const text = await res.text()
  log(`API: ${label} done in ${((Date.now() - t0) / 1000).toFixed(1)}s status=${res.status}`)
  if (!res.ok) {
    console.log(text.slice(0, 500))
    throw new Error(`${label} failed`)
  }
  const j = JSON.parse(text)
  console.log(JSON.stringify(j.choices?.[0]?.message ?? j, null, 2).slice(0, 800))
  return j
}

let server: ChildProcess | undefined
async function main() {
  let id = await probe()
  if (!id) {
    log(`Starting llama-server: ${MODEL.split("\\").pop()}`)
    server = spawn(EXE, LLAMA_ARGS, {
      cwd: LLAMA_DIR,
      stdio: ["ignore", "pipe", "pipe"],
    })
    server.stderr?.on("data", (d) => {
      const s = d.toString()
      if (/listening on|error|fail/i.test(s)) process.stderr.write(d)
    })
    for (let i = 0; i < 90; i++) {
      id = await probe()
      if (id) break
      if (i % 5 === 0) log(`waiting for server... ${i * 1.5}s`)
      await Bun.sleep(1500)
    }
    if (!id) throw new Error("server did not start")
  }
  log(`Model: ${id}`)

  await chat(
    { model: id, messages: [{ role: "user", content: "Reply with exactly: pong" }], max_tokens: 32, temperature: 0 },
    "plain chat",
  )

  await chat(
    {
      model: id,
      messages: [{ role: "user", content: "Fetch https://httpbin.org/json using the fetch_url tool." }],
      tools: [
        {
          type: "function",
          function: {
            name: "fetch_url",
            description: "Fetch a URL and return text",
            parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
          },
        },
      ],
      tool_choice: "required",
      max_tokens: 256,
      temperature: 0,
    },
    "tool call",
  )

  log("ALL API STEPS OK")
}

main()
  .finally(() => {
    if (server) {
      try {
        spawn("taskkill", ["/pid", String(server.pid), "/f", "/t"], { stdio: "ignore" })
      } catch {}
    }
  })
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
