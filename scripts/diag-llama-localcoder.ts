#!/usr/bin/env bun
/** Stage 1: llama.cpp + GGUF only. Stage 2: LocalCoder + llama.cpp + GGUF. */
import { spawn } from "child_process"
import fs from "fs"
import os from "os"
import path from "path"

const API = process.env.LLAMACPP_API_URL ?? "http://127.0.0.1:8080/v1"
const MODEL = process.env.LLAMACPP_MODEL_ID ?? "Qwopus3.5-9B-Coder-MTP-Q6_K.gguf"
const ROOT = path.join(import.meta.dir, "..", "packages", "localcoder")
const t0 = Date.now()
const log = (stage: string, msg: string) => console.log(`[diag][${stage}][${((Date.now()-t0)/1000).toFixed(1)}s] ${msg}`)

async function post(body: unknown, timeoutMs = 120_000) {
  const sw = Date.now()
  const res = await fetch(`${API}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const ms = Date.now() - sw
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status} in ${ms}ms: ${text.slice(0, 500)}`)
  return { ms, json: JSON.parse(text) as Record<string, unknown> }
}

async function stage1() {
  log("llama", "=== STAGE 1: llama.cpp + GGUF (no LocalCoder) ===")
  const models = await fetch(`${API}/models`, { signal: AbortSignal.timeout(5000) })
  if (!models.ok) throw new Error(`/models failed ${models.status}`)
  log("llama", `/models OK`)

  const chat = await post({ model: MODEL, messages: [{ role: "user", content: "Reply exactly: pong" }], max_tokens: 64, temperature: 0, chat_template_args: { enable_thinking: true } })
  const msg1 = (chat.json.choices as any[])?.[0]?.message
  log("llama", `chat (thinking on) ${chat.ms}ms content=[${(msg1?.content ?? "").slice(0,80)}] rc=[${(msg1?.reasoning_content ?? "").slice(0,60)}]`)

  const chat2 = await post({ model: MODEL, messages: [{ role: "user", content: "Reply exactly: pong2" }], max_tokens: 64, temperature: 0, chat_template_args: { enable_thinking: false } })
  const msg2 = (chat2.json.choices as any[])?.[0]?.message
  log("llama", `chat (thinking off) ${chat2.ms}ms content=[${(msg2?.content ?? "").slice(0,80)}] rc=[${(msg2?.reasoning_content ?? "").slice(0,60)}]`)

  const tools = await post({
    model: MODEL,
    messages: [{ role: "user", content: "Call bash with command echo llama_tool_ok" }],
    max_tokens: 256,
    temperature: 0,
    chat_template_args: { enable_thinking: true },
    tools: [{ type: "function", function: { name: "bash", description: "Run shell", parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } } }],
    tool_choice: "auto",
  }, 180_000)
  const msg3 = (tools.json.choices as any[])?.[0]?.message
  const tc = msg3?.tool_calls?.length ?? 0
  log("llama", `tool call ${tools.ms}ms tool_calls=${tc} content=[${(msg3?.content ?? "").slice(0,60)}]`)
  if (tc > 0) log("llama", `  tool[0]: ${JSON.stringify(msg3.tool_calls[0]).slice(0, 200)}`)
  else log("llama", `  full message: ${JSON.stringify(msg3).slice(0, 400)}`)
}

async function drain(proc: ReturnType<typeof spawn>, timeoutMs: number) {
  let stdout = ""
  let stderr = ""
  if (proc.stdout) proc.stdout.on("data", (c) => { stdout += c.toString() })
  if (proc.stderr) proc.stderr.on("data", (c) => { stderr += c.toString() })
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; try { proc.kill() } catch {} }, timeoutMs)
  const code = await new Promise<number | null>((r) => proc.on("close", (c) => r(c)))
  clearTimeout(timer)
  return { stdout, stderr, code, timedOut }
}

async function stage2() {
  log("lc", "=== STAGE 2: LocalCoder + llama.cpp + GGUF ===")
  const workdir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "lc-diag-"))
  await Bun.write(path.join(workdir, "localcoder.json"), JSON.stringify({
    $schema: "https://localcoder.ai/config.json",
    model: `llamacpp/${MODEL}`,
    provider: {
      llamacpp: {
        npm: "@ai-sdk/openai-compatible",
        options: { baseURL: API, apiKey: "not-needed" },
        models: {
          [MODEL]: {
            tool_call: true,
            reasoning: true,
            interleaved: { field: "reasoning_content" },
            limit: { context: 16384, output: 512 },
          },
        },
      },
    },
    permission: { bash: "allow", edit: "allow" },
    agent: { build: { steps: 4 } },
  }, null, 2))

  // 2a: simple prompt (no tools expected path - just text)
  log("lc", "2a: localcoder run (simple text prompt)...")
  const simple = spawn(process.execPath, ["run", "--conditions=browser", path.join(ROOT, "src/index.ts"), "run", "--dir", workdir, "--model", `llamacpp/${MODEL}`, "--format", "json", "--dangerously-skip-permissions", "Reply exactly: lc_ok"], { cwd: ROOT, env: { ...process.env, LLAMACPP_API_URL: API }, stdio: ["ignore", "pipe", "pipe"] })
  const s1 = await drain(simple, 120_000)
  log("lc", `2a done code=${s1.code} timedOut=${s1.timedOut} stdoutLines=${s1.stdout.split(/\n/).filter(Boolean).length}`)
  if (s1.stderr.trim()) log("lc", `2a stderr tail: ${s1.stderr.slice(-500)}`)
  const textEvts = s1.stdout.split(/\n/).filter((l) => { try { return JSON.parse(l).type === "text" } catch { return false } })
  log("lc", `2a text events: ${textEvts.length}`)

  // 2b: agent bash tool
  log("lc", "2b: localcoder run --agent build (bash tool)...")
  const agent = spawn(process.execPath, ["run", "--conditions=browser", path.join(ROOT, "src/index.ts"), "run", "--dir", workdir, "--model", `llamacpp/${MODEL}`, "--agent", "build", "--format", "json", "--dangerously-skip-permissions", "Use bash tool with command echo lc_agent_ok. Reply done."], { cwd: ROOT, env: { ...process.env, LLAMACPP_API_URL: API }, stdio: ["ignore", "pipe", "pipe"] })
  const s2 = await drain(agent, 180_000)
  log("lc", `2b done code=${s2.code} timedOut=${s2.timedOut}`)
  const tools: string[] = []
  for (const line of s2.stdout.split(/\n/)) {
    if (!line.trim()) continue
    try {
      const e = JSON.parse(line)
      if (e.type === "tool_use" && e.part?.tool && e.part?.state?.status === "completed") tools.push(e.part.tool)
      if (e.type === "error") log("lc", `2b error evt: ${JSON.stringify(e).slice(0, 300)}`)
      if (e.type === "session.error") log("lc", `2b session.error: ${JSON.stringify(e).slice(0, 300)}`)
    } catch {}
  }
  log("lc", `2b tools completed: ${tools.join(", ") || "(none)"}`)
  if (s2.stderr.trim()) log("lc", `2b stderr tail: ${s2.stderr.slice(-800)}`)
}

await stage1()
await stage2()
log("done", "ALL DIAGNOSTIC STAGES COMPLETE")

